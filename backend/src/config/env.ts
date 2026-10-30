import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const KNOWN_DEV_SECRETS = new Set([
  'default_jwt_access_secret_development_min_32_chars!',
  'default_jwt_refresh_secret_development_min_32_chars!',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'default_action_token_secret_development_min_32_chars!',
  'default_prescription_signing_key_development_min_32_chars!',
  'changeme_production_jwt_access_secret_32_chars',
  'changeme_production_jwt_refresh_secret_32_chars',
  'changeme_action_token_secret_min_32_chars!',
]);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  API_PREFIX: z.string().default('/api/v1'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/medibridge_dev'),
  JWT_ACCESS_SECRET: z.string().min(16).default('default_jwt_access_secret_development_min_32_chars!'),
  JWT_REFRESH_SECRET: z.string().min(16).default('default_jwt_refresh_secret_development_min_32_chars!'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  PHI_ENCRYPTION_KEY: z.string().length(64).default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  ACTION_TOKEN_SECRET: z.string().min(16).default('default_action_token_secret_development_min_32_chars!'),
  PRESCRIPTION_SIGNING_KEY: z.string().min(16).default('default_prescription_signing_key_development_min_32_chars!'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads/secure_records'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().optional().default('gemini-2.5-flash'),
  AI_PROVIDER: z.enum(['gemini', 'openai', 'anthropic', 'mock']).default('mock'),
  AI_MODEL: z.string().default('mock-model'),
  AI_API_KEY: z.string().optional().default(''),
  AI_MAX_TOKENS: z.coerce.number().default(1024),
  AI_TEMPERATURE: z.coerce.number().default(0.2),
  AI_TIMEOUT_MS: z.coerce.number().default(15000),
  PATIENT_CANCEL_CUTOFF_HOURS: z.coerce.number().min(0).max(72).default(2),
  DOCTOR_INVITE_TTL_HOURS: z.coerce.number().min(1).max(168).default(72),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const validateProductionSecrets = (config: EnvConfig): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (config.NODE_ENV !== 'production') {
    return { valid: true, errors: [] };
  }

  const stringSecrets = [
    { name: 'JWT_ACCESS_SECRET', value: config.JWT_ACCESS_SECRET },
    { name: 'JWT_REFRESH_SECRET', value: config.JWT_REFRESH_SECRET },
    { name: 'ACTION_TOKEN_SECRET', value: config.ACTION_TOKEN_SECRET },
    { name: 'PRESCRIPTION_SIGNING_KEY', value: config.PRESCRIPTION_SIGNING_KEY },
  ];

  for (const secret of stringSecrets) {
    if (!secret.value || secret.value.length < 32) {
      errors.push(`${secret.name} must be at least 32 characters long in production.`);
    }
    if (KNOWN_DEV_SECRETS.has(secret.value)) {
      errors.push(`${secret.name} cannot use known development or placeholder fallback values in production.`);
    }
  }

  if (
    !config.PHI_ENCRYPTION_KEY ||
    !/^[a-fA-F0-9]{64}$/.test(config.PHI_ENCRYPTION_KEY) ||
    /^0{64}$/.test(config.PHI_ENCRYPTION_KEY) ||
    KNOWN_DEV_SECRETS.has(config.PHI_ENCRYPTION_KEY)
  ) {
    errors.push('PHI_ENCRYPTION_KEY must be a distinct, high-entropy 32-byte hex string (64 characters) in production.');
  }

  const uniqueSecretValues = new Set([
    config.JWT_ACCESS_SECRET,
    config.JWT_REFRESH_SECRET,
    config.ACTION_TOKEN_SECRET,
    config.PRESCRIPTION_SIGNING_KEY,
    config.PHI_ENCRYPTION_KEY,
  ]);

  if (uniqueSecretValues.size < 5) {
    errors.push('Security-critical secrets (JWT, PHI, Action Token, Prescription Signing) must be distinct from one another.');
  }

  return { valid: errors.length === 0, errors };
};

const sanitizeSecret = (val?: string): string => {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
};

const parseEnv = (): EnvConfig => {
  if (process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = sanitizeSecret(process.env.GEMINI_API_KEY);
  }
  if (process.env.AI_API_KEY) {
    process.env.AI_API_KEY = sanitizeSecret(process.env.AI_API_KEY);
  }

  // Accept either GEMINI_API_KEY or AI_API_KEY (trimming quotes/spaces)
  const geminiKey = process.env.GEMINI_API_KEY || (process.env.AI_API_KEY?.startsWith('AIza') ? process.env.AI_API_KEY : '');
  if (geminiKey && !process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = geminiKey;
  }

  const isTest = process.env.NODE_ENV === 'test';

  // Auto-Detection Rule:
  // If GEMINI_API_KEY (or AI_API_KEY starting with AIza) is present and non-empty,
  // and AI_PROVIDER was not explicitly forced to 'mock' in a test environment (NODE_ENV !== 'test'),
  // automatically resolve AI_PROVIDER = 'gemini' and AI_MODEL = 'gemini-2.5-flash'.
  if (geminiKey && (!isTest || process.env.AI_PROVIDER === 'gemini')) {
    if (!process.env.AI_PROVIDER || process.env.AI_PROVIDER === 'mock') {
      if (!isTest) {
        process.env.AI_PROVIDER = 'gemini';
        if (!process.env.AI_MODEL || process.env.AI_MODEL === 'mock-model') {
          process.env.AI_MODEL = 'gemini-3.8-flash';
        }
      }
    }
    if (!process.env.GEMINI_MODEL) {
      process.env.GEMINI_MODEL = 'gemini-3.8-flash';
    }
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = JSON.stringify(result.error.format(), null, 2);
    process.stderr.write(`[FATAL] Invalid environment configuration structure:\n${errorDetails}\n`);
    process.exit(1);
  }

  const prodCheck = validateProductionSecrets(result.data);
  if (!prodCheck.valid) {
    process.stderr.write(
      `[FATAL] Production security configuration check failed:\n${prodCheck.errors.join('\n')}\n`
    );
    process.exit(1);
  }

  return result.data;
};

export const env = parseEnv();
