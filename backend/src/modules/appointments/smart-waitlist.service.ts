import { Types } from 'mongoose';
import { WaitlistModel, IWaitlistEntry } from './waitlist.model';
import { DoctorModel } from '../doctors/doctor.model';
import { PatientModel } from '../patients/patient.model';
import { NotificationModel } from '../notifications/notification.model';
import { AppError } from '../../middleware/errorHandler';

export class SmartWaitlistService {
  /**
   * Registers a patient on the smart waitlist for a doctor on a specific date when slots are fully booked.
   */
  static async joinWaitlist(
    patientUserId: string,
    doctorId: string,
    preferredDate: Date | string
  ): Promise<IWaitlistEntry> {
    const patient = await PatientModel.findOne({ userId: patientUserId });
    if (!patient) {
      throw new AppError('Patient profile not found', 404, 'NOT_FOUND');
    }

    const doctor = await DoctorModel.findById(doctorId);
    if (!doctor) {
      throw new AppError('Doctor not found', 404, 'NOT_FOUND');
    }

    const date = new Date(preferredDate);
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    // Check if already in waitlist
    const existing = await WaitlistModel.findOne({
      patientId: patient._id,
      doctorId: doctor._id,
      preferredDate: startOfDay,
      status: 'WAITING',
    });

    if (existing) {
      return existing;
    }

    const entry = await WaitlistModel.create({
      patientId: patient._id,
      doctorId: doctor._id,
      preferredDate: startOfDay,
      status: 'WAITING',
    });

    return entry;
  }

  static async getMyWaitlists(patientUserId: string): Promise<IWaitlistEntry[]> {
    const patient = await PatientModel.findOne({ userId: patientUserId });
    if (!patient) {
      return [];
    }

    return WaitlistModel.find({ patientId: patient._id })
      .populate('doctorId', 'fullName specialization')
      .sort({ preferredDate: 1 });
  }

  /**
   * Automatically triggered when an appointment is cancelled.
   * Finds the first waiting patient and dispatches an immediate slot offer notification.
   */
  static async notifyWaitlistOnSlotCancellation(
    doctorId: string,
    slotId: string,
    slotStartTime: Date
  ): Promise<IWaitlistEntry | null> {
    const targetDate = new Date(slotStartTime);
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

    const nextWaitlistEntry = await WaitlistModel.findOne({
      doctorId: new Types.ObjectId(doctorId),
      preferredDate: startOfDay,
      status: 'WAITING',
    }).sort({ createdAt: 1 });

    if (!nextWaitlistEntry) {
      return null;
    }

    const offerExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
    nextWaitlistEntry.status = 'OFFERED';
    nextWaitlistEntry.offeredSlotId = new Types.ObjectId(slotId);
    nextWaitlistEntry.offeredUntil = offerExpires;
    nextWaitlistEntry.notificationSentAt = new Date();
    await nextWaitlistEntry.save();

    const patient = await PatientModel.findById(nextWaitlistEntry.patientId);
    if (patient) {
      await NotificationModel.create({
        userId: patient.userId,
        title: '🎉 Slot Opened from Waitlist!',
        message: `A slot opened for Dr. at ${new Date(slotStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. You have 15 minutes to confirm booking before it is offered to the next patient in line.`,
        type: 'SYSTEM',
        metadata: {
          slotId,
          waitlistId: (nextWaitlistEntry._id as Types.ObjectId).toString(),
          offeredUntil: offerExpires,
        },
      });
    }

    return nextWaitlistEntry;
  }
}
