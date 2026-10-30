import { Schema, model, Document, Types } from 'mongoose';

export type DoctorVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
export type ConsultationMode = 'IN_PERSON' | 'VIDEO';

// This model is the DoctorProfile. `licenseNumber` holds the NMC / State Medical Council
// registration number; checking it against the official register is a manual hospital-admin step.
export interface IDoctor extends Document {
  userId: Types.ObjectId;
  hospitalId?: Types.ObjectId;
  departmentId?: Types.ObjectId;
  fullName: string;
  phone?: string;
  specialization: string;
  qualifications: string[];
  consultationModes: ConsultationMode[];
  licenseNumber: string;
  medicalCouncil: string;
  experienceYears: number;
  consultationFee: number;
  verificationStatus: DoctorVerificationStatus;
  verificationNotes?: string;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
  clinicAddress?: string;
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  createdAt: Date;
  updatedAt: Date;
}

const doctorSchema = new Schema<IDoctor>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', index: true },
    departmentId: { type: Schema.Types.ObjectId },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    specialization: { type: String, required: true, trim: true, index: true },
    qualifications: { type: [String], default: [] },
    consultationModes: {
      type: [{ type: String, enum: ['IN_PERSON', 'VIDEO'] }],
      default: ['IN_PERSON'],
    },
    licenseNumber: { type: String, required: true, unique: true, trim: true },
    medicalCouncil: { type: String, required: true, trim: true },
    experienceYears: { type: Number, required: true, min: 0 },
    consultationFee: { type: Number, required: true, min: 0 },
    verificationStatus: {
      type: String,
      required: true,
      enum: ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'],
      default: 'PENDING',
      index: true,
    },
    verificationNotes: { type: String },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    clinicAddress: { type: String, trim: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: [77.2090, 28.6139], // Default New Delhi coordinates
      },
    },
  },
  {
    timestamps: true,
  }
);

// 2dsphere index for nearby clinician spatial queries
doctorSchema.index({ location: '2dsphere' }, { sparse: true });

// Hospital-scoped catalog queries (hospital → department → verified doctors)
doctorSchema.index({ hospitalId: 1, departmentId: 1, verificationStatus: 1 });

export const DoctorModel = model<IDoctor>('Doctor', doctorSchema);
