import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { CLINICAL_DISCLAIMER } from '../../src/modules/chatbot/chatbot.service';
import { registerAccount } from '../helpers/accounts';

describe('Phase 3 Unified /api/v1/ai/* Integration & Resilient Workflows', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();
  let patientToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());

    const regRes = await registerAccount(app, {
      email: 'ai.test.patient@example.com',
      password: 'Password123!',
      role: 'PATIENT',
      fullName: 'AI Test Patient',
      phone: '9812345678',
    });
    patientToken = regRes.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  }, 30000);

  it('GET /api/v1/ai/status reports live/fallback AI engine telemetry', async () => {
    const res = await request(app).get('/api/v1/ai/status');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('liveAiActive');
    expect(res.body.data).toHaveProperty('provider');
    expect(res.body.data).toHaveProperty('model');
  });

  it('POST /api/v1/ai/chatbot/message delivers health guidance with mandatory disclaimer', async () => {
    const res = await request(app)
      .post('/api/v1/ai/chatbot/message')
      .send({
        message: 'What should I do for a mild tension headache?',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reply).toBeDefined();
    expect(res.body.data.disclaimer).toBe(CLINICAL_DISCLAIMER);
  });

  it('POST /api/v1/ai/voice-consult returns home remedies and red-flag clinical alerts', async () => {
    const res = await request(app)
      .post('/api/v1/ai/voice-consult')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        query: 'I have a sore throat and slight cough since yesterday',
        channel: 'VOICE',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reply).toBeDefined();
    expect(res.body.data.homeRemedies.length).toBeGreaterThan(0);
    expect(res.body.data.redFlags.length).toBeGreaterThan(0);
    expect(res.body.data.clinicalDisclaimer).toBeDefined();
  });

  it('POST /api/v1/ai/propose rejects booking when slotId is missing or malformed', async () => {
    const res = await request(app)
      .post('/api/v1/ai/propose')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        prompt: 'book slot',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reply).toContain('To stage an appointment booking');
  });
});
