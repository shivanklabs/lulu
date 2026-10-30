import { Types } from 'mongoose';
import {
  MedicineReminderModel,
  IMedicineReminder,
  ReminderFrequency,
  ReminderChannel,
} from './medicine-reminder.model';
import { PatientModel } from '../patients/patient.model';
import { WhatsAppReminderAdapter } from '../../integrations/whatsapp-reminder.adapter';
import { WebPushNotificationAdapter } from '../../integrations/web-push-notification.adapter';
import { createNotification } from '../notifications/notification.service';
import { logAuditEvent } from '../audit/audit.service';
import { TokenPayload } from '../../lib/crypto';
import { AppError } from '../../middleware/errorHandler';

export interface CreateReminderInput {
  patientId: string;
  prescriptionId?: string;
  medicineName: string;
  dosage: string;
  scheduleTime: string;
  frequency: ReminderFrequency;
  channel: ReminderChannel;
  whatsappNumber?: string;
  instructions?: string;
}

export const createMedicineReminder = async (
  input: CreateReminderInput,
  actor: TokenPayload
): Promise<IMedicineReminder> => {
  const patient = await PatientModel.findById(input.patientId);
  if (!patient) {
    throw new AppError('Patient profile not found', 404, 'PATIENT_NOT_FOUND');
  }

  // Next dispatch: 10 minutes from now or next matching time
  const nextDispatch = new Date(Date.now() + 10 * 60 * 1000);

  const reminder = await MedicineReminderModel.create({
    patientId: patient._id,
    userId: patient.userId,
    prescriptionId: input.prescriptionId ? new Types.ObjectId(input.prescriptionId) : undefined,
    medicineName: input.medicineName,
    dosage: input.dosage,
    scheduleTime: input.scheduleTime,
    frequency: input.frequency,
    channel: input.channel,
    status: 'ACTIVE',
    whatsappNumber: input.whatsappNumber || patient.phone,
    nextDispatchAt: nextDispatch,
    instructions: input.instructions,
  });

  await logAuditEvent({
    actorId: actor.userId,
    actorRole: actor.role,
    action: 'PHI_CREATE',
    resourceType: 'MedicineReminder',
    resourceId: (reminder._id as Types.ObjectId).toString(),
    patientId: input.patientId,
    outcome: 'SUCCESS',
    details: { medicineName: input.medicineName, channel: input.channel },
  });

  return reminder;
};

export const schedule3DayPostConsultCheckIn = async (
  patientId: string,
  doctorName: string
): Promise<IMedicineReminder> => {
  const patient = await PatientModel.findById(patientId);
  if (!patient) throw new Error('Patient not found');

  const checkInDate = new Date();
  checkInDate.setDate(checkInDate.getDate() + 3);

  const reminder = await MedicineReminderModel.create({
    patientId: patient._id,
    userId: patient.userId,
    medicineName: `Post-Consult Review (Dr. ${doctorName})`,
    dosage: 'Clinical Follow-up Check-in',
    scheduleTime: '10:00 AM',
    frequency: 'FOLLOWUP_CHECKUP',
    channel: 'BOTH',
    status: 'ACTIVE',
    whatsappNumber: patient.phone,
    nextDispatchAt: checkInDate,
    postConsultCheckIn: true,
    instructions: 'Automated 3-day post teleconsultation clinical recovery check-in.',
  });

  return reminder;
};

export const dispatchDueReminders = async (): Promise<{ dispatchedCount: number }> => {
  const now = new Date();
  const due = await MedicineReminderModel.find({
    status: 'ACTIVE',
    nextDispatchAt: { $lte: now },
  }).populate('patientId', 'fullName phone');

  let dispatchedCount = 0;

  for (const item of due) {
    const pat = item.patientId as unknown as { fullName?: string; phone?: string };
    const patName = pat?.fullName || 'Patient';
    const patPhone = item.whatsappNumber || pat?.phone || '';

    // WhatsApp Dispatch
    if (item.channel === 'WHATSAPP' || item.channel === 'BOTH') {
      await WhatsAppReminderAdapter.sendReminder({
        toPhoneNumber: patPhone,
        patientName: patName,
        medicineName: item.medicineName,
        dosage: item.dosage,
        timeLabel: item.scheduleTime,
        instructions: item.instructions,
        isCheckupFollowUp: item.postConsultCheckIn,
      });
    }

    // Web Push & In-App Notification
    if (item.channel === 'BROWSER_PUSH' || item.channel === 'BOTH') {
      await WebPushNotificationAdapter.sendPush({
        userId: item.userId.toString(),
        title: item.postConsultCheckIn ? 'MediBridge Follow-up' : `Time for ${item.medicineName}`,
        body: item.postConsultCheckIn
          ? 'It has been 3 days since your consultation. Click to log your recovery status.'
          : `Dosage: ${item.dosage}. ${item.instructions || ''}`,
      });

      await createNotification({
        userId: item.userId,
        title: item.postConsultCheckIn ? 'Clinical Follow-up' : 'Medicine Reminder',
        message: item.postConsultCheckIn
          ? 'It has been 3 days since your doctor consultation. How are you feeling?'
          : `Reminder to take ${item.medicineName} (${item.dosage}) at ${item.scheduleTime}.`,
        type: 'SYSTEM',
        metadata: { reminderId: item._id },
      });
    }

    // Schedule next cycle
    const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    item.lastDispatchedAt = now;
    item.nextDispatchAt = next;
    if (item.postConsultCheckIn) {
      item.status = 'COMPLETED';
    }
    await item.save();
    dispatchedCount++;
  }

  return { dispatchedCount };
};
