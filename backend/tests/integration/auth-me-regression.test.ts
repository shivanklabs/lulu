import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { UserModel } from '../../src/modules/users/user.model';
import { PatientModel } from '../../src/modules/patients/patient.model';
import { signAccessToken } from '../../src/lib/crypto';
import { env } from '../../src/config/env';

describe('Auth /me & Protected Endpoints Authentication (401 vs 403) Regression', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let validPatientToken: string;
  let patientUserId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());

    const patientUser = await UserModel.create({
      email: 'regression.patient@example.com',
      passwordHash: 'hashed_pw',
      role: 'PATIENT',
    });
    patientUserId = patientUser._id.toString();

    await PatientModel.create({
      userId: patientUser._id,
      fullName: 'Regression Test Patient',
      specialId: '#MB-PAT-9999',
      phone: '+91 9999999999',
      bloodGroup: 'B+',
      dateOfBirth: '1995-05-15',
      gender: 'MALE',
    });

    validPatientToken = signAccessToken({
      userId: patientUserId,
      role: 'PATIENT',
      email: patientUser.email,
    });
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('rejects GET /api/v1/auth/me without authorization header with 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects GET /api/v1/auth/me with malformed authorization header with 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Basic invalid_creds');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects GET /api/v1/auth/me with expired token with 401 TOKEN_EXPIRED', async () => {
    const expiredToken = jwt.sign(
      { userId: patientUserId, role: 'PATIENT', email: 'regression.patient@example.com' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects GET /api/v1/auth/me with invalid signature with 401 TOKEN_EXPIRED', async () => {
    const forgedToken = jwt.sign(
      { userId: patientUserId, role: 'PATIENT', email: 'regression.patient@example.com' },
      'wrong_secret_key_that_does_not_match!'
    );

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${forgedToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('resolves authenticated user and patient profile via GET /api/v1/auth/me with valid token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${validPatientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(patientUserId);
    expect(res.body.data.user.role).toBe('PATIENT');
    expect(res.body.data.profile.specialId).toBe('#MB-PAT-9999');
  });

  it('returns 401 UNAUTHORIZED for protected dashboard endpoints when unauthenticated', async () => {
    const endpoints = [
      '/api/v1/admin/overview',
      '/api/v1/admin/audit-logs',
      '/api/v1/appointments/my-appointments',
      '/api/v1/ambulance-sos/my-dispatches',
      '/api/v1/consent/my-grants',
      '/api/v1/prescriptions/my-prescriptions',
      '/api/v1/notifications',
    ];

    for (const ep of endpoints) {
      const res = await request(app).get(ep);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    }
  });

  it('correctly distinguishes 401 UNAUTHORIZED from 403 FORBIDDEN on role restrictions', async () => {
    // Unauthenticated request to /admin/overview -> 401 UNAUTHORIZED
    const unauthRes = await request(app).get('/api/v1/admin/overview');
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body.error.code).toBe('UNAUTHORIZED');

    // Authenticated Patient request to /admin/overview -> 403 FORBIDDEN (authenticated, but insufficient role)
    const forbiddenRes = await request(app)
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${validPatientToken}`);
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');
  });
});
