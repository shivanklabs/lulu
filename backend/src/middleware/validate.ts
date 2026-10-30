import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { z, ZodTypeAny } from 'zod';
import { AppError } from './errorHandler';

const toValidationError = (error: z.ZodError): AppError =>
  new AppError('Request validation failed', 400, 'VALIDATION_ERROR', error.flatten().fieldErrors);

// Replaces req.body with the parsed (stripped, coerced) value
export const validateBody =
  (schema: ZodTypeAny) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return next(toValidationError(result.error));
    }
    req.body = result.data;
    next();
  };

// Parsed query is stored on res.locals.query (Express 4 req.query is a getter-backed object)
export const validateQuery =
  (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(toValidationError(result.error));
    }
    res.locals.query = result.data;
    next();
  };

// Invalid ObjectIds are reported as 404 so callers cannot probe for resource existence
export const validateObjectIdParams =
  (...names: string[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    for (const name of names) {
      if (!Types.ObjectId.isValid(req.params[name])) {
        return next(new AppError('Resource not found', 404, 'NOT_FOUND'));
      }
    }
    next();
  };

export const objectIdString = z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });

export const paginationQuery = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
};
