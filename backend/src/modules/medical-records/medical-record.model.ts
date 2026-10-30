import { Schema, model, Document, Types } from 'mongoose';
import { MedicalRecordCategory } from '../consent/consent.model';

export { MedicalRecordCategory };

export interface IMedicalFileAttachment {
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  checksum: string;
  uploadedAt: Date;
}

export interface IMedicalRecord extends Document {
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  encounterId?: string;
  category: MedicalRecordCategory;
  title: string;
  encryptedNotes: string; // AES-256-GCM envelope: enc:v1:<iv>:<tag>:<ciphertext>
  attachments: IMedicalFileAttachment[];
  createdAt: Date;
  updatedAt: Date;
}

const medicalFileAttachmentSchema = new Schema<IMedicalFileAttachment>(
  {
    fileId: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    storageKey: { type: String, required: true },
    checksum: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const medicalRecordSchema = new Schema<IMedicalRecord>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    encounterId: { type: String, index: true },
    category: {
      type: String,
      required: true,
      enum: ['CLINICAL_NOTES', 'LAB_RESULTS', 'PRESCRIPTIONS', 'IMAGING_REPORTS'],
      index: true,
    },
    title: { type: String, required: true, trim: true },
    encryptedNotes: { type: String, required: true },
    attachments: [medicalFileAttachmentSchema],
  },
  {
    timestamps: true,
  }
);

medicalRecordSchema.index({ patientId: 1, category: 1 });

export const MedicalRecordModel = model<IMedicalRecord>('MedicalRecord', medicalRecordSchema);
