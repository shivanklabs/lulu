import { Router, Request, Response } from 'express';
import { isDatabaseConnected } from '../config/database';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  const dbConnected = isDatabaseConnected();
  const statusCode = dbConnected ? 200 : 503;

  res.status(statusCode).json({
    success: dbConnected,
    data: {
      status: dbConnected ? 'healthy' : 'degraded',
      database: dbConnected ? 'connected' : 'disconnected',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});
