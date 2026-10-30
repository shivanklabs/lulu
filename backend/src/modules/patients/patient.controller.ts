import { Request, Response, NextFunction } from 'express';
import { PatientModel } from './patient.model';
import { AppError } from '../../middleware/errorHandler';

export const getMyPatientProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const patient = await PatientModel.findOne({ userId: req.user.userId });
    if (!patient) {
      throw new AppError('Patient profile not found', 404, 'NOT_FOUND');
    }

    res.status(200).json({
      success: true,
      data: patient,
    });
  } catch (err) {
    next(err);
  }
};
