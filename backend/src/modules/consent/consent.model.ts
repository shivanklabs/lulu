import { Schema, model, Document, Types } from 'mongoose';

export type MedicalRecordCategory = 'CLINICAL_NOTES' | 'LAB_RESULTS' | 'PRESCRIPTIONS' | 'IMAGING_REPORTS';
export type ConsentStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface IConsentGrant extends Document {
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  categories: MedicalRecordCategory[];
  encounterId?: string;
  status: ConsentStatus;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revocationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const consentGrantSchema = new Schema<IConsentGrant>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    categories: [
      {
        type: String,
        required: true,
        enum: ['CLINICAL_NOTES', 'LAB_RESULTS', 'PRESCRIPTIONS', 'IMAGING_REPORTS'],
      },
    ],
    encounterId: { type: String, index: true },
    status: {
      type: String,
      required: true,
      enum: ['ACTIVE', 'REVOKED', 'EXPIRED'],
      default: 'ACTIVE',
      index: true,
    },
    grantedAt: { type: Date, default: Date.now, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    revocationReason: { type: String },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast authorization evaluation
consentGrantSchema.index({ patientId: 1, doctorId: 1, status: 1 });

export const ConsentGrantModel = model<IConsentGrant>('ConsentGrant', consentGrantSchema);
