import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';

describe('Security Headers & API Rate Limiting', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  describe('HTTP Security Headers', () => {
    it('sets hardened OWASP security headers on all responses', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-xss-protection']).toBe('0');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Sliding Window Rate Limiter', () => {
    it('bypasses rate limiting during standard test execution without test flag', async () => {
      for (let i = 0; i < 35; i++) {
        const res = await request(app).post('/api/v1/auth/login').send({
          email: 'nonexistent@example.com',
          password: 'WrongPassword123!',
        });
        // Should return 401 Unauthorized, never 429
        expect(res.status).toBe(401);
      }
    });

    it('enforces rate limiting when x-test-rate-limit is enabled and returns 429 RATE_LIMIT_EXCEEDED', async () => {
      // authRateLimiter has maxRequests: 30
      // Send 30 requests that succeed or fail with 401
      for (let i = 0; i < 30; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .set('x-test-rate-limit', 'true')
          .send({ email: 'rate.limit@example.com', password: 'Password123!' });
      }

      // 31st request should be throttled
      const throttledRes = await request(app)
        .post('/api/v1/auth/login')
        .set('x-test-rate-limit', 'true')
        .send({ email: 'rate.limit@example.com', password: 'Password123!' });

      expect(throttledRes.status).toBe(429);
      expect(throttledRes.body.success).toBe(false);
      expect(throttledRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(throttledRes.headers['retry-after']).toBeDefined();
    });
  });
});
