import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { SlotModel, ISlot } from './slot.model';
import { AppointmentModel, IAppointment } from './appointment.model';
import { DoctorModel, IDoctor } from '../doctors/doctor.model';
import { PatientModel } from '../patients/patient.model';
import { ConsentGrantModel } from '../consent/consent.model';
import { createNotification } from '../notifications/notification.service';
import { logAuditEvent } from '../audit/audit.service';
import { SmartWaitlistService } from './smart-waitlist.service';
import { AppError } from '../../middleware/errorHandler';
import { TokenPayload } from '../../lib/crypto';
import { env } from '../../config/env';

export interface CreateSlotsInput {
  doctorId: string;
  slots: Array<{
    startTime: string | Date;
    endTime: string | Date;
  }>;
}

export const createDoctorSlots = async (input: CreateSlotsInput, doctorUserId: string): Promise<ISlot[]> => {
  const doctor = await DoctorModel.findOne({ userId: doctorUserId });
  if (!doctor || doctor.verificationStatus !== 'VERIFIED') {
    throw new AppError('Only verified doctors can publish appointment slots', 403, 'DOCTOR_NOT_VERIFIED');
  }

  const createdSlots: ISlot[] = [];

  for (const s of input.slots) {
    const startTime = new Date(s.startTime);
    const endTime = new Date(s.endTime);

    if (endTime <= startTime) {
      throw new AppError('Slot end time must be after start time', 400, 'INVALID_SLOT_TIME');
    }

    try {
      const slot = await SlotModel.create({
        doctorId: doctor._id,
        startTime,
        endTime,
        status: 'AVAILABLE',
      });
      createdSlots.push(slot);
    } catch (err: unknown) {
      // MongoDB 11000 duplicate key error on compound unique index { doctorId: 1, startTime: 1 }
      if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
        throw new AppError(
          `Slot at ${startTime.toISOString()} already exists for this doctor`,
          409,
          'SLOT_CONFLICT'
        );
      }
      throw err;
    }
  }

  return createdSlots;
};

export const getAvailableDoctorSlots = async (doctorId: string, date?: string): Promise<ISlot[]> => {
  const now = new Date();
  const query: Record<string, unknown> = {
    doctorId: new Types.ObjectId(doctorId),
    startTime: { $gte: now },
    $or: [
      { status: 'AVAILABLE' },
      { status: 'HELD', heldUntil: { $lt: now } }, // Expired holds appear as available
    ],
  };

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);
    query.startTime = { $gte: startOfDay > now ? startOfDay : now, $lte: endOfDay };
  }

  return SlotModel.find(query).sort({ startTime: 1 });
};

export interface HoldSlotResponse {
  slotId: string;
  holdToken: string;
  heldUntil: Date;
}

/**
 * Phase 1: Atomic Hold Acquisition
 * Uses conditional atomic findOneAndUpdate to prevent race-condition double booking.
 */
export const holdSlotForPatient = async (
  slotId: string,
  patientUser: TokenPayload
): Promise<HoldSlotResponse> => {
  const patient = await PatientModel.findOne({ userId: patientUser.userId });
  if (!patient) {
    throw new AppError('Patient profile not found', 404, 'PATIENT_NOT_FOUND');
  }

  const now = new Date();
  const holdToken = crypto.randomUUID();
  const heldUntil = new Date(Date.now() + 5 * 60 * 1000); // 5-minute checkout lock

  const heldSlot = await SlotModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(slotId),
      $or: [
        { status: 'AVAILABLE' },
        { status: 'HELD', heldUntil: { $lt: now } }, // Reclaim expired hold
      ],
    },
    {
      $set: {
        status: 'HELD',
        heldByPatientId: patient._id,
        heldUntil,
        holdToken,
      },
      $inc: { version: 1 },
    },
    { new: true }
  );

  if (!heldSlot) {
    throw new AppError(
      'This appointment slot is currently reserved or already booked by another patient.',
      409,
      'SLOT_UNAVAILABLE'
    );
  }

  return {
    slotId,
    holdToken,
    heldUntil,
  };
};

export interface ConfirmBookingInput {
  slotId: string;
  holdToken: string;
  idempotencyKey?: string;
  notes?: string;
}

/**
 * Phase 2: Final Atomic Booking Confirmation
 * Enforces hold token validity, non-expiry, and optional idempotency deduplication.
 */
export const confirmAppointmentBooking = async (
  input: ConfirmBookingInput,
  patientUser: TokenPayload
): Promise<IAppointment> => {
  const patient = await PatientModel.findOne({ userId: patientUser.userId });
  if (!patient) {
    throw new AppError('Patient profile not found', 404, 'PATIENT_NOT_FOUND');
  }

  // Idempotency check: Return existing appointment if retrying with identical key
  if (input.idempotencyKey) {
    const existing = await AppointmentModel.findOne({ idempotencyKey: input.idempotencyKey });
    if (existing) {
      return existing;
    }
  }

  const now = new Date();
  const client = mongoose.connection.getClient() as unknown as {
    topology?: { description?: { type?: string } };
  };
  const topologyType = client?.topology?.description?.type;
  const supportsTransactions = topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';

  const ALLOWED_NON_TRANSACTIONAL_ENVS = new Set(['development', 'test']);
  if (!supportsTransactions && !ALLOWED_NON_TRANSACTIONAL_ENVS.has(env.NODE_ENV)) {
    throw new AppError(
      `MongoDB replica set is required in environment "${env.NODE_ENV}" for atomic multi-document transactions`,
      500,
      'REPLICA_SET_REQUIRED'
    );
  }

  let appointment: IAppointment | null = null;
  let confirmedSlotStartTime: Date | null = null;
  let doctorObj: IDoctor | null = null;

  if (supportsTransactions) {
    const session = await mongoose.startSession();
    const txData: {
      appointment: IAppointment | null;
      confirmedSlotStartTime: Date | null;
      doctorObj: IDoctor | null;
    } = {
      appointment: null,
      confirmedSlotStartTime: null,
      doctorObj: null,
    };

    try {
      await session.withTransaction(async () => {
        // 1. Atomically claim held slot within transaction
        const confirmedSlot = await SlotModel.findOneAndUpdate(
          {
            _id: new Types.ObjectId(input.slotId),
            status: 'HELD',
            heldByPatientId: patient._id,
            holdToken: input.holdToken,
            heldUntil: { $gte: now },
          },
          {
            $set: {
              status: 'BOOKED',
            },
            $inc: { version: 1 },
          },
          { new: true, session }
        );

        if (!confirmedSlot) {
          throw new AppError(
            'The 5-minute reservation lock for this slot has expired or the token is invalid. Please reserve a slot again.',
            409,
            'HOLD_EXPIRED'
          );
        }

        txData.confirmedSlotStartTime = confirmedSlot.startTime;
        const doctor = await DoctorModel.findById(confirmedSlot.doctorId).session(session);
        txData.doctorObj = doctor;
        const consultationFee = doctor?.consultationFee || 500;

        // 2. Create Appointment within transaction
        const [createdApt] = await AppointmentModel.create(
          [
            {
              patientId: patient._id,
              doctorId: confirmedSlot.doctorId,
              slotId: confirmedSlot._id,
              startTime: confirmedSlot.startTime,
              endTime: confirmedSlot.endTime,
              status: 'SCHEDULED',
              consultationFee,
              idempotencyKey: input.idempotencyKey,
              clinicalNotesSummary: input.notes,
            },
          ],
          { session }
        );

        // 3. Link appointment ID back to slot within transaction
        confirmedSlot.appointmentId = createdApt._id as Types.ObjectId;
        await confirmedSlot.save({ session });

        // 4. Establish Encounter-Scoped Consent Grant automatically within transaction
        const encounterExpiry = new Date();
        encounterExpiry.setDate(encounterExpiry.getDate() + 30);

        await ConsentGrantModel.create(
          [
            {
              patientId: patient._id,
              doctorId: confirmedSlot.doctorId,
              categories: ['CLINICAL_NOTES', 'LAB_RESULTS', 'PRESCRIPTIONS', 'IMAGING_REPORTS'],
              encounterId: (createdApt._id as Types.ObjectId).toString(),
              status: 'ACTIVE',
              grantedAt: new Date(),
              expiresAt: encounterExpiry,
            },
          ],
          { session }
        );

        txData.appointment = createdApt;
      });
    } finally {
      await session.endSession();
    }

    appointment = txData.appointment;
    confirmedSlotStartTime = txData.confirmedSlotStartTime;
    doctorObj = txData.doctorObj;
  } else {
    // Non-production fallback for standalone single-node dev / test environments
    const confirmedSlot = await SlotModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(input.slotId),
        status: 'HELD',
        heldByPatientId: patient._id,
        holdToken: input.holdToken,
        heldUntil: { $gte: now },
      },
      {
        $set: {
          status: 'BOOKED',
        },
        $inc: { version: 1 },
      },
      { new: true }
    );

    if (!confirmedSlot) {
      throw new AppError(
        'The 5-minute reservation lock for this slot has expired or the token is invalid. Please reserve a slot again.',
        409,
        'HOLD_EXPIRED'
      );
    }

    confirmedSlotStartTime = confirmedSlot.startTime;
    const doctor = await DoctorModel.findById(confirmedSlot.doctorId);
    doctorObj = doctor;
    const consultationFee = doctor?.consultationFee || 500;

    const [createdApt] = await AppointmentModel.create([
      {
        patientId: patient._id,
        doctorId: confirmedSlot.doctorId,
        slotId: confirmedSlot._id,
        startTime: confirmedSlot.startTime,
        endTime: confirmedSlot.endTime,
        status: 'SCHEDULED',
        consultationFee,
        idempotencyKey: input.idempotencyKey,
        clinicalNotesSummary: input.notes,
      },
    ]);

    confirmedSlot.appointmentId = createdApt._id as Types.ObjectId;
    await confirmedSlot.save();

    const encounterExpiry = new Date();
    encounterExpiry.setDate(encounterExpiry.getDate() + 30);

    await ConsentGrantModel.create([
      {
        patientId: patient._id,
        doctorId: confirmedSlot.doctorId,
        categories: ['CLINICAL_NOTES', 'LAB_RESULTS', 'PRESCRIPTIONS', 'IMAGING_REPORTS'],
        encounterId: (createdApt._id as Types.ObjectId).toString(),
        status: 'ACTIVE',
        grantedAt: new Date(),
        expiresAt: encounterExpiry,
      },
    ]);

    appointment = createdApt;
  }

  if (!appointment) {
    throw new AppError('Failed to execute atomic appointment confirmation transaction', 500, 'TRANSACTION_FAILED');
  }

  // Dispatch In-App Notifications
  await createNotification({
    userId: patient.userId,
    title: 'Appointment Confirmed',
    message: `Your appointment with Dr. ${doctorObj?.fullName || 'Physician'} is confirmed for ${confirmedSlotStartTime?.toLocaleString()}.`,
    type: 'APPOINTMENT_BOOKED',
    metadata: { appointmentId: appointment._id },
  });

  if (doctorObj) {
    await createNotification({
      userId: doctorObj.userId,
      title: 'New Consultation Booked',
      message: `${patient.fullName} has booked an appointment for ${confirmedSlotStartTime?.toLocaleString()}.`,
      type: 'APPOINTMENT_BOOKED',
      metadata: { appointmentId: appointment._id },
    });
  }

  // Audit Trail
  await logAuditEvent({
    actorId: patientUser.userId,
    actorRole: 'PATIENT',
    action: 'PHI_CREATE',
    resourceType: 'Appointment',
    resourceId: (appointment._id as Types.ObjectId).toString(),
    patientId: patient._id.toString(),
    outcome: 'SUCCESS',
    details: { slotId: input.slotId, startTime: confirmedSlotStartTime },
  });

  return appointment;
};

export const cancelAppointmentBooking = async (
  appointmentId: string,
  user: TokenPayload,
  reason?: string
): Promise<IAppointment> => {
  const appointment = await AppointmentModel.findById(appointmentId);
  if (!appointment) {
    throw new AppError('Appointment not found', 404, 'NOT_FOUND');
  }

  if (appointment.status === 'CANCELLED') {
    throw new AppError('Appointment is already cancelled', 400, 'ALREADY_CANCELLED');
  }

  // Finished consultations are part of the record and can never be cancelled
  if (appointment.status === 'COMPLETED' || appointment.status === 'NO_SHOW') {
    throw new AppError(
      `Appointment is already ${appointment.status.toLowerCase()} and cannot be cancelled`,
      409,
      'INVALID_TRANSITION'
    );
  }

  // Verify caller is either the patient, the doctor, or an admin
  let authorized = false;
  if (user.role === 'ADMIN') {
    authorized = true;
  } else if (user.role === 'PATIENT') {
    const patient = await PatientModel.findOne({ userId: user.userId });
    if (patient && patient._id.toString() === appointment.patientId.toString()) {
      authorized = true;
    }
  } else if (user.role === 'DOCTOR') {
    const doctor = await DoctorModel.findOne({ userId: user.userId });
    if (doctor && doctor._id.toString() === appointment.doctorId.toString()) {
      authorized = true;
    }
  }

  if (!authorized) {
    throw new AppError('Unauthorized to cancel this appointment', 403, 'FORBIDDEN');
  }

  appointment.status = 'CANCELLED';
  appointment.cancellationReason = reason || 'Cancelled by user';
  appointment.cancelledAt = new Date();
  appointment.cancelledBy = new Types.ObjectId(user.userId);
  await appointment.save();

  // Release the slot back to AVAILABLE so other patients can book it (legacy slot-flow bookings only)
  if (appointment.slotId) {
    await SlotModel.findByIdAndUpdate(appointment.slotId, {
      $set: {
        status: 'AVAILABLE',
        heldByPatientId: null,
        heldUntil: null,
        holdToken: null,
        appointmentId: null,
      },
      $inc: { version: 1 },
    });

    // Evaluate waitlist and notify next waiting patient
    SmartWaitlistService.notifyWaitlistOnSlotCancellation(
      appointment.doctorId.toString(),
      appointment.slotId.toString(),
      appointment.startTime
    ).catch(() => {});
  }

  // Notify Patient
  const patient = await PatientModel.findById(appointment.patientId);
  if (patient) {
    await createNotification({
      userId: patient.userId,
      title: 'Appointment Cancelled',
      message: `Your appointment scheduled for ${appointment.startTime.toLocaleString()} has been cancelled.`,
      type: 'APPOINTMENT_CANCELLED',
      metadata: { appointmentId: appointment._id, reason },
    });
  }

  // Notify Doctor
  const doctor = await DoctorModel.findById(appointment.doctorId);
  if (doctor) {
    await createNotification({
      userId: doctor.userId,
      title: 'Consultation Cancelled',
      message: `The consultation for ${appointment.startTime.toLocaleString()} has been cancelled.`,
      type: 'APPOINTMENT_CANCELLED',
      metadata: { appointmentId: appointment._id, reason },
    });
  }

  // Audit
  await logAuditEvent({
    actorId: user.userId,
    actorRole: user.role,
    action: 'PHI_UPDATE',
    resourceType: 'Appointment',
    resourceId: appointmentId,
    patientId: appointment.patientId.toString(),
    outcome: 'SUCCESS',
    details: { reason },
  });

  return appointment;
};
