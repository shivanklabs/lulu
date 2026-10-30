import { describe, it, expect } from 'vitest';
import {
  encryptPhi,
  decryptPhi,
  hashPassword,
  comparePassword,
  signAccessToken,
  verifyAccessToken,
} from '../../src/lib/crypto';

describe('Cryptographic Security Utilities', () => {
  const secretNotes = 'Patient exhibits acute hypertension. Prescribed Lisinopril 10mg daily.';

  it('encrypts and decrypts sensitive PHI accurately using AES-256-GCM', () => {
    const envelope = encryptPhi(secretNotes);
    expect(envelope).toMatch(/^enc:v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);

    const decrypted = decryptPhi(envelope);
    expect(decrypted).toBe(secretNotes);
  });

  it('generates a unique IV for each encryption operation (prevents nonce reuse)', () => {
    const envelope1 = encryptPhi(secretNotes);
    const envelope2 = encryptPhi(secretNotes);

    const iv1 = envelope1.split(':')[2];
    const iv2 = envelope2.split(':')[2];

    expect(iv1).not.toBe(iv2);
    expect(envelope1).not.toBe(envelope2);
  });

  it('rejects tampered ciphertext envelopes via GCM authentication tag verification', () => {
    const envelope = encryptPhi(secretNotes);
    const parts = envelope.split(':');
    // Tamper with ciphertext by altering last hex character
    const tamperedCiphertext = parts[4].slice(0, -1) + (parts[4].slice(-1) === 'a' ? 'b' : 'a');
    const tamperedEnvelope = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${tamperedCiphertext}`;

    expect(() => decryptPhi(tamperedEnvelope)).toThrow();
  });

  it('securely hashes passwords with salt and verifies matches', async () => {
    const password = 'CorrectHorseBatteryStaple!2026';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(await comparePassword(password, hash)).toBe(true);
    expect(await comparePassword('WrongPassword123', hash)).toBe(false);
  });

  it('generates valid JWT access tokens and verifies payloads', () => {
    const payload = { userId: 'user_123', role: 'DOCTOR' as const, email: 'dr.smith@example.com' };
    const token = signAccessToken(payload);
    const verified = verifyAccessToken(token);

    expect(verified.userId).toBe(payload.userId);
    expect(verified.role).toBe(payload.role);
    expect(verified.email).toBe(payload.email);
  });
});
