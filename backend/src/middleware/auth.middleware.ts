import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { verifyAccessToken, TokenPayload } from '../lib/crypto';
import { UserModel } from '../modules/users/user.model';
import { AppError } from './errorHandler';

// Identity attached to every authenticated request. Role and hospital scope are
// re-read from the database on each request so deactivation and role changes apply immediately.
export interface AuthenticatedUser extends TokenPayload {
  hospitalId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const resolveUser = async (token: string): Promise<AuthenticatedUser> => {
  let payload: TokenPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError('Invalid or expired authentication token', 401, 'TOKEN_EXPIRED');
  }

  if (!Types.ObjectId.isValid(payload.userId)) {
    throw new AppError('Invalid authentication token', 401, 'UNAUTHORIZED');
  }

  const user = await UserModel.findById(payload.userId).select('email role isActive hospitalId').lean();
  if (!user) {
    throw new AppError('Account no longer exists', 401, 'UNAUTHORIZED');
  }
  if (!user.isActive) {
    throw new AppError('This account has been deactivated', 403, 'ACCOUNT_INACTIVE');
  }
  if (user.role !== payload.role) {
    // Role changed after the token was issued: force a fresh login
    throw new AppError('Session is out of date. Please sign in again.', 401, 'TOKEN_ROLE_MISMATCH');
  }

  return {
    userId: payload.userId,
    role: user.role,
    email: user.email,
    hospitalId: user.hospitalId ? user.hospitalId.toString() : undefined,
  };
};

export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication token is missing or malformed', 401, 'UNAUTHORIZED'));
  }

  try {
    req.user = await resolveUser(authHeader.split(' ')[1]);
    next();
  } catch (err) {
    next(err);
  }
};

export const optionalAuthenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      req.user = await resolveUser(authHeader.split(' ')[1]);
    } catch {
      // Ignored for optional authentication
    }
  }
  next();
};
