import { Types } from 'mongoose';
import { AppointmentModel } from './appointment.model';
import { DoctorModel } from '../doctors/doctor.model';
import { PatientModel } from '../patients/patient.model';
import { NotificationModel } from '../notifications/notification.model';
import { AppError } from '../../middleware/errorHandler';

export interface OpdTokenInfo {
  tokenNumber: number;
  appointmentId: string;
  patientId: string;
  patientName: string;
  startTime: Date;
  status: string;
  estimatedWaitMinutes: number;
}

export interface DoctorQueueSummary {
  doctorId: string;
  doctorName: string;
  specialization: string;
  date: string;
  totalAppointments: number;
  currentServingToken: number;
  activePatientsInQueue: number;
  delayMinutes: number;
  delayReason?: string;
  tokens: OpdTokenInfo[];
}

export interface PatientQueueStatus {
  hasAppointmentToday: boolean;
  appointmentId?: string;
  doctorId?: string;
  doctorName?: string;
  tokenNumber?: number;
  currentServingToken?: number;
  patientsAhead?: number;
  estimatedWaitMinutes?: number;
  appointmentTime?: Date;
  delayMinutes?: number;
  status?: string;
}

// In-memory cache for live emergency OPD delay broadcasts
const doctorDelayMap = new Map<string, { delayMinutes: number; reason: string; timestamp: Date }>();

export class OpdLiveQueueService {
  /**
   * Retrieves full OPD queue breakdown for a doctor on a given day.
   */
  static async getDoctorOpdQueue(doctorId: string, dateStr?: string): Promise<DoctorQueueSummary> {
    const doctor = await DoctorModel.findById(doctorId);
    if (!doctor) {
      throw new AppError('Doctor not found', 404, 'NOT_FOUND');
    }

    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

    const appointments = await AppointmentModel.find({
      doctorId: new Types.ObjectId(doctorId),
      startTime: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['SCHEDULED', 'COMPLETED', 'NO_SHOW'] },
    })
      .sort({ startTime: 1 })
      .populate('patientId', 'fullName phone')
      .lean();

    const delayInfo = doctorDelayMap.get(doctorId) || { delayMinutes: 0, reason: '' };
    const avgConsultMinutes = 15;

    // Determine current serving token: first SCHEDULED appointment or last COMPLETED + 1
    let currentServingToken = 1;
    let foundFirstScheduled = false;

    const tokens: OpdTokenInfo[] = appointments.map((apt, index) => {
      const tokenNumber = index + 1;
      const patient = apt.patientId as unknown as { _id: Types.ObjectId; fullName?: string };
      const patientName = patient?.fullName || 'Confidential Patient';

      if (!foundFirstScheduled && apt.status === 'SCHEDULED') {
        currentServingToken = tokenNumber;
        foundFirstScheduled = true;
      }

      // Estimate wait time from current serving token
      const tokensAhead = Math.max(0, tokenNumber - currentServingToken);
      const estimatedWait = tokensAhead * avgConsultMinutes + (delayInfo.delayMinutes || 0);

      return {
        tokenNumber,
        appointmentId: (apt._id as Types.ObjectId).toString(),
        patientId: patient?._id ? (patient._id as Types.ObjectId).toString() : '',
        patientName,
        startTime: apt.startTime,
        status: apt.status,
        estimatedWaitMinutes: estimatedWait,
      };
    });

    if (!foundFirstScheduled && appointments.length > 0) {
      currentServingToken = appointments.length;
    }

    const activePatients = appointments.filter((a) => a.status === 'SCHEDULED').length;

    return {
      doctorId,
      doctorName: doctor.fullName,
      specialization: doctor.specialization,
      date: startOfDay.toISOString().slice(0, 10),
      totalAppointments: appointments.length,
      currentServingToken,
      activePatientsInQueue: activePatients,
      delayMinutes: delayInfo.delayMinutes,
      delayReason: delayInfo.reason,
      tokens,
    };
  }

  /**
   * Retrieves real-time token tracking status for a logged-in patient.
   */
  static async getPatientLiveQueueStatus(patientUserId: string): Promise<PatientQueueStatus> {
    const patient = await PatientModel.findOne({ userId: patientUserId });
    if (!patient) {
      return { hasAppointmentToday: false };
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Find next upcoming appointment today
    const appointment = await AppointmentModel.findOne({
      patientId: patient._id,
      startTime: { $gte: startOfDay, $lte: endOfDay },
      status: 'SCHEDULED',
    })
      .populate('doctorId', 'fullName specialization')
      .sort({ startTime: 1 })
      .lean();

    if (!appointment) {
      return { hasAppointmentToday: false };
    }

    const doctor = appointment.doctorId as unknown as { _id: Types.ObjectId; fullName: string };
    const queue = await this.getDoctorOpdQueue((doctor._id as Types.ObjectId).toString(), startOfDay.toISOString());

    const myToken = queue.tokens.find((t) => t.appointmentId === (appointment._id as Types.ObjectId).toString());
    const tokenNumber = myToken ? myToken.tokenNumber : 1;
    const patientsAhead = Math.max(0, tokenNumber - queue.currentServingToken);
    const estimatedWait = patientsAhead * 15 + (queue.delayMinutes || 0);

    return {
      hasAppointmentToday: true,
      appointmentId: (appointment._id as Types.ObjectId).toString(),
      doctorId: (doctor._id as Types.ObjectId).toString(),
      doctorName: doctor.fullName,
      tokenNumber,
      currentServingToken: queue.currentServingToken,
      patientsAhead,
      estimatedWaitMinutes: estimatedWait,
      appointmentTime: appointment.startTime,
      delayMinutes: queue.delayMinutes,
      status: appointment.status,
    };
  }

  /**
   * Verified doctors can broadcast clinic OPD delays (e.g., 15 mins due to emergency procedure).
   */
  static async broadcastDoctorDelay(
    doctorUserId: string,
    delayMinutes: number,
    reason: string
  ): Promise<{ doctorId: string; delayMinutes: number; reason: string }> {
    const doctor = await DoctorModel.findOne({ userId: doctorUserId });
    if (!doctor || doctor.verificationStatus !== 'VERIFIED') {
      throw new AppError('Only verified clinicians can broadcast queue delay updates', 403, 'FORBIDDEN');
    }

    const doctorId = (doctor._id as Types.ObjectId).toString();
    doctorDelayMap.set(doctorId, {
      delayMinutes,
      reason,
      timestamp: new Date(),
    });

    // Notify all patients booked for today
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const appointments = await AppointmentModel.find({
      doctorId: doctor._id,
      startTime: { $gte: startOfDay, $lte: endOfDay },
      status: 'SCHEDULED',
    }).populate('patientId', 'userId fullName');

    for (const apt of appointments) {
      const p = apt.patientId as unknown as { userId?: Types.ObjectId; fullName?: string };
      if (p?.userId) {
        await NotificationModel.create({
          userId: p.userId,
          title: '⏱️ OPD Queue Update: Delay Announced',
          message: `Dr. ${doctor.fullName}'s clinic has a ${delayMinutes}-minute delay. Reason: "${reason}". Your updated live wait time is available in your queue tracker.`,
          type: 'SYSTEM',
        });
      }
    }

    return { doctorId, delayMinutes, reason };
  }
}
