import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { MedicalRecordModel, IMedicalRecord } from './medical-record.model';
import { PatientModel } from '../patients/patient.model';
import { DoctorModel } from '../doctors/doctor.model';
import { encryptPhi, TokenPayload } from '../../lib/crypto';
import { scrubExifMetadata } from '../../lib/exif-scrubber';
import { AIProviderFactory } from '../../integrations/ai/ai.factory';
import { StructuredMedicalExtraction } from '../../integrations/gemini-multimodal.adapter';
import { logAuditEvent } from '../audit/audit.service';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';

export interface ProcessReportPhotoInput {
  patientId: string;
  doctorId?: string;
  encounterId?: string;
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
  notes?: string;
}

export interface ProcessedReportPhotoResult {
  record: IMedicalRecord;
  extraction: StructuredMedicalExtraction;
  fileId: string;
}

export const processReportOrPrescriptionPhoto = async (
  input: ProcessReportPhotoInput,
  actor: TokenPayload
): Promise<ProcessedReportPhotoResult> => {
  const patient = await PatientModel.findById(input.patientId);
  if (!patient) {
    throw new AppError('Patient profile not found', 404, 'PATIENT_NOT_FOUND');
  }

  // Determine doctor reference
  let doctorObjectId: Types.ObjectId;
  if (input.doctorId) {
    const doc = await DoctorModel.findById(input.doctorId);
    if (!doc) {
      throw new AppError('Specified doctor not found', 404, 'DOCTOR_NOT_FOUND');
    }
    doctorObjectId = doc._id as Types.ObjectId;
  } else {
    // If uploaded by doctor themselves
    if (actor.role === 'DOCTOR') {
      const doc = await DoctorModel.findOne({ userId: actor.userId });
      if (!doc) throw new AppError('Doctor not found', 404, 'DOCTOR_NOT_FOUND');
      doctorObjectId = doc._id as Types.ObjectId;
    } else {
      // Find a verified doctor or fallback to the first verified doctor in directory
      const verifiedDoc = await DoctorModel.findOne({ verificationStatus: 'VERIFIED' });
      if (!verifiedDoc) {
        throw new AppError('No verified clinician available to associate with report', 400, 'NO_CLINICIAN');
      }
      doctorObjectId = verifiedDoc._id as Types.ObjectId;
    }
  }

  // 1. Strip EXIF / Geolocation metadata
  const sanitizedBuffer = scrubExifMetadata(input.fileBuffer);

  // 2. Persist to secure storage directory for authenticated streaming proxy
  if (!fs.existsSync(env.STORAGE_LOCAL_DIR)) {
    fs.mkdirSync(env.STORAGE_LOCAL_DIR, { recursive: true });
  }

  const fileId = new Types.ObjectId().toString();
  const fileExt = path.extname(input.originalName) || (input.mimeType.includes('png') ? '.png' : '.jpg');
  const storageKey = `med_file_${fileId}${fileExt}`;
  const filePath = path.resolve(env.STORAGE_LOCAL_DIR, storageKey);
  fs.writeFileSync(filePath, sanitizedBuffer);

  const checksum = crypto.createHash('sha256').update(sanitizedBuffer).digest('hex');

  // 3. Extract structured JSON via Gemini Multimodal adapter
  const multimodal = AIProviderFactory.getMultimodalAdapter();
  const extraction = await multimodal.extractPrescriptionOrReport(sanitizedBuffer, input.mimeType);

  // 4. Encrypt extracted clinical notes and structured payload using AES-256-GCM
  const combinedPayload = {
    userNotes: input.notes || '',
    extracted: extraction,
    processedAt: new Date().toISOString(),
  };
  const encryptedNotes = encryptPhi(JSON.stringify(combinedPayload));

  const category =
    extraction.documentType === 'PRESCRIPTION' ? 'PRESCRIPTIONS' : 'LAB_RESULTS';

  const title =
    extraction.documentType === 'PRESCRIPTION'
      ? `Prescription OCR - ${extraction.date || new Date().toISOString().split('T')[0]}`
      : `Lab Report OCR - ${extraction.date || new Date().toISOString().split('T')[0]}`;

  const record = await MedicalRecordModel.create({
    patientId: patient._id,
    doctorId: doctorObjectId,
    encounterId: input.encounterId,
    category,
    title,
    encryptedNotes,
    attachments: [
      {
        fileId,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: sanitizedBuffer.length,
        storageKey,
        checksum,
        uploadedAt: new Date(),
      },
    ],
  });

  await logAuditEvent({
    actorId: actor.userId,
    actorRole: actor.role,
    action: 'PHI_CREATE',
    resourceType: 'MedicalRecord',
    resourceId: (record._id as Types.ObjectId).toString(),
    patientId: input.patientId,
    outcome: 'SUCCESS',
    details: {
      documentType: extraction.documentType,
      fileId,
      confidenceScore: extraction.confidenceScore,
    },
  });

  return {
    record,
    extraction,
    fileId,
  };
};
