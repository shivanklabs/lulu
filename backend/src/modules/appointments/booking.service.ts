import { Types, FilterQuery, UpdateQuery } from 'mongoose';
import { AppointmentModel, IAppointment, AppointmentStatus, AppointmentMode, ACTIVE_APPOINTMENT_STATUSES } from './appointment.model';
import { SlotModel } from './slot.model';
import { computeAvailableSlots } from './availability.service';
import { DoctorModel } from '../doctors/doctor.model';
import { HospitalModel } from '../hospitals/hospital.model';
import { PatientModel } from '../patients/patient.model';
import { UserModel } from '../users/user.model';
import { createConsentGrant } from '../consent/consent.service';
import { createNotification } from '../notifications/notification.service';
import { NotificationType } from '../notifications/notification.model';
import { logAuditEvent } from '../audit/audit.service';
import { AppError } from '../../middleware/errorHandler';
import { Actor } from '../../middleware/actor.middleware';
import { env } from '../../config/env';
import {
  istToUtc,
  istDayRange,
  istWeekRange,
  todayIst,
  utcToIstDate,
  utcToIstTime,
} from '../../lib/ist-time';

export const MAX_ACTIVE_BOOKINGS_PER_PATIENT = 5;
const ENCOUNTER_FOLLOW_UP_DAYS = 30;

export type AppointmentAction = 'cancel' | 'confirm' | 'decline' | 'complete' | 'no_show';

const FINAL_STATUSES: AppointmentStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
const BOOKED_STATUSES: AppointmentStatus[] = ['CONFIRMED', 'SCHEDULED'];

// ---------------------------------------------------------------------------
// Status rules — the single source of truth, enforced on every transition
// ---------------------------------------------------------------------------
export const allowedActions = (
  role: Actor['role'],
  apt: Pick<IAppointment, 'status' | 'startTime'>,
  now: Date = new Date()
): AppointmentAction[] => {
  const startMs = apt.startTime.getTime();
  const nowMs = now.getTime();
  const actions: AppointmentAction[] = [];

  if (role === 'PATIENT') {
    const cutoffMs = env.PATIENT_CANCEL_CUTOFF_HOURS * 60 * 60 * 1000;
    if (apt.status === 'PENDING' && startMs > nowMs) actions.push('cancel');
    if (BOOKED_STATUSES.includes(apt.status) && startMs - nowMs >= cutoffMs) actions.push('cancel');
  } else if (role === 'DOCTOR') {
    if (apt.status === 'PENDING' && startMs > nowMs) actions.push('confirm', 'decline');
    if (BOOKED_STATUSES.includes(apt.status) && startMs > nowMs) actions.push('cancel');
    if (BOOKED_STATUSES.includes(apt.status) && startMs <= nowMs) actions.push('complete', 'no_show');
  }
  return actions;
};

const explainRejectedAction = (role: Actor['role'], action: AppointmentAction, apt: IAppointment): string => {
  if (FINAL_STATUSES.includes(apt.status)) {
    return `This appointment is already ${apt.status.toLowerCase().replace('_', '-')} and cannot be changed.`;
  }
  if (role === 'PATIENT' && action === 'cancel') {
    return `Confirmed appointments can only be cancelled at least ${env.PATIENT_CANCEL_CUTOFF_HOURS} hour(s) before the start time. Please contact the hospital.`;
  }
  if (action === 'complete' || action === 'no_show') {
    return apt.status === 'PENDING'
      ? 'Confirm the appointment first.'
      : 'An appointment can only be marked completed or no-show after its start time.';
  }
  if (action === 'confirm' || action === 'decline') {
    return apt.status === 'PENDING'
      ? 'This request has already started or passed; it can no longer be confirmed or declined.'
      : 'Only pending requests can be confirmed or declined.';
  }
  return 'This action is not allowed for the appointment in its current state.';
};

// ---------------------------------------------------------------------------
// Views (role-appropriate projections — data minimisation)
// ---------------------------------------------------------------------------
interface PopulatedAppointment {
  _id: Types.ObjectId;
  status: AppointmentStatus;
  startTime: Date;
  endTime: Date;
  mode?: AppointmentMode;
  reason?: string;
  cancellationReason?: string;
  createdAt: Date;
  doctorId: { _id: Types.ObjectId; fullName: string; specialization: string; departmentId?: Types.ObjectId } | null;
  patientId: { _id: Types.ObjectId; fullName: string; phone?: string } | null;
  hospitalId: { _id: Types.ObjectId; name: string; address?: string } | null;
}

const baseView = (apt: PopulatedAppointment) => ({
  id: apt._id.toString(),
  status: apt.status,
  date: utcToIstDate(apt.startTime),
  startTime: utcToIstTime(apt.startTime),
  endTime: utcToIstTime(apt.endTime),
  startsAt: apt.startTime.toISOString(),
  mode: apt.mode ?? 'IN_PERSON',
  cancellationReason: apt.cancellationReason,
});

export const toPatientView = (apt: PopulatedAppointment, now = new Date()) => ({
  ...baseView(apt),
  reason: apt.reason,
  doctor: apt.doctorId ? { id: apt.doctorId._id.toString(), name: apt.doctorId.fullName, specialization: apt.doctorId.specialization } : null,
  hospital: apt.hospitalId ? { id: apt.hospitalId._id.toString(), name: apt.hospitalId.name, address: apt.hospitalId.address } : null,
  allowedActions: allowedActions('PATIENT', apt, now),
});

// Doctor sees only patient name, reason and contact — and only for their own appointments
export const toDoctorView = (apt: PopulatedAppointment, now = new Date()) => ({
  ...baseView(apt),
  reason: apt.reason,
  patient: apt.patientId ? { name: apt.patientId.fullName, phone: apt.patientId.phone } : null,
  allowedActions: allowedActions('DOCTOR', apt, now),
});

// Hospital admin sees scheduling data only: no reason, no patient contact
export const toHospitalView = (apt: PopulatedAppointment) => ({
  ...baseView(apt),
  doctor: apt.doctorId ? { id: apt.doctorId._id.toString(), name: apt.doctorId.fullName, specialization: apt.doctorId.specialization } : null,
  patient: apt.patientId ? { name: apt.patientId.fullName } : null,
});

const populated = (query: FilterQuery<IAppointment>) =>
  AppointmentModel.find(query)
    .populate('doctorId', 'fullName specialization departmentId')
    .populate('patientId', 'fullName phone')
    .populate('hospitalId', 'name address');

const paginate = async (
  query: FilterQuery<IAppointment>,
  sort: Record<string, 1 | -1>,
  page: number,
  limit: number
): Promise<{ items: PopulatedAppointment[]; total: number }> => {
  const [items, total] = await Promise.all([
    populated(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<PopulatedAppointment[]>(),
    AppointmentModel.countDocuments(query),
  ]);
  return { items, total };
};

export const pageMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------
export interface CreateBookingInput {
  doctorId: string;
  date: string;
  startTime: string;
  mode: AppointmentMode;
  reason?: string;
}

const requireBookableDoctor = async (doctorId: string) => {
  const doctor = await DoctorModel.findById(doctorId).lean();
  if (!doctor || doctor.verificationStatus !== 'VERIFIED' || !doctor.hospitalId) {
    throw new AppError('Doctor not found', 404, 'NOT_FOUND');
  }
  const [user, hospital] = await Promise.all([
    UserModel.findById(doctor.userId).select('isActive').lean(),
    HospitalModel.findById(doctor.hospitalId).select('name isVerified').lean(),
  ]);
  if (!user?.isActive || !hospital?.isVerified) {
    throw new AppError('Doctor not found', 404, 'NOT_FOUND');
  }
  return { doctor, hospital };
};

export const createBooking = async (actor: Actor, input: CreateBookingInput, idempotencyKey?: string) => {
  if (!actor.patientId) throw new AppError('Patient profile not found', 404, 'PATIENT_NOT_FOUND');
  const patientId = new Types.ObjectId(actor.patientId);
  const scopedKey = idempotencyKey ? `${actor.patientId}:${idempotencyKey}` : undefined;

  // Idempotent replay: the same patient re-sending the same key gets the original booking
  if (scopedKey) {
    const previous = await populated({ idempotencyKey: scopedKey, patientId }).lean<PopulatedAppointment[]>();
    if (previous.length > 0) return { appointment: toPatientView(previous[0]), replayed: true };
  }

  const { doctor, hospital } = await requireBookableDoctor(input.doctorId);
  const modes = doctor.consultationModes?.length ? doctor.consultationModes : ['IN_PERSON'];
  if (!modes.includes(input.mode)) {
    throw new AppError('This doctor does not offer the selected consultation mode', 400, 'MODE_NOT_OFFERED');
  }

  const activeCount = await AppointmentModel.countDocuments({
    patientId,
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    startTime: { $gte: new Date() },
  });
  if (activeCount >= MAX_ACTIVE_BOOKINGS_PER_PATIENT) {
    throw new AppError(
      `You can hold at most ${MAX_ACTIVE_BOOKINGS_PER_PATIENT} upcoming appointments at a time`,
      409,
      'TOO_MANY_ACTIVE_BOOKINGS'
    );
  }

  const slots = await computeAvailableSlots(doctor._id.toString(), input.date);
  const slot = slots.find((s) => s.startTime === input.startTime);
  if (!slot) {
    throw new AppError('This slot is no longer available. Please pick another time.', 409, 'SLOT_UNAVAILABLE');
  }

  const startTime = istToUtc(input.date, slot.startTime);
  const endTime = istToUtc(input.date, slot.endTime);

  let created: IAppointment;
  try {
    created = await AppointmentModel.create({
      patientId,
      doctorId: doctor._id,
      hospitalId: hospital._id,
      startTime,
      endTime,
      status: 'PENDING',
      mode: input.mode,
      reason: input.reason || undefined,
      consultationFee: doctor.consultationFee,
      idempotencyKey: scopedKey,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError('This slot was just booked by someone else. Please pick another time.', 409, 'SLOT_TAKEN');
    }
    throw err;
  }

  await createNotification({
    userId: doctor.userId,
    title: 'New appointment request',
    message: `New request for ${input.date} at ${slot.startTime}. Please confirm or decline.`,
    type: 'APPOINTMENT_BOOKED',
    metadata: { appointmentId: created._id },
  });

  await logAuditEvent({
    actorId: actor.userId,
    actorRole: 'PATIENT',
    action: 'PHI_CREATE',
    resourceType: 'Appointment',
    resourceId: created._id.toString(),
    patientId: actor.patientId,
    outcome: 'SUCCESS',
    details: { status: 'PENDING', doctorId: doctor._id.toString(), hospitalId: hospital._id.toString() },
  });

  const [view] = await populated({ _id: created._id }).lean<PopulatedAppointment[]>();
  return { appointment: toPatientView(view), replayed: false };
};

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------
const NEXT_STATUS: Record<AppointmentAction, AppointmentStatus> = {
  cancel: 'CANCELLED',
  decline: 'CANCELLED',
  confirm: 'CONFIRMED',
  complete: 'COMPLETED',
  no_show: 'NO_SHOW',
};

const NOTIFY: Record<AppointmentAction, { title: string; type: NotificationType }> = {
  cancel: { title: 'Appointment cancelled', type: 'APPOINTMENT_CANCELLED' },
  decline: { title: 'Appointment request declined', type: 'APPOINTMENT_CANCELLED' },
  confirm: { title: 'Appointment confirmed', type: 'APPOINTMENT_CONFIRMED' },
  complete: { title: 'Appointment completed', type: 'APPOINTMENT_UPDATED' },
  no_show: { title: 'Appointment marked as missed', type: 'APPOINTMENT_UPDATED' },
};

export const transitionAppointment = async (
  actor: Actor,
  appointmentId: string,
  action: AppointmentAction,
  reason?: string
) => {
  if (actor.role !== 'PATIENT' && actor.role !== 'DOCTOR') {
    throw new AppError('Not allowed', 403, 'FORBIDDEN');
  }
  const scope: FilterQuery<IAppointment> =
    actor.role === 'PATIENT'
      ? { patientId: new Types.ObjectId(actor.patientId) }
      : { doctorId: new Types.ObjectId(actor.doctorId) };

  // Not-owned and non-existent look identical (404) so ids cannot be probed
  const apt = await AppointmentModel.findOne({ _id: appointmentId, ...scope });
  if (!apt) throw new AppError('Appointment not found', 404, 'NOT_FOUND');

  const now = new Date();
  if (!allowedActions(actor.role, apt, now).includes(action)) {
    throw new AppError(explainRejectedAction(actor.role, action, apt), 409, 'INVALID_TRANSITION', {
      currentStatus: apt.status,
    });
  }
  if (actor.role === 'DOCTOR' && (action === 'decline' || action === 'cancel') && !reason) {
    throw new AppError('Please give a short reason for the patient', 400, 'VALIDATION_ERROR', {
      reason: ['Reason is required'],
    });
  }

  const nextStatus = NEXT_STATUS[action];
  const update: UpdateQuery<IAppointment> = { $set: { status: nextStatus } };
  if (nextStatus === 'CANCELLED') {
    update.$set = {
      ...update.$set,
      cancelledAt: now,
      cancelledBy: new Types.ObjectId(actor.userId),
      cancellationReason: reason || (actor.role === 'PATIENT' ? 'Cancelled by patient' : 'Cancelled by doctor'),
    };
  }
  if (nextStatus === 'CONFIRMED') update.$set = { ...update.$set, confirmedAt: now };
  if (nextStatus === 'COMPLETED') update.$set = { ...update.$set, completedAt: now };
  // Only active bookings hold the slot; releasing it lets others book the time again
  if (!ACTIVE_APPOINTMENT_STATUSES.includes(nextStatus)) update.$unset = { activeSlotKey: 1 };

  // Optimistic concurrency: only applies if nobody changed the status in between
  const updated = await AppointmentModel.findOneAndUpdate({ _id: apt._id, ...scope, status: apt.status }, update, {
    new: true,
  });
  if (!updated) {
    throw new AppError('This appointment was just updated. Please refresh.', 409, 'CONCURRENT_UPDATE');
  }

  // Legacy slot-flow bookings also release their Slot document
  if (nextStatus === 'CANCELLED' && updated.slotId) {
    await SlotModel.findByIdAndUpdate(updated.slotId, {
      $set: { status: 'AVAILABLE', heldByPatientId: null, heldUntil: null, holdToken: null, appointmentId: null },
      $inc: { version: 1 },
    });
  }

  // Encounter-scoped access (AGENTS.md §3) starts when the doctor accepts the consultation
  if (nextStatus === 'CONFIRMED') {
    await createConsentGrant(
      {
        patientId: updated.patientId.toString(),
        doctorId: updated.doctorId.toString(),
        categories: ['CLINICAL_NOTES', 'LAB_RESULTS', 'PRESCRIPTIONS', 'IMAGING_REPORTS'],
        encounterId: updated._id.toString(),
        durationDays: ENCOUNTER_FOLLOW_UP_DAYS,
      },
      actor.userId,
      'DOCTOR'
    );
  }

  // Notify the other party
  const when = `${utcToIstDate(updated.startTime)} at ${utcToIstTime(updated.startTime)}`;
  const recipient =
    actor.role === 'PATIENT'
      ? await DoctorModel.findById(updated.doctorId).select('userId').lean()
      : await PatientModel.findById(updated.patientId).select('userId').lean();
  if (recipient) {
    await createNotification({
      userId: recipient.userId,
      title: NOTIFY[action].title,
      message: `Appointment on ${when}: ${NOTIFY[action].title.toLowerCase()}.`,
      type: NOTIFY[action].type,
      metadata: { appointmentId: updated._id },
    });
  }

  await logAuditEvent({
    actorId: actor.userId,
    actorRole: actor.role,
    action: 'APPOINTMENT_STATUS_CHANGE',
    resourceType: 'Appointment',
    resourceId: updated._id.toString(),
    patientId: updated.patientId.toString(),
    outcome: 'SUCCESS',
    details: { from: apt.status, to: nextStatus, action },
  });

  const [view] = await populated({ _id: updated._id }).lean<PopulatedAppointment[]>();
  return actor.role === 'PATIENT' ? toPatientView(view) : toDoctorView(view);
};

// ---------------------------------------------------------------------------
// Patient queries
// ---------------------------------------------------------------------------
export const patientSummary = async (patientId: string) => {
  const pid = new Types.ObjectId(patientId);
  const now = new Date();
  const [upcoming, pending, completed] = await Promise.all([
    AppointmentModel.countDocuments({ patientId: pid, status: { $in: BOOKED_STATUSES }, startTime: { $gte: now } }),
    AppointmentModel.countDocuments({ patientId: pid, status: 'PENDING', startTime: { $gte: now } }),
    AppointmentModel.countDocuments({ patientId: pid, status: 'COMPLETED' }),
  ]);
  return { upcoming, pending, completed };
};

export const listPatientAppointments = async (
  patientId: string,
  scope: 'upcoming' | 'history',
  page: number,
  limit: number
) => {
  const pid = new Types.ObjectId(patientId);
  const now = new Date();
  const query: FilterQuery<IAppointment> =
    scope === 'upcoming'
      ? { patientId: pid, status: { $in: ACTIVE_APPOINTMENT_STATUSES }, startTime: { $gte: now } }
      : {
          patientId: pid,
          $or: [{ status: { $in: FINAL_STATUSES } }, { startTime: { $lt: now } }],
        };
  const { items, total } = await paginate(query, { startTime: scope === 'upcoming' ? 1 : -1 }, page, limit);
  return { items: items.map((a) => toPatientView(a, now)), pagination: pageMeta(page, limit, total) };
};

// ---------------------------------------------------------------------------
// Doctor queries
// ---------------------------------------------------------------------------
export type DoctorScope = 'today' | 'upcoming' | 'pending' | 'history';

export const doctorSummary = async (doctorId: string) => {
  const did = new Types.ObjectId(doctorId);
  const now = new Date();
  const { start, end } = istDayRange(todayIst(now));
  const [today, pending, upcoming] = await Promise.all([
    AppointmentModel.countDocuments({ doctorId: did, startTime: { $gte: start, $lt: end }, status: { $ne: 'CANCELLED' } }),
    AppointmentModel.countDocuments({ doctorId: did, status: 'PENDING', startTime: { $gte: now } }),
    AppointmentModel.countDocuments({ doctorId: did, status: { $in: BOOKED_STATUSES }, startTime: { $gte: end } }),
  ]);
  return { today, pending, upcoming };
};

export const listDoctorAppointments = async (doctorId: string, scope: DoctorScope, page: number, limit: number) => {
  const did = new Types.ObjectId(doctorId);
  const now = new Date();
  const { start, end } = istDayRange(todayIst(now));
  const queries: Record<DoctorScope, { query: FilterQuery<IAppointment>; sort: Record<string, 1 | -1> }> = {
    today: { query: { doctorId: did, startTime: { $gte: start, $lt: end } }, sort: { startTime: 1 } },
    upcoming: { query: { doctorId: did, status: { $in: BOOKED_STATUSES }, startTime: { $gte: end } }, sort: { startTime: 1 } },
    pending: { query: { doctorId: did, status: 'PENDING', startTime: { $gte: now } }, sort: { startTime: 1 } },
    history: {
      query: { doctorId: did, startTime: { $lt: start } },
      sort: { startTime: -1 },
    },
  };
  const { items, total } = await paginate(queries[scope].query, queries[scope].sort, page, limit);
  return { items: items.map((a) => toDoctorView(a, now)), pagination: pageMeta(page, limit, total) };
};

// ---------------------------------------------------------------------------
// Hospital queries (always scoped to the admin's hospital)
// ---------------------------------------------------------------------------
const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface HospitalAppointmentFilters {
  date?: string;
  doctorId?: string;
  status?: AppointmentStatus;
  q?: string;
  page: number;
  limit: number;
}

export const listHospitalAppointments = async (hospitalId: string, filters: HospitalAppointmentFilters) => {
  const hid = new Types.ObjectId(hospitalId);
  const query: FilterQuery<IAppointment> = { hospitalId: hid };

  if (filters.date) {
    const { start, end } = istDayRange(filters.date);
    query.startTime = { $gte: start, $lt: end };
  }
  if (filters.status) query.status = filters.status;
  if (filters.doctorId) query.doctorId = new Types.ObjectId(filters.doctorId);

  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), 'i');
    const [doctors, patients] = await Promise.all([
      DoctorModel.find({ hospitalId: hid, fullName: pattern }).select('_id').limit(200).lean(),
      PatientModel.find({ fullName: pattern }).select('_id').limit(200).lean(),
    ]);
    query.$or = [
      { doctorId: { $in: doctors.map((d) => d._id) } },
      { patientId: { $in: patients.map((p) => p._id) } },
    ];
  }

  const { items, total } = await paginate(query, { startTime: -1 }, filters.page, filters.limit);
  return { items: items.map(toHospitalView), pagination: pageMeta(filters.page, filters.limit, total) };
};

export const hospitalStats = async (hospitalId: string) => {
  const hid = new Types.ObjectId(hospitalId);
  const now = new Date();
  const { start, end } = istDayRange(todayIst(now));
  const week = istWeekRange(now);
  const [totalDoctors, verifiedDoctors, todayAppointments, pendingAppointments, completedThisWeek] = await Promise.all([
    DoctorModel.countDocuments({ hospitalId: hid }),
    DoctorModel.countDocuments({ hospitalId: hid, verificationStatus: 'VERIFIED' }),
    AppointmentModel.countDocuments({ hospitalId: hid, startTime: { $gte: start, $lt: end }, status: { $ne: 'CANCELLED' } }),
    AppointmentModel.countDocuments({ hospitalId: hid, status: 'PENDING', startTime: { $gte: now } }),
    AppointmentModel.countDocuments({ hospitalId: hid, status: 'COMPLETED', startTime: { $gte: week.start, $lt: week.end } }),
  ]);
  return { totalDoctors, verifiedDoctors, todayAppointments, pendingAppointments, completedThisWeek };
};

export const countActiveBookingsForDoctor = (doctorId: string) =>
  AppointmentModel.countDocuments({
    doctorId: new Types.ObjectId(doctorId),
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    startTime: { $gte: new Date() },
  });

