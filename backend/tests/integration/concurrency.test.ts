import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { env } from '../../src/config/env';
import { DoctorModel } from '../../src/modules/doctors/doctor.model';
import { SlotModel } from '../../src/modules/appointments/slot.model';
import { AppointmentModel } from '../../src/modules/appointments/appointment.model';
import { ConsentGrantModel } from '../../src/modules/consent/consent.model';
import { registerAccount } from '../helpers/accounts';

describe('Appointment Concurrency & Slot Double-Booking Prevention', () => {
  let mongoServer: MongoMemoryReplSet;
  const app = createApp();

  let verifiedDoctorToken: string;
  let doctorId: string;
  let targetSlotId: string;
  let activeHoldToken: string;
  const patientTokens: string[] = [];

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDatabase(mongoServer.getUri());

    // Register Doctor
    const docRes = await registerAccount(app, {
      email: 'dr.concurrency@example.com',
      password: 'Password123!',
      role: 'DOCTOR',
      fullName: 'Dr. Concurrency Specialist',
      phone: '9876543300',
      licenseNumber: 'RMP-NMC-CONC-101',
      specialization: 'Neurology',
      consultationFee: 750,
    });
    verifiedDoctorToken = docRes.body.data.accessToken;

    const doctor = await DoctorModel.findOne({ licenseNumber: 'RMP-NMC-CONC-101' });
    if (doctor) {
      doctor.verificationStatus = 'VERIFIED';
      await doctor.save();
      doctorId = doctor._id.toString();
    }

    // Publish single appointment slot
    const slotStartTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
    const slotEndTime = new Date(slotStartTime.getTime() + 30 * 60 * 1000);

    const slotRes = await request(app)
      .post('/api/v1/appointments/slots')
      .set('Authorization', `Bearer ${verifiedDoctorToken}`)
      .send({
        doctorId,
        slots: [{ startTime: slotStartTime.toISOString(), endTime: slotEndTime.toISOString() }],
      });

    targetSlotId = slotRes.body.data[0]._id;

    // Register 10 distinct patients for parallel concurrency stress test
    for (let i = 1; i <= 10; i++) {
      const pRes = await registerAccount(app, {
        email: `concurrency.patient${i}@example.com`,
        password: 'Password123!',
        role: 'PATIENT',
        fullName: `Patient Tester ${i}`,
        phone: `987654000${i}`,
      });
      patientTokens.push(pRes.body.data.accessToken);
    }
  }, 60000);

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  }, 30000);

  it('PARALLEL CONFLICT: 10 concurrent requests for the same slot results in exactly 1 hold and 9 conflicts (409)', async () => {
    // Dispatch 10 parallel HTTP requests simultaneously
    const holdPromises = patientTokens.map((token) =>
      request(app)
        .post(`/api/v1/appointments/slots/${targetSlotId}/hold`)
        .set('Authorization', `Bearer ${token}`)
    );

    const responses = await Promise.all(holdPromises);

    const successResponses = responses.filter((r) => r.status === 200);
    const conflictResponses = responses.filter((r) => r.status === 409);

    // Exactly 1 winner acquires the checkout lock
    expect(successResponses.length).toBe(1);
    expect(successResponses[0].body.success).toBe(true);
    expect(successResponses[0].body.data.holdToken).toBeDefined();

    // Exactly 9 competing attempts receive 409 Conflict
    expect(conflictResponses.length).toBe(9);
    for (const conflict of conflictResponses) {
      expect(conflict.body.error.code).toBe('SLOT_UNAVAILABLE');
    }
  });

  it('reclaims expired holds: when heldUntil expires, another patient can acquire the slot', async () => {
    // Manually expire the hold in MongoDB (simulate 5-minute timeout elapse)
    await SlotModel.findByIdAndUpdate(targetSlotId, {
      heldUntil: new Date(Date.now() - 1000), // 1 second in the past
    });

    // Patient 2 attempts to acquire the slot after expiry
    const res = await request(app)
      .post(`/api/v1/appointments/slots/${targetSlotId}/hold`)
      .set('Authorization', `Bearer ${patientTokens[1]}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.holdToken).toBeDefined();
    activeHoldToken = res.body.data.holdToken;
  });

  it('confirms booking atomically and enforces idempotency with Idempotency-Key header', async () => {
    const holdToken = activeHoldToken;
    const idempotencyKey = `idemp-key-${Date.now()}`;

    // Confirm booking
    const confirmRes1 = await request(app)
      .post('/api/v1/appointments/confirm')
      .set('Authorization', `Bearer ${patientTokens[1]}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        slotId: targetSlotId,
        holdToken,
        notes: 'Recurring migraine consultation',
      });

    expect(confirmRes1.status).toBe(201);
    expect(confirmRes1.body.data.status).toBe('SCHEDULED');
    const appointmentId = confirmRes1.body.data._id;

    // Retry identical request with same idempotency key (simulating network drop retry)
    const confirmRes2 = await request(app)
      .post('/api/v1/appointments/confirm')
      .set('Authorization', `Bearer ${patientTokens[1]}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        slotId: targetSlotId,
        holdToken,
        notes: 'Recurring migraine consultation',
      });

    // Returns existing appointment without creating duplicate
    expect(confirmRes2.status).toBe(201);
    expect(confirmRes2.body.data._id).toBe(appointmentId);
  });

  it('database level compound unique index prevents publishing overlapping slots for the same doctor', async () => {
    const slot = await SlotModel.findById(targetSlotId);
    if (!slot) return;

    // Attempt to publish a slot with identical doctorId and startTime
    const res = await request(app)
      .post('/api/v1/appointments/slots')
      .set('Authorization', `Bearer ${verifiedDoctorToken}`)
      .send({
        doctorId,
        slots: [{ startTime: slot.startTime.toISOString(), endTime: slot.endTime.toISOString() }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_CONFLICT');
  });

  it('rolls back all atomic writes via session transaction if any step in confirmation fails', async () => {
    // 1. Create a dedicated slot for rollback testing
    const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
    const slotRes = await request(app)
      .post('/api/v1/appointments/slots')
      .set('Authorization', `Bearer ${verifiedDoctorToken}`)
      .send({
        doctorId,
        slots: [{ startTime: startTime.toISOString(), endTime: endTime.toISOString() }],
      });
    const rollbackSlotId = slotRes.body.data[0]._id;

    // 2. Patient acquires hold
    const holdRes = await request(app)
      .post(`/api/v1/appointments/slots/${rollbackSlotId}/hold`)
      .set('Authorization', `Bearer ${patientTokens[2]}`);
    expect(holdRes.status).toBe(200);
    const rollbackHoldToken = holdRes.body.data.holdToken;

    // 3. Spy and simulate failure during ConsentGrantModel.create inside transaction
    const consentSpy = vi.spyOn(ConsentGrantModel, 'create').mockRejectedValueOnce(
      new Error('Simulated atomic transaction failure')
    );

    // 4. Attempt confirmation - transaction must fail and roll back
    const failRes = await request(app)
      .post('/api/v1/appointments/confirm')
      .set('Authorization', `Bearer ${patientTokens[2]}`)
      .send({
        slotId: rollbackSlotId,
        holdToken: rollbackHoldToken,
      });

    expect(failRes.status).toBe(500);

    // 5. Verify rollback integrity: Slot MUST remain in HELD status, no appointment created
    const slotAfterAbort = await SlotModel.findById(rollbackSlotId);
    expect(slotAfterAbort?.status).toBe('HELD');
    expect(slotAfterAbort?.appointmentId).toBeUndefined();

    const appointmentsCount = await AppointmentModel.countDocuments({ slotId: rollbackSlotId });
    expect(appointmentsCount).toBe(0);

    // 6. Restore mock and confirm retry succeeds cleanly
    consentSpy.mockRestore();

    const successRes = await request(app)
      .post('/api/v1/appointments/confirm')
      .set('Authorization', `Bearer ${patientTokens[2]}`)
      .send({
        slotId: rollbackSlotId,
        holdToken: rollbackHoldToken,
      });

    expect(successRes.status).toBe(201);
    expect(successRes.body.data.status).toBe('SCHEDULED');

    const slotAfterSuccess = await SlotModel.findById(rollbackSlotId);
    expect(slotAfterSuccess?.status).toBe('BOOKED');
    expect(slotAfterSuccess?.appointmentId).toBeDefined();
  });

  it('fails closed when topology does not support transactions in a non-permitted environment', async () => {
    // 1. Create slot and hold
    const startTime = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
    const slotRes = await request(app)
      .post('/api/v1/appointments/slots')
      .set('Authorization', `Bearer ${verifiedDoctorToken}`)
      .send({
        doctorId,
        slots: [{ startTime: startTime.toISOString(), endTime: endTime.toISOString() }],
      });
    const testSlotId = slotRes.body.data[0]._id;

    const holdRes = await request(app)
      .post(`/api/v1/appointments/slots/${testSlotId}/hold`)
      .set('Authorization', `Bearer ${patientTokens[3]}`);
    expect(holdRes.status).toBe(200);
    const testHoldToken = holdRes.body.data.holdToken;

    // 2. Temporarily mock getClient to report a non-replica-set standalone topology
    const originalGetClient = mongoose.connection.getClient.bind(mongoose.connection);
    vi.spyOn(mongoose.connection, 'getClient').mockReturnValue({
      ...originalGetClient(),
      topology: { description: { type: 'Single' } },
    } as unknown as ReturnType<typeof mongoose.connection.getClient>);

    // 3. Temporarily set NODE_ENV to an environment outside ALLOWED_NON_TRANSACTIONAL_ENVS (e.g. 'production')
    const originalNodeEnv = env.NODE_ENV;
    (env as { NODE_ENV: string }).NODE_ENV = 'production';

    try {
      const res = await request(app)
        .post('/api/v1/appointments/confirm')
        .set('Authorization', `Bearer ${patientTokens[3]}`)
        .send({
          slotId: testSlotId,
          holdToken: testHoldToken,
        });

      // Must fail closed with 500 REPLICA_SET_REQUIRED
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('REPLICA_SET_REQUIRED');
    } finally {
      (env as { NODE_ENV: string }).NODE_ENV = originalNodeEnv;
      vi.restoreAllMocks();
    }
  });
});
