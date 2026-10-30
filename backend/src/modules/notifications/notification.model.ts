import { Schema, model, Document, Types } from 'mongoose';

export type NotificationType =
  | 'APPOINTMENT_BOOKED'
  | 'APPOINTMENT_CANCELLED'
  | 'APPOINTMENT_CONFIRMED'
  | 'APPOINTMENT_UPDATED'
  | 'PRESCRIPTION_ISSUED'
  | 'CONSENT_ALERT'
  | 'SYSTEM';

export interface INotification extends Document {
  userId: Types.ObjectId;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['APPOINTMENT_BOOKED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_CONFIRMED', 'APPOINTMENT_UPDATED', 'PRESCRIPTION_ISSUED', 'CONSENT_ALERT', 'SYSTEM'],
      index: true,
    },
    read: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: false,
  }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const NotificationModel = model<INotification>('Notification', notificationSchema);
