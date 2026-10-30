import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { requireVerifiedDoctor } from '../doctors/verification.guard';
import {
  createRecordHandler,
  getRecordHandler,
  streamFileHandler,
  uploadPhotoOcrHandler,
  getLabTrendsHandler,
} from './medical-record.controller';

export const medicalRecordRouter = Router();

medicalRecordRouter.use(authenticate);

// Creation restricted to verified clinicians
medicalRecordRouter.post('/', requireRole('DOCTOR'), requireVerifiedDoctor, createRecordHandler);

// Multimodal Report & Prescription Photo OCR (Patient or Clinician upload)
medicalRecordRouter.post('/photo-ocr', uploadPhotoOcrHandler);
medicalRecordRouter.post('/prescription-ocr', uploadPhotoOcrHandler);

// Longitudinal Lab Biomarker Trends
medicalRecordRouter.get('/patient/:patientId/lab-trends', getLabTrendsHandler);

// Read and file streaming protected by real-time ABAC consent checks
medicalRecordRouter.get('/:id', getRecordHandler);
medicalRecordRouter.get('/:id/files/:fileId', streamFileHandler);
