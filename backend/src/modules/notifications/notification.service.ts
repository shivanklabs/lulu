import { Types } from 'mongoose';
import { NotificationModel, INotification, NotificationType } from './notification.model';
import { logger } from '../../lib/logger';

export interface SendNotificationInput {
  userId: string | Types.ObjectId;
  title: string;
  message: string;
  type: NotificationType;
  metadata?: Record<string, unknown>;
}

export const createNotification = async (input: SendNotificationInput): Promise<INotification> => {
  try {
    const notification = await NotificationModel.create({
      userId: typeof input.userId === 'string' ? new Types.ObjectId(input.userId) : input.userId,
      title: input.title,
      message: input.message,
      type: input.type,
      metadata: input.metadata,
      createdAt: new Date(),
    });
    return notification;
  } catch (err) {
    logger.error({ err, input }, 'Failed to create in-app notification');
    throw err;
  }
};

export const getUserNotifications = async (userId: string): Promise<INotification[]> => {
  return NotificationModel.find({ userId: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(50);
};

export const markNotificationRead = async (notificationId: string, userId: string): Promise<void> => {
  await NotificationModel.updateOne(
    { _id: new Types.ObjectId(notificationId), userId: new Types.ObjectId(userId) },
    { $set: { read: true } }
  );
};
