import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateProductionSecrets, EnvConfig } from '../../src/config/env';

describe('Environment Schema Validation', () => {
  const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(5000),
    API_PREFIX: z.string().default('/api/v1'),
    FRONTEND_URL: z.string().default('http://localhost:5173'),
    MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/medibridge_dev'),
  });

  it('provides sensible defaults when optional variables are omitted', () => {
    const parsed = envSchema.parse({});
    expect(parsed.PORT).toBe(5000);
    expect(parsed.API_PREFIX).toBe('/api/v1');
    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.FRONTEND_URL).toBe('http://localhost:5173');
  });

  it('correctly coerces port string to number', () => {
    const parsed = envSchema.parse({ PORT: '8080' });
    expect(parsed.PORT).toBe(8080);
  });

  it('fails when NODE_ENV is set to an unsupported value', () => {
    expect(() => envSchema.parse({ NODE_ENV: 'staging' })).toThrow();
  });
});

describe('Production Secret Validation (validateProductionSecrets)', () => {
  const createValidConfig = (): EnvConfig => ({
    NODE_ENV: 'production',
    PORT: 5000,
    API_PREFIX: '/api/v1',
    FRONTEND_URL: 'https://medibridge.example.com',
    MONGODB_URI: 'mongodb://db.internal:27017/medibridge',
    JWT_ACCESS_SECRET: 'prod_jwt_access_secret_distinct_entropy_key_1!',
    JWT_REFRESH_SECRET: 'prod_jwt_refresh_secret_distinct_entropy_key_2!',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    PHI_ENCRYPTION_KEY: 'a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
    ACTION_TOKEN_SECRET: 'prod_action_token_secret_distinct_entropy_key_3!',
    PRESCRIPTION_SIGNING_KEY: 'prod_prescription_signing_distinct_entropy_key_4!',
    STORAGE_LOCAL_DIR: './uploads/secure_records',
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX_REQUESTS: 100,
    GEMINI_API_KEY: '',
    GEMINI_MODEL: 'gemini-2.5-flash',
    AI_PROVIDER: 'mock',
    AI_MODEL: 'mock-model',
    AI_API_KEY: '',
    AI_MAX_TOKENS: 1024,
    AI_TEMPERATURE: 0.2,
    AI_TIMEOUT_MS: 15000,
  });

  it('bypasses secret validation in development and test environments', () => {
    const devConfig = { ...createValidConfig(), NODE_ENV: 'development' as const, JWT_ACCESS_SECRET: 'short' };
    const devRes = validateProductionSecrets(devConfig);
    expect(devRes.valid).toBe(true);
    expect(devRes.errors).toHaveLength(0);

    const testConfig = { ...createValidConfig(), NODE_ENV: 'test' as const, JWT_ACCESS_SECRET: 'short' };
    const testRes = validateProductionSecrets(testConfig);
    expect(testRes.valid).toBe(true);
    expect(testRes.errors).toHaveLength(0);
  });

  it('passes validation when all production secrets are distinct, strong, and valid', () => {
    const validConfig = createValidConfig();
    const result = validateProductionSecrets(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects known development secret fallbacks in production', () => {
    const invalidConfig = {
      ...createValidConfig(),
      JWT_ACCESS_SECRET: 'default_jwt_access_secret_development_min_32_chars!',
    };
    const result = validateProductionSecrets(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('known development or placeholder fallback values'))).toBe(true);
  });

  it('rejects weak secrets shorter than 32 characters in production', () => {
    const invalidConfig = {
      ...createValidConfig(),
      ACTION_TOKEN_SECRET: 'too-short-secret',
    };
    const result = validateProductionSecrets(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must be at least 32 characters long in production'))).toBe(true);
  });

  it('rejects invalid or all-zero PHI_ENCRYPTION_KEY in production', () => {
    const allZeroConfig = {
      ...createValidConfig(),
      PHI_ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000000',
    };
    const zeroRes = validateProductionSecrets(allZeroConfig);
    expect(zeroRes.valid).toBe(false);
    expect(zeroRes.errors.some((e) => e.includes('PHI_ENCRYPTION_KEY must be a distinct, high-entropy'))).toBe(true);

    const nonHexConfig = {
      ...createValidConfig(),
      PHI_ENCRYPTION_KEY: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
    };
    const nonHexRes = validateProductionSecrets(nonHexConfig);
    expect(nonHexRes.valid).toBe(false);
  });

  it('rejects duplicate secrets across different security domains', () => {
    const duplicateKey = 'shared_secret_across_multiple_domains_32_chars!';
    const duplicateConfig = {
      ...createValidConfig(),
      JWT_ACCESS_SECRET: duplicateKey,
      PRESCRIPTION_SIGNING_KEY: duplicateKey,
    };
    const result = validateProductionSecrets(duplicateConfig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must be distinct from one another'))).toBe(true);
  });
});
