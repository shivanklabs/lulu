import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

interface RateLimitRecord {
  timestamps: number[];
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
  skip?: (req: Request) => boolean;
}

export const createRateLimiter = (options: RateLimiterOptions) => {
  const store = new Map<string, RateLimitRecord>();

  // Periodically sweep expired entries (every 5 minutes)
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      const recent = record.timestamps.filter((t) => now - t < options.windowMs);
      if (recent.length === 0) {
        store.delete(key);
      } else {
        record.timestamps = recent;
      }
    }
  }, 5 * 60 * 1000);

  // Unref timer so it does not prevent Node process exit
  if (sweepInterval.unref) {
    sweepInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // In test environment, bypass unless test explicitly sends 'x-test-rate-limit' header
    if (env.NODE_ENV === 'test' && req.headers['x-test-rate-limit'] !== 'true') {
      return next();
    }

    if (options.skip && options.skip(req)) {
      return next();
    }

    const key = (req.ip || req.socket.remoteAddress || 'unknown-ip') as string;
    const now = Date.now();

    const record = store.get(key) || { timestamps: [] };
    const validTimestamps = record.timestamps.filter((t) => now - t < options.windowMs);

    if (validTimestamps.length >= options.max) {
      const retryAfterSeconds = Math.ceil(
        (validTimestamps[0] + options.windowMs - now) / 1000
      );
      res.setHeader('Retry-After', retryAfterSeconds > 0 ? retryAfterSeconds : 1);
      res.setHeader('X-RateLimit-Limit', options.max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message:
            options.message ||
            'Too many requests from this client. Please wait before retrying.',
          retryAfterSeconds,
          requestId: req.id || 'unknown',
        },
      });
      return;
    }

    validTimestamps.push(now);
    record.timestamps = validTimestamps;
    store.set(key, record);

    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - validTimestamps.length));

    next();
  };
};

// Specialized limiters preserving clinical access
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
});

export const aiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'AI assistant rate limit reached. Please wait before asking more questions.',
});

export const generalApiLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  skip: (req) => {
    // Never throttle health check or active file streaming proxy
    return (
      req.path === '/health' ||
      req.path === `${env.API_PREFIX}/health` ||
      req.path.includes('/files/')
    );
  },
});

// Booking creation & cancellation: protects slots from scripted hoarding
export const bookingRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many booking requests. Please wait a few minutes and try again.',
});
