import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../modules/users/user.model';
import { AppError } from './errorHandler';

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        `Access denied. Requires one of the following roles: [${allowedRoles.join(', ')}]`,
        403,
        'FORBIDDEN'
      );
    }

    next();
  };
};
