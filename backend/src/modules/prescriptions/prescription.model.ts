import { Schema, model, Document, Types } from 'mongoose';

export type PrescriptionStatus = 'DRAFT_PENDING_DOCTOR_SIGNATURE' | 'ISSUED' | 'DISPENSED' | 'CANCELLED';

export interface IMedicationItem {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface IPrescription extends Document {
  appointmentId?: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  medications: IMedicationItem[];
  status: PrescriptionStatus;
  digitalSignature?: string;
  signedAt?: Date;
  signedBy?: Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const medicationItemSchema = new Schema<IMedicationItem>(
  {
    name: { type: String, required: true, trim: true },
    dosage: { type: String, required: true, trim: true },
    frequency: { type: String, required: true, trim: true },
    duration: { type: String, required: true, trim: true },
    instructions: { type: String, trim: true },
  },
  { _id: false }
);

const prescriptionSchema = new Schema<IPrescription>(
  {
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    medications: { type: [medicationItemSchema], required: true },
    status: {
      type: String,
      required: true,
      enum: ['DRAFT_PENDING_DOCTOR_SIGNATURE', 'ISSUED', 'DISPENSED', 'CANCELLED'],
      default: 'DRAFT_PENDING_DOCTOR_SIGNATURE',
      index: true,
    },
    digitalSignature: { type: String },
    signedAt: { type: Date },
    signedBy: { type: Schema.Types.ObjectId, ref: 'Doctor' },
    notes: { type: String },
  },
  {
    timestamps: true,
  }
);

prescriptionSchema.index({ patientId: 1, status: 1 });

export const PrescriptionModel = model<IPrescription>('Prescription', prescriptionSchema);
