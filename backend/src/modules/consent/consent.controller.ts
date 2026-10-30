import { Request, Response, NextFunction } from 'express';
import { createConsentGrant, revokeConsentGrant } from './consent.service';
import { BreakTheGlassService } from './break-the-glass.service';
import { ConsentGrantModel } from './consent.model';
import { PatientModel } from '../patients/patient.model';
import { AppError } from '../../middleware/errorHandler';

export const grantConsentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'PATIENT') {
      throw new AppError('Only patients can grant medical record consent', 403, 'FORBIDDEN');
    }

    const patient = await PatientModel.findOne({ userId: req.user.userId });
    if (!patient) {
      throw new AppError('Patient profile not found', 404, 'NOT_FOUND');
    }

    const grant = await createConsentGrant(
      {
        patientId: patient._id.toString(),
        doctorId: req.body.doctorId,
        categories: req.body.categories,
        durationDays: req.body.durationDays,
        encounterId: req.body.encounterId,
      },
      req.user.userId
    );

    res.status(201).json({
      success: true,
      data: grant,
    });
  } catch (err) {
    next(err);
  }
};

export const revokeConsentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'PATIENT') {
      throw new AppError('Only patients can revoke consent', 403, 'FORBIDDEN');
    }

    const patient = await PatientModel.findOne({ userId: req.user.userId });
    if (!patient) {
      throw new AppError('Patient profile not found', 404, 'NOT_FOUND');
    }

    const grant = await revokeConsentGrant(req.params.id, patient._id.toString(), req.body.reason);

    res.status(200).json({
      success: true,
      data: grant,
    });
  } catch (err) {
    next(err);
  }
};

export const getMyConsentsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'PATIENT') {
      throw new AppError('Only patients can view granted consents', 403, 'FORBIDDEN');
    }

    const patient = await PatientModel.findOne({ userId: req.user.userId });
    if (!patient) {
      throw new AppError('Patient profile not found', 404, 'NOT_FOUND');
    }

    const grants = await ConsentGrantModel.find({ patientId: patient._id })
      .populate('doctorId', 'fullName specialization licenseNumber')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: grants,
    });
  } catch (err) {
    next(err);
  }
};

export const breakGlassEmergencyHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DOCTOR') {
      throw new AppError('Only doctors can execute break-the-glass emergency override', 403, 'FORBIDDEN');
    }

    const { patientId, justification } = req.body;
    if (!patientId || !justification) {
      throw new AppError('patientId and justification are required', 400, 'BAD_REQUEST');
    }

    const result = await BreakTheGlassService.executeBreakTheGlass(
      patientId,
      justification,
      req.user,
      req.ip,
      req.get('user-agent')
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};
