import { Schema, model, Document, Types } from 'mongoose';

export type ReminderFrequency =
  | 'DAILY'
  | 'TWICE_DAILY'
  | 'THRICE_DAILY'
  | 'WEEKLY'
  | 'FOLLOWUP_CHECKUP';

export type ReminderChannel = 'WHATSAPP' | 'BROWSER_PUSH' | 'BOTH';
export type ReminderStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export interface IMedicineReminder extends Document {
  patientId: Types.ObjectId;
  userId: Types.ObjectId;
  prescriptionId?: Types.ObjectId;
  medicineName: string;
  dosage: string;
  scheduleTime: string; // e.g. "08:00 AM"
  frequency: ReminderFrequency;
  channel: ReminderChannel;
  status: ReminderStatus;
  whatsappNumber?: string;
  nextDispatchAt: Date;
  lastDispatchedAt?: Date;
  postConsultCheckIn: boolean;
  instructions?: string;
  createdAt: Date;
  updatedAt: Date;
}

const medicineReminderSchema = new Schema<IMedicineReminder>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    prescriptionId: { type: Schema.Types.ObjectId, ref: 'Prescription' },
    medicineName: { type: String, required: true, trim: true },
    dosage: { type: String, required: true, trim: true },
    scheduleTime: { type: String, required: true, default: '08:00 AM' },
    frequency: {
      type: String,
      required: true,
      enum: ['DAILY', 'TWICE_DAILY', 'THRICE_DAILY', 'WEEKLY', 'FOLLOWUP_CHECKUP'],
      default: 'DAILY',
    },
    channel: {
      type: String,
      required: true,
      enum: ['WHATSAPP', 'BROWSER_PUSH', 'BOTH'],
      default: 'BOTH',
    },
    status: {
      type: String,
      required: true,
      enum: ['ACTIVE', 'PAUSED', 'COMPLETED'],
      default: 'ACTIVE',
      index: true,
    },
    whatsappNumber: { type: String, trim: true },
    nextDispatchAt: { type: Date, required: true, index: true },
    lastDispatchedAt: { type: Date },
    postConsultCheckIn: { type: Boolean, default: false },
    instructions: { type: String },
  },
  {
    timestamps: true,
  }
);

medicineReminderSchema.index({ status: 1, nextDispatchAt: 1 });

export const MedicineReminderModel = model<IMedicineReminder>(
  'MedicineReminder',
  medicineReminderSchema
);
