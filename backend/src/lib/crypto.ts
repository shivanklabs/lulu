import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENVELOPE_PREFIX = 'enc:v1';

export const encryptPhi = (plainText: string, keyHex: string = env.PHI_ENCRYPTION_KEY): string => {
  if (!plainText) return '';
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('PHI_ENCRYPTION_KEY must be a 32-byte (64 hex characters) string');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let ciphertext = cipher.update(plainText, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${ENVELOPE_PREFIX}:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
};

export const decryptPhi = (envelope: string, keyHex: string = env.PHI_ENCRYPTION_KEY): string => {
  if (!envelope) return '';
  const parts = envelope.split(':');
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== ENVELOPE_PREFIX) {
    throw new Error('Invalid or unsupported encryption envelope format');
  }

  const [, , ivHex, tagHex, ciphertextHex] = parts;
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Malformed IV or authentication tag in ciphertext envelope');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export interface TokenPayload {
  userId: string;
  role: 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'HOSPITAL';
  email: string;
}

export const signAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

export const signRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
};
