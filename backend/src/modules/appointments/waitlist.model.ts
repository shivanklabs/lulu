import { Schema, model, Document, Types } from 'mongoose';

export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'EXPIRED' | 'CLAIMED';

export interface IWaitlistEntry extends Document {
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  preferredDate: Date;
  status: WaitlistStatus;
  offeredSlotId?: Types.ObjectId;
  offeredUntil?: Date;
  notificationSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const waitlistEntrySchema = new Schema<IWaitlistEntry>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    preferredDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['WAITING', 'OFFERED', 'EXPIRED', 'CLAIMED'],
      default: 'WAITING',
      index: true,
    },
    offeredSlotId: { type: Schema.Types.ObjectId, ref: 'Slot' },
    offeredUntil: { type: Date },
    notificationSentAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

waitlistEntrySchema.index({ doctorId: 1, preferredDate: 1, status: 1 });

export const WaitlistModel = model<IWaitlistEntry>('Waitlist', waitlistEntrySchema);
