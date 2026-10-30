import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { env } from '../../src/config/env';
import { DoctorModel } from '../../src/modules/doctors/doctor.model';
import { NotificationModel } from '../../src/modules/notifications/notification.model';
import { PrescriptionModel } from '../../src/modules/prescriptions/prescription.model';
import { verifyPrescriptionSignature } from '../../src/modules/prescriptions/prescription.service';
import { registerAccount } from '../helpers/accounts';

describe('Prescription Clinical Workflow & Digital Signature Verification', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let patientToken: string;
  let doctorToken: string;
  let patientId: string;
  let prescriptionId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());

    // Register Patient
    const pRes = await registerAccount(app, {
      email: 'prescription.patient@example.com',
      password: 'Password123!',
      role: 'PATIENT',
      fullName: 'Emily Clark',
      phone: '9876543401',
    });
    patientToken = pRes.body.data.accessToken;

    const mePat = await request(app)
      .get('/api/v1/patients/me')
      .set('Authorization', `Bearer ${patientToken}`);
    patientId = mePat.body.data._id;

    // Register Doctor
    const dRes = await registerAccount(app, {
      email: 'dr.prescriber@example.com',
      password: 'Password123!',
      role: 'DOCTOR',
      fullName: 'Dr. Leonard McCoy',
      phone: '9876543402',
      licenseNumber: 'RMP-NMC-RX-999',
      specialization: 'Pharmacology & General Medicine',
    });
    doctorToken = dRes.body.data.accessToken;

    const doctor = await DoctorModel.findOne({ licenseNumber: 'RMP-NMC-RX-999' });
    if (doctor) {
      doctor.verificationStatus = 'VERIFIED';
      await doctor.save();
    }
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('clinician drafts prescription in DRAFT_PENDING_DOCTOR_SIGNATURE status', async () => {
    const res = await request(app)
      .post('/api/v1/prescriptions/draft')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId,
        medications: [
          {
            name: 'Metformin Hydrochloride',
            dosage: '500mg',
            frequency: 'Twice daily after meals',
            duration: '30 days',
            instructions: 'Monitor fasting blood glucose levels weekly.',
          },
        ],
        notes: 'Initial glycemic management plan.',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('DRAFT_PENDING_DOCTOR_SIGNATURE');
    expect(res.body.data.digitalSignature).toBeUndefined();
    prescriptionId = res.body.data._id;
  });

  it('verified doctor digitally signs and issues prescription with cryptographic signature hash', async () => {
    const res = await request(app)
      .post(`/api/v1/prescriptions/${prescriptionId}/sign`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ISSUED');
    expect(res.body.data.digitalSignature).toMatch(/^sig:v1:[0-9a-f]{64}$/); // Versioned 256-bit HMAC envelope
    expect(res.body.data.signedAt).toBeDefined();
  });

  it('triggers an in-app notification to the patient upon prescription issuance', async () => {
    const notifications = await NotificationModel.find({ type: 'PRESCRIPTION_ISSUED' });
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].title).toBe('Prescription Issued');
  });

  it('allows the patient to view their issued prescription', async () => {
    const res = await request(app)
      .get(`/api/v1/prescriptions/${prescriptionId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ISSUED');
    expect(res.body.data.medications[0].name).toBe('Metformin Hydrochloride');
    expect(res.body.data.digitalSignature).toBeDefined();
  });

  it('verifies prescription integrity digest using dedicated PRESCRIPTION_SIGNING_KEY', async () => {
    const prescription = await PrescriptionModel.findById(prescriptionId);
    expect(prescription).not.toBeNull();
    if (!prescription) return;

    const isValid = verifyPrescriptionSignature(prescription, 'RMP-NMC-RX-999');
    expect(isValid).toBe(true);

    const isTampered = verifyPrescriptionSignature(prescription, 'DIFFERENT-LICENSE-123');
    expect(isTampered).toBe(false);
  });

  it('supports future key rotation through a controlled verification keyring without invalidating historical signatures', async () => {
    const prescription = await PrescriptionModel.findById(prescriptionId);
    expect(prescription).not.toBeNull();
    if (!prescription || !prescription.signedAt) return;

    // Simulate key rotation: keyring now contains v1 and a new v2 key
    const rotatedKeyring = {
      v1: env.PRESCRIPTION_SIGNING_KEY,
      v2: 'new_rotated_prescription_signing_key_32_chars!',
    };

    // Historical v1 signature continues to verify cleanly
    const isV1Valid = verifyPrescriptionSignature(prescription, 'RMP-NMC-RX-999', rotatedKeyring);
    expect(isV1Valid).toBe(true);

    // Create a new signature signed with v2 key
    const payloadToSign = `${prescription.doctorId}:${prescription.patientId}:${JSON.stringify(prescription.medications)}:${prescription.signedAt.toISOString()}:RMP-NMC-RX-999`;
    const v2Hmac = crypto
      .createHmac('sha256', rotatedKeyring.v2)
      .update(payloadToSign)
      .digest('hex');

    const v2Prescription = {
      ...prescription.toObject(),
      digitalSignature: `sig:v2:${v2Hmac}`,
    } as typeof prescription;

    // Both v1 and v2 verify successfully against the rotated keyring
    const isV2Valid = verifyPrescriptionSignature(v2Prescription, 'RMP-NMC-RX-999', rotatedKeyring);
    expect(isV2Valid).toBe(true);

    // Unrecognized key version fails closed
    const unknownVersionPrescription = {
      ...prescription.toObject(),
      digitalSignature: `sig:v999:${v2Hmac}`,
    } as typeof prescription;
    const isUnknownValid = verifyPrescriptionSignature(unknownVersionPrescription, 'RMP-NMC-RX-999', rotatedKeyring);
    expect(isUnknownValid).toBe(false);
  });

  it('supports backward-compatible verification for legacy unversioned prescriptions signed with JWT_ACCESS_SECRET', async () => {
    const prescription = await PrescriptionModel.findById(prescriptionId);
    expect(prescription).not.toBeNull();
    if (!prescription || !prescription.signedAt) return;

    // Simulate legacy unversioned 64-hex signature created with JWT_ACCESS_SECRET
    const payloadToSign = `${prescription.doctorId}:${prescription.patientId}:${JSON.stringify(prescription.medications)}:${prescription.signedAt.toISOString()}:RMP-NMC-RX-999`;
    const legacySignature = crypto
      .createHmac('sha256', env.JWT_ACCESS_SECRET)
      .update(payloadToSign)
      .digest('hex');

    const legacyPrescription = {
      ...prescription.toObject(),
      digitalSignature: legacySignature,
    } as typeof prescription;

    const isValidLegacy = verifyPrescriptionSignature(legacyPrescription, 'RMP-NMC-RX-999');
    expect(isValidLegacy).toBe(true);
  });
});
