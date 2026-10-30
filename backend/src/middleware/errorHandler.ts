import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.id || 'unknown';
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL_SERVER_ERROR';
  const message = statusCode === 500 && env.NODE_ENV === 'production'
    ? 'An unexpected error occurred. Please try again later.'
    : err.message || 'Internal server error';

  logger.error({
    requestId,
    err,
    path: req.originalUrl,
    method: req.method,
  }, 'Request error encountered');

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details: err instanceof AppError ? err.details || null : null,
      requestId,
    },
  });
};
