import { Request, Response, NextFunction } from 'express';
import { DoctorModel, DoctorVerificationStatus } from './doctor.model';
import { NearbyDoctorMatcherService } from './nearby-doctor-matcher.service';
import { logAuditEvent } from '../audit/audit.service';
import { AppError } from '../../middleware/errorHandler';

export const listVerifiedDoctors = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const doctors = await DoctorModel.find({ verificationStatus: 'VERIFIED' })
      .select('fullName specialization licenseNumber medicalCouncil experienceYears consultationFee')
      .lean();

    res.status(200).json({
      success: true,
      data: doctors,
    });
  } catch (err) {
    next(err);
  }
};

export const getMyDoctorProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const doctor = await DoctorModel.findOne({ userId: req.user.userId });
    if (!doctor) {
      throw new AppError('Doctor profile not found', 404, 'NOT_FOUND');
    }

    res.status(200).json({
      success: true,
      data: doctor,
    });
  } catch (err) {
    next(err);
  }
};

export const updateDoctorVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body as { status: DoctorVerificationStatus; notes?: string };

    if (!['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'].includes(status)) {
      throw new AppError('Invalid verification status', 400, 'INVALID_STATUS');
    }

    const doctor = await DoctorModel.findById(id);
    if (!doctor) {
      throw new AppError('Doctor not found', 404, 'NOT_FOUND');
    }

    // Hospital-affiliated doctors are verified only by their own hospital admin
    if (doctor.hospitalId) {
      throw new AppError(
        'This doctor belongs to a hospital; verification is managed by that hospital admin',
        403,
        'HOSPITAL_SCOPED_DOCTOR'
      );
    }

    doctor.verificationStatus = status;
    doctor.verificationNotes = notes;
    if (status === 'VERIFIED') {
      doctor.verifiedAt = new Date();
    }
    await doctor.save();

    await logAuditEvent({
      actorId: req.user?.userId || 'unknown',
      actorRole: 'ADMIN',
      action: 'DOCTOR_VERIFY',
      resourceType: 'Doctor',
      resourceId: id,
      outcome: 'SUCCESS',
      details: { status, notes },
    });

    res.status(200).json({
      success: true,
      data: doctor,
    });
  } catch (err) {
    next(err);
  }
};

export const findNearbyDoctorsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { symptoms, lat, lng, radius } = req.query;
    const userLat = lat ? parseFloat(lat as string) : 28.6139;
    const userLng = lng ? parseFloat(lng as string) : 77.2090;
    const maxRadius = radius ? parseFloat(radius as string) : 50;

    const result = await NearbyDoctorMatcherService.findNearbySpecialists(
      (symptoms as string) || 'General health consultation',
      userLat,
      userLng,
      maxRadius
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const stageNearbyHoldHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'PATIENT') {
      throw new AppError('Only patients can hold appointment slots', 403, 'FORBIDDEN');
    }

    const { slotId } = req.body;
    if (!slotId) {
      throw new AppError('Missing slotId', 400, 'BAD_REQUEST');
    }

    const result = await NearbyDoctorMatcherService.stageNearbyHold(slotId, req.user);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const patientSpecialIdLookupHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || (req.user.role !== 'DOCTOR' && req.user.role !== 'ADMIN')) {
      throw new AppError('Only clinicians and administrators may access patient lookup', 403, 'FORBIDDEN');
    }

    const { specialId } = req.params;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] as string;

    const { PatientSpecialIdService } = await import('../patients/patient-special-id.service');
    const result = await PatientSpecialIdService.lookupPatientHistory(specialId, req.user, ipAddress, userAgent);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};
