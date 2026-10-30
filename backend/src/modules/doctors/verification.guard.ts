import { Request, Response, NextFunction } from 'express';
import { DoctorModel } from './doctor.model';
import { AppError } from '../../middleware/errorHandler';

export const requireVerifiedDoctor = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  if (!req.user || req.user.role !== 'DOCTOR') {
    return next(new AppError('Only doctors can access this resource', 403, 'FORBIDDEN'));
  }

  const doctor = await DoctorModel.findOne({ userId: req.user.userId });
  if (!doctor) {
    return next(new AppError('Doctor profile not found', 404, 'DOCTOR_NOT_FOUND'));
  }

  if (doctor.verificationStatus !== 'VERIFIED') {
    return next(
      new AppError(
        `Doctor account is not verified (status: ${doctor.verificationStatus}). Clinical actions are restricted.`,
        403,
        'DOCTOR_NOT_VERIFIED'
      )
    );
  }

  next();
};
