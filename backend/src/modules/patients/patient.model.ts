import { Schema, model, Document, Types } from 'mongoose';

export interface IPatient extends Document {
  userId: Types.ObjectId;
  fullName: string;
  specialId?: string;
  dateOfBirth?: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
  phone: string;
  bloodGroup?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  allergies?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const patientSchema = new Schema<IPatient>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    fullName: { type: String, required: true, trim: true },
    specialId: { type: String, unique: true, sparse: true, index: true },
    // Optional: never fabricate a date of birth when the patient has not provided one
    dateOfBirth: { type: String },
    gender: {
      type: String,
      required: true,
      enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'],
      default: 'PREFER_NOT_TO_SAY',
    },
    phone: { type: String, required: true, trim: true },
    // Optional: no default — a wrong blood group is a clinical safety risk
    bloodGroup: { type: String, trim: true },
    emergencyContactName: { type: String, trim: true },
    emergencyContactPhone: { type: String, trim: true },
    allergies: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

export const PatientModel = model<IPatient>('Patient', patientSchema);
