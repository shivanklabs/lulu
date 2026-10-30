import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { listMyNotifications, markReadHandler } from './notification.controller';

export const notificationRouter = Router();

notificationRouter.use(authenticate);
notificationRouter.get('/', listMyNotifications);
notificationRouter.patch('/:id/read', markReadHandler);
