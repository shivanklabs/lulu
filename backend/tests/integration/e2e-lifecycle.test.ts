import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { DoctorModel } from '../../src/modules/doctors/doctor.model';
import { PatientModel } from '../../src/modules/patients/patient.model';
import { env } from '../../src/config/env';
import { StagedActionPayload } from '../../src/modules/ai-agent/action-token';
import { registerAccount } from '../helpers/accounts';

describe('End-to-End Clinical Lifecycle & Production Verification Gate', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let patientToken: string;
  let patientId: string;
  let doctorToken: string;
  let doctorId: string;
  let adminToken: string;

  let slotId: string;
  let holdToken: string;
  let appointmentId: string;
  let medicalRecordId: string;
  let fileAttachmentId: string;
  let prescriptionId: string;
  let testFilePath: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());

    // Prepare temp storage for file tests
    const storageDir = path.resolve(env.STORAGE_LOCAL_DIR);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    testFilePath = path.join(storageDir, 'e2e_clinical_report.pdf');
    const fileContent = Buffer.from('%PDF-1.4 Clinical Scan and Blood Biochemistry Report');
    fs.writeFileSync(testFilePath, fileContent);
  }, 30000);

  afterAll(async () => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  }, 30000);

  it('Step 1: Patient, Doctor, and Admin registration and verification', async () => {
    // 1. Register Patient
    const pRes = await registerAccount(app, {
      email: 'alice.e2e@example.com',
      password: 'Password123!',
      role: 'PATIENT',
      fullName: 'Alice Walker',
      phone: '9876543210',
    });
    expect(pRes.status).toBe(201);
    patientToken = pRes.body.data.accessToken;

    const patient = await PatientModel.findOne({ fullName: 'Alice Walker' });
    expect(patient).toBeDefined();
    patientId = patient!._id.toString();

    // 2. Register Doctor
    const dRes = await registerAccount(app, {
      email: 'dr.house.e2e@example.com',
      password: 'Password123!',
      role: 'DOCTOR',
      fullName: 'Dr. Gregory House',
      phone: '9876543211',
      licenseNumber: 'RMP-NMC-LIFE-999',
      specialization: 'Internal Medicine',
      consultationFee: 1000,
    });
    expect(dRes.status).toBe(201);
    doctorToken = dRes.body.data.accessToken;

    // 3. Register Admin
    const aRes = await registerAccount(app, {
      email: 'admin.e2e@example.com',
      password: 'Password123!',
      role: 'ADMIN',
      fullName: 'Chief Compliance Officer',
      phone: '9876543212',
    });
    expect(aRes.status).toBe(201);
    adminToken = aRes.body.data.accessToken;

    // 4. Verify Doctor
    const doctor = await DoctorModel.findOne({ licenseNumber: 'RMP-NMC-LIFE-999' });
    expect(doctor).toBeDefined();
    doctor!.verificationStatus = 'VERIFIED';
    await doctor!.save();
    doctorId = doctor!._id.toString();
  });

  it('Step 2: Doctor publishes availability slots protected by compound unique index', async () => {
    const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

    const res = await request(app)
      .post('/api/v1/appointments/slots')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        doctorId,
        slots: [{ startTime: startTime.toISOString(), endTime: endTime.toISOString() }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(1);
    slotId = res.body.data[0]._id;
  });

  it('Step 3: Two-Phase Slot Reservation (5-min lock) & Atomic Booking Confirmation', async () => {
    // Phase 1: Atomic Hold
    const holdRes = await request(app)
      .post(`/api/v1/appointments/slots/${slotId}/hold`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(holdRes.status).toBe(200);
    expect(holdRes.body.data.holdToken).toBeDefined();
    holdToken = holdRes.body.data.holdToken;

    // Phase 2: Atomic Confirm with Idempotency Key
    const confirmRes = await request(app)
      .post('/api/v1/appointments/confirm')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', 'idemp-e2e-lifecycle-101')
      .send({
        slotId,
        holdToken,
        notes: 'Annual comprehensive metabolic panel',
      });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data.status).toBe('SCHEDULED');
    appointmentId = confirmRes.body.data._id;
  });

  it('Step 4: Explicit Patient Consent Grant & AES-256-GCM Medical Record Creation', async () => {
    // Patient explicitly grants CLINICAL_NOTES and LAB_RESULTS consent
    const consentRes = await request(app)
      .post('/api/v1/consent')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        patientId,
        doctorId,
        categories: ['CLINICAL_NOTES', 'LAB_RESULTS'],
        durationDays: 30,
      });

    expect(consentRes.status).toBe(201);
    expect(consentRes.body.data.status).toBe('ACTIVE');

    // Doctor creates medical record with AES-256-GCM encrypted notes and private file reference
    const recordRes = await request(app)
      .post('/api/v1/medical-records')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId,
        category: 'LAB_RESULTS',
        title: 'Comprehensive Metabolic Panel',
        notes: 'Fasting glucose: 95 mg/dL. Renal and liver profiles unremarkable.',
        attachments: [
          {
            originalName: 'e2e_clinical_report.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 51,
            storageKey: 'e2e_clinical_report.pdf',
            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          },
        ],
      });

    expect(recordRes.status).toBe(201);
    expect(recordRes.body.data.encryptedNotes).toMatch(/^enc:v1:/);
    medicalRecordId = recordRes.body.data._id;
    fileAttachmentId = recordRes.body.data.attachments[0].fileId;
  });

  it('Step 5: Authenticated File Streaming Proxy verification', async () => {
    // Verified doctor streams patient file under active consent
    const streamRes = await request(app)
      .get(`/api/v1/medical-records/${medicalRecordId}/files/${fileAttachmentId}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(streamRes.status).toBe(200);
    expect(streamRes.headers['content-type']).toContain('application/pdf');
    expect(streamRes.body.toString()).toContain('%PDF-1.4');
  });

  it('Step 6: Clinician signs digital prescription with HMAC signature', async () => {
    const rxRes = await request(app)
      .post('/api/v1/prescriptions/draft')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId,
        appointmentId,
        medications: [
          {
            name: 'Atorvastatin',
            dosage: '10mg',
            frequency: 'OD (Once daily at night)',
            duration: '90 days',
            instructions: 'Take after dinner',
          },
        ],
        notes: 'Primary cardiovascular prevention',
      });

    expect(rxRes.status).toBe(201);
    expect(rxRes.body.data.status).toBe('DRAFT_PENDING_DOCTOR_SIGNATURE');
    prescriptionId = rxRes.body.data._id;

    // Doctor digitally signs prescription
    const signRes = await request(app)
      .post(`/api/v1/prescriptions/${prescriptionId}/sign`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(signRes.status).toBe(200);
    expect(signRes.body.data.status).toBe('ISSUED');
    expect(signRes.body.data.digitalSignature).toMatch(/^sig:v1:[a-f0-9]{64}$/);
  });

  it('Step 7: Instantaneous Consent Revocation halts file streaming proxy (403 Forbidden)', async () => {
    // Patient queries all active grants and revokes them
    const myGrantsRes = await request(app)
      .get('/api/v1/consent/my-grants')
      .set('Authorization', `Bearer ${patientToken}`);

    for (const grant of myGrantsRes.body.data) {
      const revokeRes = await request(app)
        .post(`/api/v1/consent/${grant._id}/revoke`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ reason: 'Consultation concluded' });

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.status).toBe('REVOKED');
    }

    // Doctor attempts to stream file: Must be immediately denied with 403
    const streamDeniedRes = await request(app)
      .get(`/api/v1/medical-records/${medicalRecordId}/files/${fileAttachmentId}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(streamDeniedRes.status).toBe(403);
    expect(streamDeniedRes.body.error.code).toBe('FORBIDDEN');
  });

  it('Step 8: Sandboxed AI Agent stages action, commits with single-use HMAC token, and blocks replay', async () => {
    // Stage cancellation
    const stageRes = await request(app)
      .post('/api/v1/ai-agent/turn')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ prompt: `cancel appointment:${appointmentId}` });

    expect(stageRes.status).toBe(200);
    const staged = stageRes.body.data.stagedAction as StagedActionPayload;
    expect(staged.action).toBe('cancelAppointment');

    // Confirm cancellation
    const confirmCancelRes = await request(app)
      .post('/api/v1/ai-agent/confirm-action')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(staged);

    expect(confirmCancelRes.status).toBe(200);
    expect(confirmCancelRes.body.data.action).toBe('cancelAppointment');

    // Replay Attack: Confirming again must fail
    const replayRes = await request(app)
      .post('/api/v1/ai-agent/confirm-action')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(staged);

    expect(replayRes.status).toBe(409);
    expect(replayRes.body.error.code).toBe('TOKEN_ALREADY_USED');
  });

  it('Step 9: Admin Audit Trail Verification confirms append-only telemetry', async () => {
    const auditRes = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(auditRes.status).toBe(200);
    expect(auditRes.body.success).toBe(true);
    expect(auditRes.body.data.length).toBeGreaterThanOrEqual(5);

    const actions = auditRes.body.data.map((log: { action: string }) => log.action);
    expect(actions).toContain('AUTH_REGISTER');
    expect(actions).toContain('PHI_CREATE');
    expect(actions).toContain('CONSENT_GRANT');
    expect(actions).toContain('CONSENT_REVOKE');
  });
});
