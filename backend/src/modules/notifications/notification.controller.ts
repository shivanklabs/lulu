import { Request, Response, NextFunction } from 'express';
import { getUserNotifications, markNotificationRead } from './notification.service';
import { AppError } from '../../middleware/errorHandler';

export const listMyNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const notifications = await getUserNotifications(req.user.userId);
    res.status(200).json({
      success: true,
      data: notifications,
    });
  } catch (err) {
    next(err);
  }
};

export const markReadHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    await markNotificationRead(req.params.id, req.user.userId);
    res.status(200).json({
      success: true,
      data: { read: true },
    });
  } catch (err) {
    next(err);
  }
};
