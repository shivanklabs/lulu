import { Request, Response, NextFunction, RequestHandler } from 'express';

// Forwards rejected promises to the central error handler
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
