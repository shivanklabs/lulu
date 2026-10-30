import { Schema, model, Document, Types } from 'mongoose';

export type IncognitoCategory =
  | 'SEXUAL_HEALTH'
  | 'MENTAL_HEALTH'
  | 'SUBSTANCE_RECOVERY'
  | 'SENSITIVE_CARE';

export type ConsultationChannelMode = 'CHAT' | 'AUDIO_ONLY' | 'BLURRED_VIDEO';

export interface IIncognitoSession extends Document {
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  pseudonym: string; // e.g. #MB-8472
  category: IncognitoCategory;
  channelMode: ConsultationChannelMode;
  vaultPinHash: string; // Salted bcryptjs hash
  encryptedVaultNotes?: string; // AES-256-GCM envelope
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}

const incognitoSessionSchema = new Schema<IIncognitoSession>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    pseudonym: { type: String, required: true, unique: true },
    category: {
      type: String,
      required: true,
      enum: ['SEXUAL_HEALTH', 'MENTAL_HEALTH', 'SUBSTANCE_RECOVERY', 'SENSITIVE_CARE'],
      default: 'SEXUAL_HEALTH',
    },
    channelMode: {
      type: String,
      required: true,
      enum: ['CHAT', 'AUDIO_ONLY', 'BLURRED_VIDEO'],
      default: 'BLURRED_VIDEO',
    },
    vaultPinHash: { type: String, required: true },
    encryptedVaultNotes: { type: String },
    status: {
      type: String,
      required: true,
      enum: ['ACTIVE', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const IncognitoSessionModel = model<IIncognitoSession>(
  'IncognitoSession',
  incognitoSessionSchema
);
