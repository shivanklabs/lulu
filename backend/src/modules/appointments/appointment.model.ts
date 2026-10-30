import { Schema, model, Document, Types } from 'mongoose';

// PENDING/CONFIRMED: dashboard booking lifecycle (patient books → doctor confirms).
// SCHEDULED: legacy two-phase slot-hold flow (kept for backward compatibility).
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type AppointmentMode = 'IN_PERSON' | 'VIDEO';

export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = ['PENDING', 'CONFIRMED', 'SCHEDULED'];

export interface IAppointment extends Document {
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  hospitalId?: Types.ObjectId;
  slotId?: Types.ObjectId;
  startTime: Date;
  endTime: Date;
  status: AppointmentStatus;
  mode?: AppointmentMode;
  reason?: string;
  consultationFee: number;
  idempotencyKey?: string;
  // `${doctorId}|${startTime ISO}` while the booking is active; unset once cancelled.
  // Backed by a unique sparse index so two active bookings can never share a doctor slot.
  activeSlotKey?: string;
  cancellationReason?: string;
  cancelledAt?: Date;
  cancelledBy?: Types.ObjectId;
  confirmedAt?: Date;
  completedAt?: Date;
  clinicalNotesSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const appointmentSchema = new Schema<IAppointment>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', index: true },
    // Only set by the legacy slot-hold flow
    slotId: { type: Schema.Types.ObjectId, ref: 'Slot', unique: true, sparse: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'CONFIRMED', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
      default: 'SCHEDULED',
      index: true,
    },
    mode: { type: String, enum: ['IN_PERSON', 'VIDEO'] },
    reason: { type: String, trim: true, maxlength: 200 },
    consultationFee: { type: Number, required: true, min: 0 },
    idempotencyKey: { type: String, sparse: true, unique: true },
    activeSlotKey: { type: String },
    cancellationReason: { type: String },
    cancelledAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: { type: Date },
    completedAt: { type: Date },
    clinicalNotesSummary: { type: String },
  },
  {
    timestamps: true,
  }
);

// Keep activeSlotKey in sync with status on every save()/create().
appointmentSchema.pre('validate', function () {
  if (ACTIVE_APPOINTMENT_STATUSES.includes(this.status)) {
    this.activeSlotKey = `${this.doctorId.toString()}|${this.startTime.toISOString()}`;
  } else {
    this.activeSlotKey = undefined;
  }
});

// AUTHORITATIVE DOUBLE-BOOKING CONSTRAINT for active bookings (doctor + slot start)
appointmentSchema.index({ activeSlotKey: 1 }, { unique: true, sparse: true });

appointmentSchema.index({ patientId: 1, startTime: -1 });
appointmentSchema.index({ doctorId: 1, startTime: -1 });
appointmentSchema.index({ hospitalId: 1, startTime: -1 });
appointmentSchema.index({ hospitalId: 1, status: 1 });

export const AppointmentModel = model<IAppointment>('Appointment', appointmentSchema);
