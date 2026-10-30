import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';

describe('Health Check API Integration', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDatabase(uri);
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('GET /api/v1/health returns 200 and healthy status when database is connected', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('healthy');
    expect(response.body.data.database).toBe('connected');
    expect(response.body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(response.body.data.timestamp).toBeDefined();
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/v1/non-existent returns 404 in standardized envelope', async () => {
    const response = await request(app).get('/api/v1/non-existent');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toBeDefined();
  });
});
