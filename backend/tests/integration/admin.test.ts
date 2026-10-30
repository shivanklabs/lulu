import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { UserModel } from '../../src/modules/users/user.model';
import { signAccessToken } from '../../src/lib/crypto';

describe('Admin System Telemetry & Compliance Audit Trail', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let adminToken: string;
  let patientToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());

    const admin = await UserModel.create({
      email: 'compliance.officer@medibridge.internal',
      passwordHash: 'hashed_pw',
      role: 'ADMIN',
    });
    adminToken = signAccessToken({ userId: admin._id.toString(), role: 'ADMIN', email: admin.email });

    const patient = await UserModel.create({
      email: 'regular.user@example.com',
      passwordHash: 'hashed_pw',
      role: 'PATIENT',
    });
    patientToken = signAccessToken({ userId: patient._id.toString(), role: 'PATIENT', email: patient.email });
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('allows administrator to access platform system overview metrics', async () => {
    const res = await request(app)
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalUsers).toBeGreaterThanOrEqual(2);
    expect(res.body.data.totalAuditLogs).toBeDefined();
  });

  it('blocks non-administrative roles from accessing admin overview (403 FORBIDDEN)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows administrator to inspect compliance audit logs', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs?limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
