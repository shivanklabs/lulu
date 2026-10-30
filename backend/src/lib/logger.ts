import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'development' ? 'debug' : 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      'password',
      '*.password',
      'token',
      '*.token',
      'refreshToken',
      '*.refreshToken',
      'ssn',
      '*.ssn',
      'clinicalNotes',
      '*.clinicalNotes',
      'diagnosis',
      '*.diagnosis',
    ],
    censor: '[REDACTED]',
  },
});
