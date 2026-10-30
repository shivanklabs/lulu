import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  sanitizeMongoUri,
  sanitizeMongoError,
  getDatabaseReadyState,
} from '../../src/config/database';
import { verifyAtlasConnection } from '../../src/scripts/verify-atlas-connection';

describe('MongoDB Atlas Configuration & Connection Verification Unit Tests', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    await mongoServer.stop();
  });

  it('1. Credential Sanitization: securely redacts username and password from Atlas connection URIs', () => {
    const rawAtlasUri = 'mongodb+srv://admin_user:SuperSecretPassword123!@cluster0.mongodb.net/medibridge?retryWrites=true&w=majority';
    const sanitized = sanitizeMongoUri(rawAtlasUri);

    expect(sanitized).toBe('mongodb+srv://<redacted-credentials>@cluster0.mongodb.net/medibridge?retryWrites=true&w=majority');
    expect(sanitized).not.toContain('admin_user');
    expect(sanitized).not.toContain('SuperSecretPassword123!');
  });

  it('2. Error Message Sanitization: strips sensitive credentials from connection error strings', () => {
    const rawError = new Error('MongoServerSelectionError: connection failed at mongodb+srv://db_admin:P@ssw0rd!@cluster0.mongodb.net: querySrv ENOTFOUND');
    const sanitized = sanitizeMongoError(rawError);

    expect(sanitized).not.toContain('db_admin');
    expect(sanitized).not.toContain('P@ssw0rd!');
    expect(sanitized).toContain('mongodb+srv://<redacted-credentials>@cluster0.mongodb.net');
  });

  it('3. Lifecycle Guard: flags placeholder credentials without throwing uncaught exceptions or leaking secrets', async () => {
    const placeholderUri = 'mongodb+srv://<username>:<password>@<cluster-host>/medibridge?retryWrites=true&w=majority';
    const result = await verifyAtlasConnection(placeholderUri);

    expect(result.success).toBe(false);
    expect(result.error).toBe('PLACEHOLDER_CREDENTIALS');
    expect(result.blocker).toContain('placeholder tokens');
    expect(result.sanitizedUri).not.toContain('<username>:<password>');
  });

  it('4. Read-Only Verification: verifies live database connection and topology without mutating data', async () => {
    const testUri = mongoServer.getUri();
    const result = await verifyAtlasConnection(testUri);

    expect(result.success).toBe(true);
    expect(result.databaseName).toBeDefined();
    expect(typeof result.collectionCount).toBe('number');
    expect(Array.isArray(result.collections)).toBe(true);
  });

  it('5. Database Ready State Helper: correctly maps state numbers to descriptive strings', () => {
    const state = getDatabaseReadyState();
    expect(['DISCONNECTED', 'CONNECTED', 'CONNECTING', 'DISCONNECTING']).toContain(state);
  });
});
