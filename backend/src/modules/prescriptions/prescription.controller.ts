import { Request, Response, NextFunction } from 'express';
import {
  draftPrescription,
  signAndIssuePrescription,
  getPrescriptionById,
} from './prescription.service';
import { generatePrescriptionUsageGuide } from './medicine-usage-guide.service';
import { checkPrescriptionConflicts } from './drug-allergy-conflict.service';
import { PrescriptionModel } from './prescription.model';
import { PatientModel } from '../patients/patient.model';
import { AppError } from '../../middleware/errorHandler';

export const draftPrescriptionHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DOCTOR') {
      throw new AppError('Only doctors can draft prescriptions', 403, 'FORBIDDEN');
    }

    const prescription = await draftPrescription(req.body, req.user);
    res.status(201).json({
      success: true,
      data: prescription,
    });
  } catch (err) {
    next(err);
  }
};

export const signPrescriptionHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DOCTOR') {
      throw new AppError('Only doctors can sign prescriptions', 403, 'FORBIDDEN');
    }

    const prescription = await signAndIssuePrescription(req.params.id, req.user);
    res.status(200).json({
      success: true,
      data: prescription,
    });
  } catch (err) {
    next(err);
  }
};

export const getPrescriptionHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prescription = await getPrescriptionById(req.params.id, req.user);
    res.status(200).json({
      success: true,
      data: prescription,
    });
  } catch (err) {
    next(err);
  }
};

export const listMyPrescriptionsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'PATIENT') {
      throw new AppError('Only patients can view their prescriptions list', 403, 'FORBIDDEN');
    }

    const patient = await PatientModel.findOne({ userId: req.user.userId });
    if (!patient) {
      throw new AppError('Patient profile not found', 404, 'NOT_FOUND');
    }

    const prescriptions = await PrescriptionModel.find({ patientId: patient._id })
      .populate('doctorId', 'fullName specialization licenseNumber')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: prescriptions,
    });
  } catch (err) {
    next(err);
  }
};

export const getUsageGuideHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const { id } = req.params;
    const language = (req.query.lang as 'en' | 'hi' | 'hinglish') || 'hinglish';
    const guides = await generatePrescriptionUsageGuide(id, req.user, language);
    res.status(200).json({
      success: true,
      data: guides,
    });
  } catch (err) {
    next(err);
  }
};

export const checkConflictsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const { patientId, medications } = req.body;
    if (!patientId || !Array.isArray(medications)) {
      throw new AppError('Missing required fields: patientId and medications array', 400, 'BAD_REQUEST');
    }
    const report = await checkPrescriptionConflicts(patientId, medications);
    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (err) {
    next(err);
  }
};
