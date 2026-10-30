import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { DoctorModel } from '../../src/modules/doctors/doctor.model';
import { registerAccount } from '../helpers/accounts';

describe('Authenticated Medical File Streaming Proxy Integration', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let patientToken: string;
  let doctorToken: string;
  let patientId: string;
  let doctorId: string;
  let recordId: string;
  let fileId: string;
  let consentId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());

    // Register Patient
    const resPat = await registerAccount(app, {
      email: 'patient.stream@example.com',
      password: 'Password123!',
      role: 'PATIENT',
      fullName: 'John Doe Patient',
      phone: '9876543220',
    });
    patientToken = resPat.body.data.accessToken;

    const mePat = await request(app)
      .get('/api/v1/patients/me')
      .set('Authorization', `Bearer ${patientToken}`);
    patientId = mePat.body.data._id;

    // Register Doctor
    const resDoc = await registerAccount(app, {
      email: 'dr.radiologist@example.com',
      password: 'Password123!',
      role: 'DOCTOR',
      fullName: 'Dr. Raymond Scanlon',
      phone: '9876543221',
      licenseNumber: 'RMP-NMC-RAD-501',
      specialization: 'Radiology',
    });
    doctorToken = resDoc.body.data.accessToken;

    const doc = await DoctorModel.findOne({ licenseNumber: 'RMP-NMC-RAD-501' });
    if (doc) {
      doc.verificationStatus = 'VERIFIED';
      await doc.save();
      doctorId = doc._id.toString();
    }

    // Create medical record with an imaging report attachment
    const recordRes = await request(app)
      .post('/api/v1/medical-records')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId,
        category: 'IMAGING_REPORTS',
        title: 'Chest X-Ray Digital Scan',
        notes: 'Lungs clear, normal cardiothoracic ratio.',
        attachments: [
          {
            originalName: 'chest_xray.png',
            mimeType: 'image/png',
            sizeBytes: 2048,
            storageKey: 'test_chest_xray.png',
            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          },
        ],
      });

    recordId = recordRes.body.data._id;
    fileId = recordRes.body.data.attachments[0].fileId;
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('allows the patient to stream their own medical file directly', async () => {
    const res = await request(app)
      .get(`/api/v1/medical-records/${recordId}/files/${fileId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.header['content-type']).toContain('image/png');
    expect(res.header['content-disposition']).toContain('chest_xray.png');
  });

  it('blocks doctor from streaming file before consent is granted (403 FORBIDDEN)', async () => {
    const res = await request(app)
      .get(`/api/v1/medical-records/${recordId}/files/${fileId}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(403);
  });

  it('allows doctor to stream file when category consent is active', async () => {
    // Grant consent for IMAGING_REPORTS
    const consentRes = await request(app)
      .post('/api/v1/consent')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorId,
        categories: ['IMAGING_REPORTS'],
        durationDays: 7,
      });

    consentId = consentRes.body.data._id;

    const res = await request(app)
      .get(`/api/v1/medical-records/${recordId}/files/${fileId}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.header['content-type']).toContain('image/png');
  });

  it('immediately blocks doctor file stream after patient revokes consent', async () => {
    // Revoke consent
    await request(app)
      .post(`/api/v1/consent/${consentId}/revoke`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ reason: 'File review complete' });

    // Subsequent stream request immediately returns 403
    const res = await request(app)
      .get(`/api/v1/medical-records/${recordId}/files/${fileId}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(403);
  });
});
