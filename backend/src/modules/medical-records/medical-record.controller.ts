import { Request, Response, NextFunction } from 'express';
import {
  createMedicalRecord,
  getMedicalRecordById,
  streamRecordFileAttachment,
} from './medical-record.service';
import { processReportOrPrescriptionPhoto } from './report-photo-ocr.service';
import { analyzePatientLabTrends } from './lab-trend-analyzer.service';
import { PatientModel } from '../patients/patient.model';
import { AppError } from '../../middleware/errorHandler';

export const createRecordHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DOCTOR') {
      throw new AppError('Only doctors can author medical records', 403, 'FORBIDDEN');
    }

    const record = await createMedicalRecord(req.body, req.user);
    res.status(201).json({
      success: true,
      data: record,
    });
  } catch (err) {
    next(err);
  }
};

export const getRecordHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const record = await getMedicalRecordById(req.params.id, req.user);
    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (err) {
    next(err);
  }
};

export const streamFileHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    await streamRecordFileAttachment(req.params.id, req.params.fileId, req.user, res);
  } catch (err) {
    next(err);
  }
};

export const uploadPhotoOcrHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { patientId, originalName, mimeType, fileBase64, notes, doctorId } = req.body;
    let resolvedPatientId = patientId;
    if (!resolvedPatientId && req.user.role === 'PATIENT') {
      const pat = await PatientModel.findOne({ userId: req.user.userId });
      resolvedPatientId = pat?._id?.toString();
    }

    if (!resolvedPatientId || !fileBase64) {
      throw new AppError('Missing required fields: patientId and fileBase64', 400, 'BAD_REQUEST');
    }

    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const result = await processReportOrPrescriptionPhoto(
      {
        patientId: resolvedPatientId,
        doctorId,
        originalName: originalName || 'report_photo.jpg',
        mimeType: mimeType || 'image/jpeg',
        fileBuffer,
        notes,
      },
      req.user
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const getLabTrendsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { patientId } = req.params;
    const trends = await analyzePatientLabTrends(patientId, req.user);
    res.status(200).json({
      success: true,
      data: trends,
    });
  } catch (err) {
    next(err);
  }
};
