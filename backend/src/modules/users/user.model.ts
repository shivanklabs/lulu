import { Schema, model, Document, Types } from 'mongoose';

// HOSPITAL = hospital administrator for a single hospital (scoped by hospitalId).
// ADMIN = platform compliance administrator.
export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'HOSPITAL';

export interface IUser extends Document {
  name?: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  hospitalId?: Types.ObjectId;
  isActive: boolean;
  // Marks accounts created by the local/test seed script so they are never mistaken for real users
  isTestAccount: boolean;
  // Doctor invitation (only the SHA-256 hash of the one-time token is stored)
  inviteTokenHash?: string;
  inviteExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      enum: ['PATIENT', 'DOCTOR', 'ADMIN', 'HOSPITAL'],
      default: 'PATIENT',
      index: true,
    },
    hospitalId: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isTestAccount: {
      type: Boolean,
      default: false,
    },
    inviteTokenHash: {
      type: String,
      select: false,
      index: { sparse: true },
    },
    inviteExpiresAt: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

export const UserModel = model<IUser>('User', userSchema);
