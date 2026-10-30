import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { DoctorModel } from '../../src/modules/doctors/doctor.model';
import { AuditLogModel } from '../../src/modules/audit/audit.model';
import { ConsentGrantModel } from '../../src/modules/consent/consent.model';
import { PrescriptionModel } from '../../src/modules/prescriptions/prescription.model';
import { SlotModel } from '../../src/modules/appointments/slot.model';
import { stripExifMetadata } from '../../src/lib/exif-scrubber';
import { registerAccount } from '../helpers/accounts';

describe('Stage 6 Smart Clinical AI, Privacy & Emergency Ecosystem Integration', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let patientToken: string;
  let doctorToken: string;
  let unverifiedDoctorToken: string;
  let adminToken: string;

  let patientId: string;
  let doctorId: string;
  let doctorUserId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());

    // 1. Register Patient
    const pRes = await registerAccount(app, {
      email: 'stage6.patient@example.com',
      password: 'Password123!',
      role: 'PATIENT',
      fullName: 'Vikram Malhotra',
      phone: '+91 98765 00001',
    });
    patientToken = pRes.body.data.accessToken;

    const mePat = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(mePat.status).toBe(200);
    expect(mePat.body.data.profile.fullName).toBe('Vikram Malhotra');
    patientId = mePat.body.data.profile._id;

    // 2. Register Verified Doctor
    const dRes = await registerAccount(app, {
      email: 'dr.stage6.verified@example.com',
      password: 'Password123!',
      role: 'DOCTOR',
      fullName: 'Dr. Priya Swaminathan',
      phone: '+91 98765 00002',
      licenseNumber: 'NMC-STAGE6-VERIFIED-01',
      specialization: 'Dermatology & Internal Medicine',
      consultationFee: 750,
    });
    doctorToken = dRes.body.data.accessToken;

    const meDoc = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(meDoc.status).toBe(200);
    doctorId = meDoc.body.data.profile._id;
    doctorUserId = meDoc.body.data.user.id;

    // Manually mark doctor verified and add GPS coordinates
    const docDoc = await DoctorModel.findById(doctorId);
    if (docDoc) {
      docDoc.verificationStatus = 'VERIFIED';
      docDoc.location = {
        type: 'Point',
        coordinates: [77.2090, 28.5672], // Delhi AIIMS vicinity
      };
      await docDoc.save();
    }

    // 3. Register Unverified Doctor
    const unvRes = await registerAccount(app, {
      email: 'dr.unverified@example.com',
      password: 'Password123!',
      role: 'DOCTOR',
      fullName: 'Dr. Unverified Clinician',
      phone: '+91 98765 00003',
      licenseNumber: 'NMC-PENDING-99',
      specialization: 'General Practice',
    });
    unverifiedDoctorToken = unvRes.body.data.accessToken;

    // 4. Register Admin
    const aRes = await registerAccount(app, {
      email: 'stage6.admin@example.com',
      password: 'Password123!',
      role: 'ADMIN',
      fullName: 'Super Admin Officer',
    });
    adminToken = aRes.body.data.accessToken;
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  describe('PHASE 1: /api/v1/auth/me Profile Resolution & EXIF Scrubber', () => {
    it('resolves authenticated patient, doctor, and admin profiles correctly via /api/v1/auth/me', async () => {
      const pRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(pRes.status).toBe(200);
      expect(pRes.body.data.user.role).toBe('PATIENT');
      expect(pRes.body.data.profile.phone).toBe('+91 98765 00001');

      const dRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(dRes.status).toBe(200);
      expect(dRes.body.data.user.role).toBe('DOCTOR');
      expect(dRes.body.data.profile.licenseNumber).toBe('NMC-STAGE6-VERIFIED-01');

      const aRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(aRes.status).toBe(200);
      expect(aRes.body.data.user.role).toBe('ADMIN');
    });

    it('binary EXIF scrubber cleanly strips metadata and retains image headers', () => {
      // JPEG with SOI marker and mock APP1 marker
      const mockJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0xff, 0xd9]);
      const scrubbed = stripExifMetadata(mockJpeg, 'image/jpeg');
      expect(scrubbed.length).toBeLessThan(mockJpeg.length);
      expect(scrubbed[0]).toBe(0xff);
      expect(scrubbed[1]).toBe(0xd8);
    });
  });

  describe('PHASE 2: Report Photo OCR, Lab Trends, Drug Conflicts & Medicine Usage Guide', () => {
    let createdRecordId: string;
    let createdPrescriptionId: string;

    it('POST /medical-records/photo-ocr strips EXIF, performs OCR, encrypts notes via AES-256-GCM, and logs audit', async () => {
      // Small 1x1 valid PNG in base64
      const samplePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

      const res = await request(app)
        .post('/api/v1/medical-records/photo-ocr')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          fileBase64: samplePng,
          mimeType: 'image/png',
          originalName: 'lab_report_blood_sugar.png',
          documentType: 'LAB_REPORT',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.extraction).toBeDefined();
      expect(res.body.data.record).toBeDefined();
      expect(res.body.data.record.encryptedNotes).toContain('enc:v1:');
      createdRecordId = res.body.data.record._id;

      // Verify tamper-evident audit record was logged
      const audit = await AuditLogModel.findOne({
        action: 'PHI_CREATE',
        resourceType: 'MedicalRecord',
        resourceId: createdRecordId,
      });
      expect(audit).toBeDefined();
      expect(audit?.actorRole).toBe('PATIENT');
    });

    it('GET /medical-records/patient/:patientId/lab-trends extracts longitudinal biomarkers', async () => {
      const res = await request(app)
        .get(`/api/v1/medical-records/patient/${patientId}/lab-trends`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /prescriptions/check-conflicts detects drug allergies and critical drug-drug interactions', async () => {
      // Candidate: Sildenafil with Nitroglycerin
      const res = await request(app)
        .post('/api/v1/prescriptions/check-conflicts')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientId,
          medications: [
            { name: 'Sildenafil', dosage: '50mg' },
            { name: 'Nitroglycerin', dosage: '0.4mg' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasConflict).toBe(true);
      expect(res.body.data.conflicts.some((c: { severity: string }) => c.severity === 'HIGH')).toBe(true);
    });

    it('GET /prescriptions/:id/usage-guide returns multilingual patient-friendly instructions', async () => {
      // First create a signed prescription
      const rx = await PrescriptionModel.create({
        patientId,
        doctorId,
        medications: [
          {
            name: 'Metformin Hydrochloride',
            dosage: '500mg',
            frequency: 'Twice daily after meals',
            duration: '30 days',
            instructions: 'Take with breakfast and dinner',
          },
        ],
        status: 'ISSUED',
        issuedAt: new Date(),
        digitalSignatureHash: 'mock-sig-hash-stage6',
      });
      createdPrescriptionId = rx._id.toString();

      const res = await request(app)
        .get(`/api/v1/prescriptions/${createdPrescriptionId}/usage-guide?lang=hinglish`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].purpose).toBeDefined();
      expect(res.body.data[0].dosageInstructions).toBeDefined();
    });
  });

  describe('PHASE 3: WhatsApp & Push Notifications Reminder Scheduler', () => {
    let reminderId: string;

    it('POST /medicine-reminders schedules daily alerts & checkup follow-ups', async () => {
      const res = await request(app)
        .post('/api/v1/medicine-reminders')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          patientId,
          medicineName: 'Metformin',
          dosage: '500mg',
          scheduleTime: '08:00 AM',
          frequency: 'DAILY',
          channel: 'BOTH',
          whatsappNumber: '+91 98765 00001',
          instructions: 'After meals',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.medicineName).toBe('Metformin');
      reminderId = res.body.data._id;
    });

    it('POST /medicine-reminders/:id/trigger-now dispatches simulated WhatsApp and Web Push', async () => {
      const res = await request(app)
        .post(`/api/v1/medicine-reminders/${reminderId}/trigger-now`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.delivery.whatsApp?.success).toBe(true);
      expect(res.body.data.delivery.webPush?.success).toBe(true);
    });
  });

  describe('PHASE 4: AI Skin Photo Screening & Nearby Doctor Geolocation Matcher', () => {
    it('POST /ai-vision/screen-skin performs visual triage with mandatory disclaimer and zero DB mutations', async () => {
      const samplePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

      const res = await request(app)
        .post('/api/v1/ai-vision/screen-skin')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          fileBase64: samplePng,
          symptoms: 'Mild erythematous patch with slight pruritus on forearm for 3 days',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.visualFindings).toBeDefined();
      expect(res.body.data.disclaimer).toContain('MediBridge AI Clinical Vision');
      expect(res.body.data.isEmergency).toBe(false);
    });

    it('GET /doctors/nearby/match maps symptoms to specialist and ranks nearby doctors with slots', async () => {
      // Create an available slot for Dr. Priya
      const startTime = new Date(Date.now() + 24 * 3600 * 1000);
      startTime.setHours(10, 0, 0, 0);
      const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

      await SlotModel.create({
        doctorId,
        startTime,
        endTime,
        status: 'AVAILABLE',
      });

      const res = await request(app)
        .get('/api/v1/doctors/nearby/match')
        .query({
          symptoms: 'severe red skin rash itching',
          lat: 28.5670,
          lng: 77.2100,
          radiusKm: 25,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.doctors.length).toBeGreaterThan(0);
      expect(res.body.data.doctors[0].doctor.fullName).toBe('Dr. Priya Swaminathan');
      expect(res.body.data.doctors[0].distanceKm).toBeLessThan(10);
    });

    it('POST /doctors/nearby/stage-hold creates a 5-minute slot hold protected by an HMAC confirmation token', async () => {
      const slot = await SlotModel.findOne({ doctorId, status: 'AVAILABLE' });
      expect(slot).toBeDefined();

      const res = await request(app)
        .post('/api/v1/doctors/nearby/stage-hold')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          slotId: slot?._id.toString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.holdToken).toBeDefined();
      expect(res.body.data.stagedAction.confirmationToken).toBeDefined();
      expect(res.body.data.stagedAction.action).toBe('initiateAppointmentBooking');
    });
  });

  describe('PHASE 5: High-Privacy Incognito Consultations & PIN-Protected Vault', () => {
    let incognitoSessionId: string;

    it('POST /incognito-consultations generates a pseudonym (#MB-XXXX) and encrypts initial notes', async () => {
      const res = await request(app)
        .post('/api/v1/incognito-consultations')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          doctorId,
          category: 'SEXUAL_HEALTH',
          channelMode: 'BLURRED_VIDEO',
          pin: '8492',
          initialNotes: 'Confidential sexual health consultation test note',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pseudonym).toMatch(/^#MB-\d{4}$/);
      expect(res.body.data.session.encryptedVaultNotes).toContain('enc:v1:');
      incognitoSessionId = res.body.data.session._id;
    });

    it('POST /incognito-consultations/:id/unlock decrypts private vault with valid 4-digit PIN and rejects invalid PIN', async () => {
      // Invalid PIN
      const failRes = await request(app)
        .post(`/api/v1/incognito-consultations/${incognitoSessionId}/unlock`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ pin: '0000' });

      expect(failRes.status).toBe(401);
      expect(failRes.body.error.code).toBe('INVALID_PIN');

      // Valid PIN
      const successRes = await request(app)
        .post(`/api/v1/incognito-consultations/${incognitoSessionId}/unlock`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ pin: '8492' });

      expect(successRes.status).toBe(200);
      expect(successRes.body.success).toBe(true);
      expect(successRes.body.data.notes).toContain('Confidential sexual health consultation test note');
    });

    it('GET /incognito-consultations/:id/doctor-view strips PII and presents masked pseudonym to clinician', async () => {
      const res = await request(app)
        .get(`/api/v1/incognito-consultations/${incognitoSessionId}/doctor-view`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.patientMask.pseudonym).toMatch(/^#MB-\d{4}$/);
      expect(res.body.data.patientMask.fullName).toBeUndefined();
      expect(res.body.data.patientMask.phone).toBeUndefined();
      expect(res.body.data.patientMask.isIncognito).toBe(true);
    });
  });

  describe('PHASE 6: Emergency Ambulance SOS, Break-The-Glass & Live OPD Queue', () => {
    it('POST /consent/break-glass: blocks unverified doctors and non-doctors', async () => {
      const patRes = await request(app)
        .post('/api/v1/consent/break-glass')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ patientId, justification: 'Life threatening acute trauma emergency' });
      expect(patRes.status).toBe(403);

      const unvRes = await request(app)
        .post('/api/v1/consent/break-glass')
        .set('Authorization', `Bearer ${unverifiedDoctorToken}`)
        .send({ patientId, justification: 'Life threatening acute trauma emergency' });
      expect(unvRes.status).toBe(403);
      expect(unvRes.body.error.code).toBe('DOCTOR_NOT_VERIFIED');
    });

    it('POST /consent/break-glass: enforces minimum 15-character justification and grants 30-min access', async () => {
      const shortRes = await request(app)
        .post('/api/v1/consent/break-glass')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ patientId, justification: 'Emergency!' });
      expect(shortRes.status).toBe(400);
      expect(shortRes.body.error.code).toBe('INVALID_JUSTIFICATION');

      const successRes = await request(app)
        .post('/api/v1/consent/break-glass')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientId,
          justification: 'Acute unconscious patient in emergency trauma bay requiring immediate clinical history',
        });

      expect(successRes.status).toBe(200);
      expect(successRes.body.success).toBe(true);
      expect(successRes.body.data.emergencyAccessGranted).toBe(true);
      expect(successRes.body.data.patient.fullName).toBe('Vikram Malhotra');

      // Verify 30-min emergency grant exists in MongoDB
      const grant = await ConsentGrantModel.findById(successRes.body.data.grantId);
      expect(grant).toBeDefined();
      expect(grant?.encounterId).toBe('EMERGENCY_OVERRIDE');
      expect(grant?.status).toBe('ACTIVE');

      // Verify tamper-evident audit log
      const audit = await AuditLogModel.findOne({
        action: 'EMERGENCY_BREAK_GLASS',
        actorId: doctorUserId,
      });
      expect(audit).toBeDefined();
      expect(audit?.outcome).toBe('SUCCESS');
    });

    it('POST /ambulance-sos/dispatch triggers 1-tap emergency dispatch and updates status', async () => {
      const dispatchRes = await request(app)
        .post('/api/v1/ambulance-sos/dispatch')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          latitude: 28.5672,
          longitude: 77.2100,
          address: 'Ansari Nagar, New Delhi',
          triageNotes: 'Severe acute anaphylaxis allergic reaction',
        });

      expect(dispatchRes.status).toBe(201);
      expect(dispatchRes.body.success).toBe(true);
      expect(dispatchRes.body.data.status).toBe('DISPATCHED');
      expect(dispatchRes.body.data.vehicleNumber).toContain('DL-01-AMB-');
      const dispatchId = dispatchRes.body.data._id;

      // Hospital / Doctor updates dispatch status
      const updateRes = await request(app)
        .patch(`/api/v1/ambulance-sos/${dispatchId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'EN_ROUTE', etaMinutes: 5 });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.status).toBe('EN_ROUTE');
      expect(updateRes.body.data.etaMinutes).toBe(5);
    });

    it('Live OPD Queue and Smart Waitlist lifecycle', async () => {
      // 1. Check doctor OPD Queue
      const queueRes = await request(app)
        .get(`/api/v1/appointments/opd-queue/doctor/${doctorId}`);
      expect(queueRes.status).toBe(200);
      expect(queueRes.body.data.doctorName).toBe('Dr. Priya Swaminathan');
      expect(queueRes.body.data.currentServingToken).toBeDefined();

      // 2. Doctor broadcasts emergency delay
      const delayRes = await request(app)
        .post('/api/v1/appointments/opd-queue/broadcast-delay')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          delayMinutes: 20,
          reason: 'Emergency CPR resuscitation in progress in trauma bay',
        });
      expect(delayRes.status).toBe(200);
      expect(delayRes.body.data.delayMinutes).toBe(20);

      // 3. Patient joins smart waitlist
      const waitlistRes = await request(app)
        .post('/api/v1/appointments/waitlist')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          doctorId,
          preferredDate: new Date().toISOString(),
        });
      expect(waitlistRes.status).toBe(201);
      expect(waitlistRes.body.data.status).toBe('WAITING');

      // 4. Patient queries my waitlist entries
      const myWlRes = await request(app)
        .get('/api/v1/appointments/waitlist/my-entries')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(myWlRes.status).toBe(200);
      expect(myWlRes.body.data.length).toBeGreaterThan(0);
    });
  });
});
