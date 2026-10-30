import { Schema, model, Document } from 'mongoose';
import { BloodGroupType, OrganTissueType } from './blood-organ-bank.model';

export type MedicalFitnessStatus = 'FIT_APPROVED' | 'SCREENING_IN_PROGRESS' | 'TEMPORARILY_DEFERRED';

export interface IAnonymizedDonor extends Document {
  donorAliasId: string; // e.g. #DONOR-8821
  bloodGroup: BloodGroupType;
  organOrTissueType: OrganTissueType;
  hlaMatchPercentage: number;
  ageBracket: string; // e.g. '25-35'
  medicalFitnessStatus: MedicalFitnessStatus;
  nodalRegistryCode: string; // e.g. 'NOTTO-DL-402'
  distanceKm: number;
  isAvailable: boolean;
  // Anti-trafficking & privacy safeguards:
  // Zero PII stored here. Internal hashes only for statutory verification
  registryAuditHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const anonymizedDonorSchema = new Schema<IAnonymizedDonor>(
  {
    donorAliasId: { type: String, required: true, unique: true, index: true },
    bloodGroup: {
      type: String,
      required: true,
      enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
      index: true,
    },
    organOrTissueType: {
      type: String,
      required: true,
      enum: ['BLOOD', 'KIDNEY', 'LIVER', 'CORNEA', 'HEART', 'BONE_MARROW'],
      index: true,
    },
    hlaMatchPercentage: { type: Number, required: true, min: 0, max: 100 },
    ageBracket: { type: String, required: true },
    medicalFitnessStatus: {
      type: String,
      required: true,
      enum: ['FIT_APPROVED', 'SCREENING_IN_PROGRESS', 'TEMPORARILY_DEFERRED'],
      default: 'FIT_APPROVED',
    },
    nodalRegistryCode: { type: String, required: true },
    distanceKm: { type: Number, required: true, default: 12 },
    isAvailable: { type: Boolean, required: true, default: true, index: true },
    registryAuditHash: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

export const AnonymizedDonorModel = model<IAnonymizedDonor>('AnonymizedDonor', anonymizedDonorSchema);
