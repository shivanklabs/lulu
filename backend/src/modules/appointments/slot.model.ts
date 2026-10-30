import { Schema, model, Document, Types } from 'mongoose';

export type SlotStatus = 'AVAILABLE' | 'HELD' | 'BOOKED' | 'CANCELLED';

export interface ISlot extends Document {
  doctorId: Types.ObjectId;
  startTime: Date;
  endTime: Date;
  status: SlotStatus;
  heldByPatientId?: Types.ObjectId;
  heldUntil?: Date;
  holdToken?: string;
  appointmentId?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const slotSchema = new Schema<ISlot>(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ['AVAILABLE', 'HELD', 'BOOKED', 'CANCELLED'],
      default: 'AVAILABLE',
      index: true,
    },
    heldByPatientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
    heldUntil: { type: Date },
    holdToken: { type: String },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    version: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// AUTHORITATIVE DATABASE CONSTRAINT:
// Guarantees at database engine level that no two slots can exist for the same doctor at the same start time
slotSchema.index({ doctorId: 1, startTime: 1 }, { unique: true });

// Query optimization index
slotSchema.index({ doctorId: 1, status: 1, startTime: 1 });

export const SlotModel = model<ISlot>('Slot', slotSchema);
