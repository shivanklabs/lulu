import { Request, Response, NextFunction } from 'express';
import {
  createDoctorSlots,
  getAvailableDoctorSlots,
  holdSlotForPatient,
  confirmAppointmentBooking,
  cancelAppointmentBooking,
} from './appointment.service';
import { AppointmentModel } from './appointment.model';
import { PatientModel } from '../patients/patient.model';
import { DoctorModel } from '../doctors/doctor.model';
import { OpdLiveQueueService } from './opd-live-queue.service';
import { SmartWaitlistService } from './smart-waitlist.service';
import { AppError } from '../../middleware/errorHandler';

export const createSlotsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DOCTOR') {
      throw new AppError('Only doctors can publish slots', 403, 'FORBIDDEN');
    }

    const slots = await createDoctorSlots(req.body, req.user.userId);
    res.status(201).json({
      success: true,
      data: slots,
    });
  } catch (err) {
    next(err);
  }
};

export const getDoctorSlotsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query as { date?: string };
    const slots = await getAvailableDoctorSlots(doctorId, date);
    res.status(200).json({
      success: true,
      data: slots,
    });
  } catch (err) {
    next(err);
  }
};

export const holdSlotHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'PATIENT') {
      throw new AppError('Only patients can reserve appointment slots', 403, 'FORBIDDEN');
    }

    const result = await holdSlotForPatient(req.params.slotId, req.user);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const confirmBookingHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'PATIENT') {
      throw new AppError('Only patients can confirm appointment bookings', 403, 'FORBIDDEN');
    }

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    const appointment = await confirmAppointmentBooking(
      {
        slotId: req.body.slotId,
        holdToken: req.body.holdToken,
        idempotencyKey,
        notes: req.body.notes,
      },
      req.user
    );

    res.status(201).json({
      success: true,
      data: appointment,
    });
  } catch (err) {
    next(err);
  }
};

export const cancelBookingHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const appointment = await cancelAppointmentBooking(req.params.id, req.user, req.body.reason);
    res.status(200).json({
      success: true,
      data: appointment,
    });
  } catch (err) {
    next(err);
  }
};

export const listMyAppointmentsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    let appointments: unknown[] = [];
    if (req.user.role === 'PATIENT') {
      const patient = await PatientModel.findOne({ userId: req.user.userId });
      if (patient) {
        appointments = await AppointmentModel.find({ patientId: patient._id })
          .populate('doctorId', 'fullName specialization consultationFee licenseNumber')
          .sort({ startTime: -1 })
          .lean();
      }
    } else if (req.user.role === 'DOCTOR') {
      const doctor = await DoctorModel.findOne({ userId: req.user.userId });
      if (doctor) {
        appointments = await AppointmentModel.find({ doctorId: doctor._id })
          .populate('patientId', 'fullName phone dateOfBirth')
          .sort({ startTime: -1 })
          .lean();
      }
    }

    res.status(200).json({
      success: true,
      data: appointments,
    });
  } catch (err) {
    next(err);
  }
};

export const getDoctorOpdQueueHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query as { date?: string };
    const queue = await OpdLiveQueueService.getDoctorOpdQueue(doctorId, date);
    res.status(200).json({
      success: true,
      data: queue,
    });
  } catch (err) {
    next(err);
  }
};

export const getMyLiveQueueStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'PATIENT') {
      throw new AppError('Only patients can view their live queue tracking status', 403, 'FORBIDDEN');
    }

    const status = await OpdLiveQueueService.getPatientLiveQueueStatus(req.user.userId);
    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
};

export const broadcastDoctorDelayHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'DOCTOR') {
      throw new AppError('Only clinicians can broadcast delay announcements', 403, 'FORBIDDEN');
    }

    const { delayMinutes, reason } = req.body;
    if (delayMinutes === undefined || !reason) {
      throw new AppError('delayMinutes and reason are required', 400, 'BAD_REQUEST');
    }

    const result = await OpdLiveQueueService.broadcastDoctorDelay(
      req.user.userId,
      Number(delayMinutes),
      reason
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const joinWaitlistHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'PATIENT') {
      throw new AppError('Only patients can join the appointment waitlist', 403, 'FORBIDDEN');
    }

    const { doctorId, preferredDate } = req.body;
    if (!doctorId || !preferredDate) {
      throw new AppError('doctorId and preferredDate are required', 400, 'BAD_REQUEST');
    }

    const entry = await SmartWaitlistService.joinWaitlist(req.user.userId, doctorId, preferredDate);
    res.status(201).json({
      success: true,
      data: entry,
    });
  } catch (err) {
    next(err);
  }
};

export const getMyWaitlistsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'PATIENT') {
      throw new AppError('Only patients can view waitlist entries', 403, 'FORBIDDEN');
    }

    const entries = await SmartWaitlistService.getMyWaitlists(req.user.userId);
    res.status(200).json({
      success: true,
      data: entries,
    });
  } catch (err) {
    next(err);
  }
};
