import { Types } from 'mongoose';
import { AvailabilityModel, IAvailability } from './availability.model';
import { AppointmentModel, ACTIVE_APPOINTMENT_STATUSES } from './appointment.model';
import { logAuditEvent } from '../audit/audit.service';
import { AppError } from '../../middleware/errorHandler';
import {
  istToUtc,
  istWeekday,
  istDayRange,
  minutesToTime,
  timeToMinutes,
  todayIst,
  utcToIstDate,
  utcToIstTime,
  addDaysIst,
} from '../../lib/ist-time';

export const BOOKING_WINDOW_DAYS = 60;
const MAX_WINDOWS_PER_DAY = 6;

export interface WeeklyRuleInput {
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
}

export interface SlotView {
  startTime: string; // HH:mm IST
  endTime: string;
  startsAt: string; // ISO instant
}

export interface AffectedBooking {
  appointmentId: string;
  date: string;
  startTime: string;
  status: string;
}

type WeeklyRule = Pick<IAvailability, 'weekday' | 'startTime' | 'endTime' | 'slotMinutes'>;

const slotGridForDate = (rules: WeeklyRule[], date: string): Array<{ start: number; end: number }> => {
  const weekday = istWeekday(date);
  const slots: Array<{ start: number; end: number }> = [];
  for (const rule of rules) {
    if (rule.weekday !== weekday || !rule.startTime || !rule.endTime || !rule.slotMinutes) continue;
    const end = timeToMinutes(rule.endTime);
    for (let s = timeToMinutes(rule.startTime); s + rule.slotMinutes <= end; s += rule.slotMinutes) {
      slots.push({ start: s, end: s + rule.slotMinutes });
    }
  }
  return slots.sort((a, b) => a.start - b.start);
};

export const validateWeeklyRules = (rules: WeeklyRuleInput[]): void => {
  const byDay = new Map<number, WeeklyRuleInput[]>();
  for (const rule of rules) {
    const start = timeToMinutes(rule.startTime);
    const end = timeToMinutes(rule.endTime);
    if (end <= start) {
      throw new AppError('End time must be after start time', 400, 'VALIDATION_ERROR', { rule });
    }
    if (end - start < rule.slotMinutes) {
      throw new AppError('Working window is shorter than one slot', 400, 'VALIDATION_ERROR', { rule });
    }
    byDay.set(rule.weekday, [...(byDay.get(rule.weekday) || []), rule]);
  }
  for (const [weekday, dayRules] of byDay) {
    if (dayRules.length > MAX_WINDOWS_PER_DAY) {
      throw new AppError(`At most ${MAX_WINDOWS_PER_DAY} windows per day`, 400, 'VALIDATION_ERROR', { weekday });
    }
    const sorted = [...dayRules].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (timeToMinutes(sorted[i].startTime) < timeToMinutes(sorted[i - 1].endTime)) {
        throw new AppError('Working windows on the same day overlap', 400, 'SCHEDULE_OVERLAP', { weekday });
      }
    }
  }
};

const futureActiveAppointments = async (doctorId: string, from: Date, to?: Date) =>
  AppointmentModel.find({
    doctorId: new Types.ObjectId(doctorId),
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    startTime: to ? { $gte: from, $lt: to } : { $gte: from },
  })
    .select('_id startTime status')
    .sort({ startTime: 1 })
    .lean();

const toAffected = (apt: { _id: Types.ObjectId; startTime: Date; status: string }): AffectedBooking => ({
  appointmentId: apt._id.toString(),
  date: utcToIstDate(apt.startTime),
  startTime: utcToIstTime(apt.startTime),
  status: apt.status,
});

export const getDoctorSchedule = async (doctorId: string) => {
  const [weekly, leaves] = await Promise.all([
    AvailabilityModel.find({ doctorId, type: 'WEEKLY' }).sort({ weekday: 1, startTime: 1 }).lean(),
    AvailabilityModel.find({ doctorId, type: 'LEAVE', date: { $gte: todayIst() } }).sort({ date: 1 }).lean(),
  ]);
  return {
    weekly: weekly.map((r) => ({
      id: r._id.toString(),
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
      slotMinutes: r.slotMinutes,
    })),
    leaves: leaves.map((l) => ({ id: l._id.toString(), date: l.date })),
  };
};

// Replaces the doctor's whole weekly schedule. Existing bookings are never auto-cancelled;
// if the new schedule no longer contains a booked slot the caller must pass confirm=true.
export const replaceWeeklySchedule = async (
  doctorId: string,
  hospitalId: string | undefined,
  actorUserId: string,
  rules: WeeklyRuleInput[],
  confirm: boolean
) => {
  validateWeeklyRules(rules);

  const upcoming = await futureActiveAppointments(doctorId, new Date());
  const affected = upcoming.filter((apt) => {
    const date = utcToIstDate(apt.startTime);
    const start = timeToMinutes(utcToIstTime(apt.startTime));
    return !slotGridForDate(rules, date).some((slot) => slot.start === start);
  });

  if (affected.length > 0 && !confirm) {
    throw new AppError(
      'Some existing bookings fall outside the new schedule. They will NOT be cancelled automatically.',
      409,
      'AFFECTS_BOOKINGS',
      { affected: affected.map(toAffected) }
    );
  }

  await AvailabilityModel.deleteMany({ doctorId, type: 'WEEKLY' });
  if (rules.length > 0) {
    await AvailabilityModel.insertMany(
      rules.map((r) => ({ ...r, doctorId, hospitalId, type: 'WEEKLY' }))
    );
  }

  await logAuditEvent({
    actorId: actorUserId,
    actorRole: 'DOCTOR',
    action: 'AVAILABILITY_UPDATE',
    resourceType: 'Availability',
    resourceId: doctorId,
    outcome: 'SUCCESS',
    details: { windows: rules.length, acknowledgedAffectedBookings: affected.length },
  });

  return { schedule: await getDoctorSchedule(doctorId), affected: affected.map(toAffected) };
};

export const addLeave = async (
  doctorId: string,
  hospitalId: string | undefined,
  actorUserId: string,
  date: string,
  confirm: boolean
) => {
  if (date < todayIst()) {
    throw new AppError('Leave date cannot be in the past', 400, 'VALIDATION_ERROR');
  }
  const { start, end } = istDayRange(date);
  const affected = await futureActiveAppointments(doctorId, start, end);
  if (affected.length > 0 && !confirm) {
    throw new AppError(
      'You have bookings on this date. They will NOT be cancelled automatically.',
      409,
      'AFFECTS_BOOKINGS',
      { affected: affected.map(toAffected) }
    );
  }

  try {
    await AvailabilityModel.create({ doctorId, hospitalId, type: 'LEAVE', date });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError('Leave already added for this date', 409, 'LEAVE_EXISTS');
    }
    throw err;
  }

  await logAuditEvent({
    actorId: actorUserId,
    actorRole: 'DOCTOR',
    action: 'AVAILABILITY_UPDATE',
    resourceType: 'Availability',
    resourceId: doctorId,
    outcome: 'SUCCESS',
    details: { leaveDate: date, acknowledgedAffectedBookings: affected.length },
  });

  return { schedule: await getDoctorSchedule(doctorId), affected: affected.map(toAffected) };
};

export const removeLeave = async (doctorId: string, leaveId: string) => {
  const result = await AvailabilityModel.deleteOne({ _id: leaveId, doctorId, type: 'LEAVE' });
  if (result.deletedCount === 0) {
    throw new AppError('Leave entry not found', 404, 'NOT_FOUND');
  }
  return getDoctorSchedule(doctorId);
};

// Bookable slots for one IST date: weekly grid − leave − already-booked − past
export const computeAvailableSlots = async (doctorId: string, date: string, now: Date = new Date()): Promise<SlotView[]> => {
  const today = todayIst(now);
  if (date < today || date > addDaysIst(today, BOOKING_WINDOW_DAYS)) {
    return [];
  }

  const [rules, leave] = await Promise.all([
    AvailabilityModel.find({ doctorId, type: 'WEEKLY', weekday: istWeekday(date) }).lean(),
    AvailabilityModel.exists({ doctorId, type: 'LEAVE', date }),
  ]);
  if (leave) return [];

  const { start, end } = istDayRange(date);
  const booked = await futureActiveAppointments(doctorId, start, end);
  const bookedStarts = new Set(booked.map((b) => b.startTime.getTime()));

  return slotGridForDate(rules, date)
    .map((slot) => ({
      startTime: minutesToTime(slot.start),
      endTime: minutesToTime(slot.end),
      instant: istToUtc(date, minutesToTime(slot.start)),
    }))
    .filter((slot) => slot.instant.getTime() > now.getTime() && !bookedStarts.has(slot.instant.getTime()))
    .map((slot) => ({ startTime: slot.startTime, endTime: slot.endTime, startsAt: slot.instant.toISOString() }));
};
