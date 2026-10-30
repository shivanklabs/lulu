import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { DoctorModel } from '../../src/modules/doctors/doctor.model';
import { PatientModel } from '../../src/modules/patients/patient.model';
import { SlotModel } from '../../src/modules/appointments/slot.model';
import { StagedActionPayload } from '../../src/modules/ai-agent/action-token';
import { registerAccount } from '../helpers/accounts';

describe('Sandboxed AI Agent & HMAC Single-Use Action Confirmation', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let patientToken: string;
  let doctorToken: string;
  let slotId: string;
  let holdToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());

    // Register Patient
    const pRes = await registerAccount(app, {
      email: 'agent.patient@example.com',
      password: 'Password123!',
      role: 'PATIENT',
      fullName: 'Agent Patient Alice',
      phone: '9876543210',
    });
    patientToken = pRes.body.data.accessToken;

    // Register & Verify Doctor
    const dRes = await registerAccount(app, {
      email: 'dr.agent@example.com',
      password: 'Password123!',
      role: 'DOCTOR',
      fullName: 'Dr. Gregory Agent',
      phone: '9876543211',
      licenseNumber: 'RMP-AI-AGENT-001',
      specialization: 'Neurology',
      consultationFee: 750,
    });
    doctorToken = dRes.body.data.accessToken;

    const doctor = await DoctorModel.findOne({ licenseNumber: 'RMP-AI-AGENT-001' });
    if (doctor) {
      doctor.verificationStatus = 'VERIFIED';
      await doctor.save();

      // Create a slot
      const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
      const slot = await SlotModel.create({
        doctorId: doctor._id,
        startTime,
        endTime,
        status: 'AVAILABLE',
      });
      slotId = slot._id.toString();

      // Acquire Phase 1 hold
      const holdRes = await request(app)
        .post(`/api/v1/appointments/slots/${slotId}/hold`)
        .set('Authorization', `Bearer ${patientToken}`);
      holdToken = holdRes.body.data.holdToken;
    }
  }, 30000);

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  }, 30000);

  it('executes read-only tools directly under patient session', async () => {
    const res = await request(app)
      .post('/api/v1/ai-agent/turn')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ prompt: 'show slots available for neurology' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.toolUsed).toBe('findAvailableSlots');
  });

  it('consequential action returns uncommitted stage response with single-use HMAC token', async () => {
    const res = await request(app)
      .post('/api/v1/ai-agent/turn')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ prompt: `book slot:${slotId} hold:${holdToken}` });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.toolUsed).toBe('stageAppointmentBooking');
    expect(res.body.data.stagedAction).toBeDefined();

    const staged = res.body.data.stagedAction as StagedActionPayload;
    expect(staged.action).toBe('initiateAppointmentBooking');
    expect(staged.nonce).toHaveLength(32);
    expect(staged.confirmationToken).toHaveLength(64);
    expect(staged.expiresAt).toBeDefined();
  });

  it('commits staged action upon user confirmation and prevents replay attacks', async () => {
    // Stage booking
    const stageRes = await request(app)
      .post('/api/v1/ai-agent/turn')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ prompt: `book slot:${slotId} hold:${holdToken}` });

    const staged = stageRes.body.data.stagedAction as StagedActionPayload;

    // Confirm booking
    const confirmRes = await request(app)
      .post('/api/v1/ai-agent/confirm-action')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(staged);

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);
    expect(confirmRes.body.data.action).toBe('initiateAppointmentBooking');

    // REPLAY ATTACK: Re-sending exact same confirmation token must fail with 409
    const replayRes = await request(app)
      .post('/api/v1/ai-agent/confirm-action')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(staged);

    expect(replayRes.status).toBe(409);
    expect(replayRes.body.error.code).toBe('TOKEN_ALREADY_USED');
  });

  it('rejects tampered payloads with 403 INVALID_CONFIRMATION_TOKEN', async () => {
    const stageRes = await request(app)
      .post('/api/v1/ai-agent/turn')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ prompt: `cancel appointment:${slotId}` });

    const staged = stageRes.body.data.stagedAction as StagedActionPayload;

    // Tamper with payload
    const tampered = {
      ...staged,
      payload: { ...staged.payload, maliciousField: true },
    };

    const res = await request(app)
      .post('/api/v1/ai-agent/confirm-action')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(tampered);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_CONFIRMATION_TOKEN');
  });

  it('rejects expired tokens with 400 TOKEN_EXPIRED', async () => {
    const stageRes = await request(app)
      .post('/api/v1/ai-agent/turn')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ prompt: `cancel appointment:${slotId}` });

    const staged = stageRes.body.data.stagedAction as StagedActionPayload;

    // Simulate expired timestamp (5 minutes in past)
    const expiredStaged = {
      ...staged,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };

    const res = await request(app)
      .post('/api/v1/ai-agent/confirm-action')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(expiredStaged);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('enforces RBAC: non-doctor attempting to draft prescription is rejected with 403', async () => {
    const res = await request(app)
      .post('/api/v1/ai-agent/turn')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ prompt: 'draft prescription for patient:507f1f77bcf86cd799439011' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('DOCTOR_ROLE_REQUIRED');
  });

  it('allows verified doctor to stage draft prescription', async () => {
    const patient = await PatientModel.findOne({ fullName: 'Agent Patient Alice' });

    const res = await request(app)
      .post('/api/v1/ai-agent/turn')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ prompt: `draft prescription for patient:${patient?._id}` });

    expect(res.status).toBe(200);
    expect(res.body.data.toolUsed).toBe('stageDraftPrescription');
    expect(res.body.data.stagedAction).toBeDefined();
    expect(res.body.data.stagedAction.action).toBe('draftPrescription');
  });

  it('does NOT stage action when parameters are omitted and provides prompt guidance without mock IDs', async () => {
    const res = await request(app)
      .post('/api/v1/ai-agent/turn')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ prompt: 'I want to book an appointment' });

    expect(res.status).toBe(200);
    expect(res.body.data.stagedAction).toBeUndefined();
    expect(res.body.data.reply).toContain('To stage an appointment booking, please provide both a valid 24-character slot ID');
    expect(res.body.data.limitations).toContain('Real provider-native LLM tool-calling is not currently active');
  });

  it('rejects invalid ObjectId parameters with 400 INVALID_PARAMETER', async () => {
    const res = await request(app)
      .post('/api/v1/ai-agent/turn')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ prompt: 'draft prescription for patient:invalid-not-24-hex' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PARAMETER');
  });
});
