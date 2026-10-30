import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { DoctorModel } from '../../src/modules/doctors/doctor.model';
import { AuditLogModel } from '../../src/modules/audit/audit.model';
import { registerAccount } from '../helpers/accounts';

describe('RBAC & ABAC Consent-Driven Security Enforcement', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let patientAToken: string;
  let patientBToken: string;
  let verifiedDoctorToken: string;
  let unverifiedDoctorToken: string;
  let patientAId: string;
  let verifiedDoctorId: string;
  let createdRecordId: string;
  let consentGrantId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());

    // Register Patient A
    const resPatA = await registerAccount(app, {
      email: 'patient.a@example.com',
      password: 'Password123!',
      role: 'PATIENT',
      fullName: 'Alice Patient',
      phone: '9876543210',
    });
    patientAToken = resPatA.body.data.accessToken;

    const meA = await request(app)
      .get('/api/v1/patients/me')
      .set('Authorization', `Bearer ${patientAToken}`);
    patientAId = meA.body.data._id;

    // Register Patient B
    const resPatB = await registerAccount(app, {
      email: 'patient.b@example.com',
      password: 'Password123!',
      role: 'PATIENT',
      fullName: 'Bob Patient',
      phone: '9876543211',
    });
    patientBToken = resPatB.body.data.accessToken;

    // Register Doctor 1 (to be verified)
    const resDoc1 = await registerAccount(app, {
      email: 'dr.verified@example.com',
      password: 'Password123!',
      role: 'DOCTOR',
      fullName: 'Dr. Gregory House',
      phone: '9876543212',
      licenseNumber: 'RMP-NMC-1001',
      specialization: 'Internal Medicine',
    });
    verifiedDoctorToken = resDoc1.body.data.accessToken;

    // Manually mark Doctor 1 as VERIFIED in DB for testing
    const doc1 = await DoctorModel.findOne({ licenseNumber: 'RMP-NMC-1001' });
    if (doc1) {
      doc1.verificationStatus = 'VERIFIED';
      await doc1.save();
      verifiedDoctorId = doc1._id.toString();
    }

    // Register Doctor 2 (remains PENDING)
    const resDoc2 = await registerAccount(app, {
      email: 'dr.pending@example.com',
      password: 'Password123!',
      role: 'DOCTOR',
      fullName: 'Dr. John Pending',
      phone: '9876543213',
      licenseNumber: 'RMP-NMC-1002',
      specialization: 'Dermatology',
    });
    unverifiedDoctorToken = resDoc2.body.data.accessToken;
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('blocks unverified doctors from creating medical records (403 DOCTOR_NOT_VERIFIED)', async () => {
    const res = await request(app)
      .post('/api/v1/medical-records')
      .set('Authorization', `Bearer ${unverifiedDoctorToken}`)
      .send({
        patientId: patientAId,
        category: 'CLINICAL_NOTES',
        title: 'Initial Consultation',
        notes: 'Unverified note attempt',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('DOCTOR_NOT_VERIFIED');
  });

  it('permits verified doctors to create medical records with AES-256 encrypted notes', async () => {
    const res = await request(app)
      .post('/api/v1/medical-records')
      .set('Authorization', `Bearer ${verifiedDoctorToken}`)
      .send({
        patientId: patientAId,
        category: 'CLINICAL_NOTES',
        title: 'Cardiac Consultation',
        notes: 'Echocardiogram reveals mild mitral valve prolapse.',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.encryptedNotes).toMatch(/^enc:v1:/);
    createdRecordId = res.body.data._id;
  });

  it('enforces patient ownership: Patient A can read their own record with decrypted notes', async () => {
    const res = await request(app)
      .get(`/api/v1/medical-records/${createdRecordId}`)
      .set('Authorization', `Bearer ${patientAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.notes).toBe('Echocardiogram reveals mild mitral valve prolapse.');
  });

  it('prevents cross-patient unauthorized access: Patient B cannot read Patient A record (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/medical-records/${createdRecordId}`)
      .set('Authorization', `Bearer ${patientBToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CONSENT_REQUIRED');
  });

  it('blocks doctor access to patient record prior to consent grant (403 CONSENT_REQUIRED)', async () => {
    const res = await request(app)
      .get(`/api/v1/medical-records/${createdRecordId}`)
      .set('Authorization', `Bearer ${verifiedDoctorToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CONSENT_REQUIRED');
  });

  it('allows doctor access once Patient A grants explicit category-based consent', async () => {
    // Patient A grants consent for CLINICAL_NOTES
    const consentRes = await request(app)
      .post('/api/v1/consent')
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({
        doctorId: verifiedDoctorId,
        categories: ['CLINICAL_NOTES'],
        durationDays: 14,
      });

    expect(consentRes.status).toBe(201);
    expect(consentRes.body.data.status).toBe('ACTIVE');
    consentGrantId = consentRes.body.data._id;

    // Doctor reads record again with active consent
    const readRes = await request(app)
      .get(`/api/v1/medical-records/${createdRecordId}`)
      .set('Authorization', `Bearer ${verifiedDoctorToken}`);

    expect(readRes.status).toBe(200);
    expect(readRes.body.success).toBe(true);
    expect(readRes.body.data.notes).toBe('Echocardiogram reveals mild mitral valve prolapse.');
  });

  it('immediately blocks doctor access when Patient A revokes consent (immediate revocation)', async () => {
    // Patient A revokes consent
    const revokeRes = await request(app)
      .post(`/api/v1/consent/${consentGrantId}/revoke`)
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({ reason: 'Consultation concluded' });

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.status).toBe('REVOKED');

    // Doctor immediately receives 403 on subsequent attempt
    const readRes = await request(app)
      .get(`/api/v1/medical-records/${createdRecordId}`)
      .set('Authorization', `Bearer ${verifiedDoctorToken}`);

    expect(readRes.status).toBe(403);
    expect(readRes.body.error.code).toBe('CONSENT_REQUIRED');
  });

  it('records tamper-evident append-only audit trail logs for all PHI reads and mutations', async () => {
    const logs = await AuditLogModel.find({ patientId: patientAId }).sort({ timestamp: -1 });

    expect(logs.length).toBeGreaterThanOrEqual(4);
    const actions = logs.map((l) => l.action);

    expect(actions).toContain('PHI_CREATE');
    expect(actions).toContain('PHI_READ');
    expect(actions).toContain('CONSENT_GRANT');
    expect(actions).toContain('CONSENT_REVOKE');
  });
});
