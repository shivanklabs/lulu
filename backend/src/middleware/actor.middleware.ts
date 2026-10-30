import { Request, Response, NextFunction } from 'express';
import { PatientModel } from '../modules/patients/patient.model';
import { DoctorModel, DoctorVerificationStatus } from '../modules/doctors/doctor.model';
import { AppError } from './errorHandler';

// Ownership scope for dashboard routes. Every query is scoped with these ids,
// never with ids supplied in the request body or URL.
export interface Actor {
  userId: string;
  role: 'PATIENT' | 'DOCTOR' | 'HOSPITAL' | 'ADMIN';
  patientId?: string;
  doctorId?: string;
  doctorVerificationStatus?: DoctorVerificationStatus;
  hospitalId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

export const loadActor = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const actor: Actor = { userId: req.user.userId, role: req.user.role, hospitalId: req.user.hospitalId };

    if (req.user.role === 'PATIENT') {
      const patient = await PatientModel.findOne({ userId: req.user.userId }).select('_id').lean();
      if (!patient) {
        throw new AppError('Patient profile not found', 404, 'PATIENT_NOT_FOUND');
      }
      actor.patientId = patient._id.toString();
    } else if (req.user.role === 'DOCTOR') {
      const doctor = await DoctorModel.findOne({ userId: req.user.userId })
        .select('_id verificationStatus hospitalId')
        .lean();
      if (!doctor) {
        throw new AppError('Doctor profile not found', 404, 'DOCTOR_NOT_FOUND');
      }
      actor.doctorId = doctor._id.toString();
      actor.doctorVerificationStatus = doctor.verificationStatus;
      actor.hospitalId = doctor.hospitalId ? doctor.hospitalId.toString() : actor.hospitalId;
    } else if (req.user.role === 'HOSPITAL') {
      if (!actor.hospitalId) {
        throw new AppError('This hospital admin account is not linked to a hospital', 403, 'HOSPITAL_NOT_LINKED');
      }
    }

    req.actor = actor;
    next();
  } catch (err) {
    next(err);
  }
};

export const requireActor = (req: Request): Actor => {
  if (!req.actor) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return req.actor;
};

// Clinical actions (confirm/complete/no-show, publishing availability) need a VERIFIED doctor
export const requireVerifiedDoctorActor = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.actor?.role !== 'DOCTOR' || req.actor.doctorVerificationStatus !== 'VERIFIED') {
    return next(
      new AppError(
        'Your doctor profile is not verified yet. Your hospital admin must verify it before you can manage appointments.',
        403,
        'DOCTOR_NOT_VERIFIED'
      )
    );
  }
  next();
};
