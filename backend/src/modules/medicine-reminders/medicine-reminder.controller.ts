import { Request, Response, NextFunction } from 'express';
import {
  createMedicineReminder,
  dispatchDueReminders,
} from './medicine-reminder.scheduler';
import { MedicineReminderModel } from './medicine-reminder.model';
import { PatientModel } from '../patients/patient.model';
import { WhatsAppReminderAdapter } from '../../integrations/whatsapp-reminder.adapter';
import { WebPushNotificationAdapter } from '../../integrations/web-push-notification.adapter';
import { AppError } from '../../middleware/errorHandler';

export const createReminderHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const reminder = await createMedicineReminder(req.body, req.user);
    res.status(201).json({
      success: true,
      data: reminder,
    });
  } catch (err) {
    next(err);
  }
};

export const listMyRemindersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const patient = await PatientModel.findOne({ userId: req.user.userId });
    if (!patient) {
      throw new AppError('Patient profile not found', 404, 'PATIENT_NOT_FOUND');
    }

    const reminders = await MedicineReminderModel.find({
      patientId: patient._id,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: reminders,
    });
  } catch (err) {
    next(err);
  }
};

export const toggleReminderHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;
    const { status } = req.body;

    const reminder = await MedicineReminderModel.findById(id);
    if (!reminder) {
      throw new AppError('Reminder not found', 404, 'NOT_FOUND');
    }

    if (status) reminder.status = status;
    else reminder.status = reminder.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

    await reminder.save();

    res.status(200).json({
      success: true,
      data: reminder,
    });
  } catch (err) {
    next(err);
  }
};

export const triggerDispatchHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await dispatchDueReminders();
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const triggerSingleReminderHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reminder = await MedicineReminderModel.findById(req.params.id).populate('patientId');
    if (!reminder) {
      throw new AppError('Reminder not found', 404, 'NOT_FOUND');
    }

    const pat = reminder.patientId as unknown as { fullName?: string; phone?: string };
    const patName = pat?.fullName || 'Patient';
    const patPhone = reminder.whatsappNumber || pat?.phone || '+919999999999';

    const wa = await WhatsAppReminderAdapter.sendReminder({
      toPhoneNumber: patPhone,
      patientName: patName,
      medicineName: reminder.medicineName,
      dosage: reminder.dosage,
      timeLabel: reminder.scheduleTime,
      instructions: reminder.instructions,
    });

    const wp = await WebPushNotificationAdapter.sendPush({
      userId: reminder.userId.toString(),
      title: `Time for ${reminder.medicineName}`,
      body: `Dosage: ${reminder.dosage}`,
    });

    res.status(200).json({
      success: true,
      data: {
        delivery: {
          whatsApp: wa,
          webPush: wp,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};
