import 'dotenv/config';
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { requestIdMiddleware } from './middleware/requestId';
import { securityHeadersMiddleware } from './middleware/securityHeaders';
import { generalApiLimiter } from './middleware/rateLimiter';
import { errorHandler, AppError } from './middleware/errorHandler';
import { apiRouter } from './routes';

export const createApp = (): Express => {
  const app = express();

  // Core Middlewares
  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(generalApiLimiter);
  app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // HTTP Request Logging
  if (env.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger }));
  }

  // API Routes
  app.use(env.API_PREFIX, apiRouter);

  // Catch-all 404 handler
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(`Endpoint ${req.method} ${req.originalUrl} not found`, 404, 'NOT_FOUND'));
  });

  // Central Error Handler
  app.use(errorHandler);

  return app;
};
