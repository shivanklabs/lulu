import { Request, Response, NextFunction } from 'express';
import { IncognitoConsultService } from './incognito-consult.service';
import { IncognitoSessionModel } from './incognito-session.model';
import { PatientModel } from '../patients/patient.model';
import { AppError } from '../../middleware/errorHandler';

export const createIncognitoHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await IncognitoConsultService.createSession(req.body, req.user);
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const unlockVaultHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;
    const { pin } = req.body;
    if (!pin) {
      throw new AppError('PIN is required to unlock private vault', 400, 'BAD_REQUEST');
    }

    const result = await IncognitoConsultService.unlockVault(id, pin, req.user);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const updateVaultNotesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;
    const { pin, notes } = req.body;

    const result = await IncognitoConsultService.updateVaultNotes(id, pin, notes, req.user);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const getDoctorIncognitoHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DOCTOR') {
      throw new AppError('Only doctors can access clinician view', 403, 'FORBIDDEN');
    }

    const { id } = req.params;
    const result = await IncognitoConsultService.getDoctorMaskedView(id, req.user);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const listMyIncognitoSessionsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const patient = await PatientModel.findOne({ userId: req.user.userId });
    if (!patient) throw new AppError('Patient not found', 404, 'NOT_FOUND');

    const sessions = await IncognitoSessionModel.find({ patientId: patient._id })
      .populate('doctorId', 'fullName specialization')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: sessions,
    });
  } catch (err) {
    next(err);
  }
};
