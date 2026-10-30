import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim() ? incomingId : randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};
