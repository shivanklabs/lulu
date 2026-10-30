import { Schema, model, Document, Types } from 'mongoose';

// WEEKLY: recurring working window on a weekday (0 = Sunday … 6 = Saturday).
// LEAVE: the doctor is unavailable for the whole calendar date.
// All times are wall-clock times in Asia/Kolkata (IST, UTC+05:30).
export type AvailabilityType = 'WEEKLY' | 'LEAVE';

export interface IAvailability extends Document {
  doctorId: Types.ObjectId;
  hospitalId?: Types.ObjectId;
  type: AvailabilityType;
  weekday?: number;
  date?: string; // YYYY-MM-DD (LEAVE only)
  startTime?: string; // HH:mm (WEEKLY only)
  endTime?: string; // HH:mm (WEEKLY only)
  slotMinutes?: number; // WEEKLY only
  createdAt: Date;
  updatedAt: Date;
}

const availabilitySchema = new Schema<IAvailability>(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital' },
    type: { type: String, required: true, enum: ['WEEKLY', 'LEAVE'] },
    weekday: { type: Number, min: 0, max: 6 },
    date: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    startTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    slotMinutes: { type: Number, min: 10, max: 120 },
  },
  {
    timestamps: true,
  }
);

availabilitySchema.index({ doctorId: 1, type: 1, weekday: 1 });
// One leave entry per doctor per date
availabilitySchema.index(
  { doctorId: 1, date: 1 },
  { unique: true, partialFilterExpression: { type: 'LEAVE' } }
);

export const AvailabilityModel = model<IAvailability>('Availability', availabilitySchema);
