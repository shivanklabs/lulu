import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { loadActor, requireActor, requireVerifiedDoctorActor } from '../../middleware/actor.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validateBody, validateQuery, validateObjectIdParams, paginationQuery } from '../../middleware/validate';
import { AppError } from '../../middleware/errorHandler';
import { phoneSchema } from '../auth/auth.schemas';
import {
  AppointmentAction,
  doctorSummary,
  listDoctorAppointments,
  transitionAppointment,
} from '../appointments/booking.service';
import { addLeave, getDoctorSchedule, removeLeave, replaceWeeklySchedule } from '../appointments/availability.service';
import { DoctorModel } from './doctor.model';
import { HospitalModel } from '../hospitals/hospital.model';
import { isValidCalendarDate, TIME_RE } from '../../lib/ist-time';

export const doctorDashboardRouter = Router();

doctorDashboardRouter.use(authenticate, requireRole('DOCTOR'), loadActor);

// --- Appointments ----------------------------------------------------------
doctorDashboardRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    res.status(200).json({ success: true, data: await doctorSummary(actor.doctorId as string) });
  })
);

const listQuery = z.object({
  scope: z.enum(['today', 'upcoming', 'pending', 'history']).default('today'),
  ...paginationQuery,
});

doctorDashboardRouter.get(
  '/appointments',
  validateQuery(listQuery),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const { scope, page, limit } = res.locals.query as z.infer<typeof listQuery>;
    res.status(200).json({
      success: true,
      data: await listDoctorAppointments(actor.doctorId as string, scope, page, limit),
    });
  })
);

const reasonBody = z.object({ reason: z.string().trim().min(3, 'Reason is too short').max(200).optional() });

const ACTION_ROUTES: Array<[string, AppointmentAction]> = [
  ['confirm', 'confirm'],
  ['decline', 'decline'],
  ['cancel', 'cancel'],
  ['complete', 'complete'],
  ['no-show', 'no_show'],
];

for (const [path, action] of ACTION_ROUTES) {
  doctorDashboardRouter.post(
    `/appointments/:id/${path}`,
    requireVerifiedDoctorActor,
    validateObjectIdParams('id'),
    validateBody(reasonBody),
    asyncHandler(async (req, res) => {
      const actor = requireActor(req);
      const data = await transitionAppointment(actor, req.params.id, action, req.body.reason);
      res.status(200).json({ success: true, data });
    })
  );
}

// --- Availability ----------------------------------------------------------
doctorDashboardRouter.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    res.status(200).json({ success: true, data: await getDoctorSchedule(actor.doctorId as string) });
  })
);

const weeklyBody = z.object({
  rules: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        startTime: z.string().regex(TIME_RE, 'Use HH:mm'),
        endTime: z.string().regex(TIME_RE, 'Use HH:mm'),
        slotMinutes: z.number().int().min(10).max(120),
      })
    )
    .max(42),
  confirm: z.boolean().default(false),
});

doctorDashboardRouter.put(
  '/availability/weekly',
  requireVerifiedDoctorActor,
  validateBody(weeklyBody),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const { rules, confirm } = req.body as z.infer<typeof weeklyBody>;
    const data = await replaceWeeklySchedule(actor.doctorId as string, actor.hospitalId, actor.userId, rules, confirm);
    res.status(200).json({ success: true, data });
  })
);

const leaveBody = z.object({
  date: z.string().refine(isValidCalendarDate, { message: 'Use a valid YYYY-MM-DD date' }),
  confirm: z.boolean().default(false),
});

doctorDashboardRouter.post(
  '/availability/leave',
  requireVerifiedDoctorActor,
  validateBody(leaveBody),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const { date, confirm } = req.body as z.infer<typeof leaveBody>;
    const data = await addLeave(actor.doctorId as string, actor.hospitalId, actor.userId, date, confirm);
    res.status(201).json({ success: true, data });
  })
);

doctorDashboardRouter.delete(
  '/availability/leave/:id',
  requireVerifiedDoctorActor,
  validateObjectIdParams('id'),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    res.status(200).json({ success: true, data: await removeLeave(actor.doctorId as string, req.params.id) });
  })
);

// --- Profile (verification status is read-only here) -------------------------
const loadProfile = async (doctorId: string) => {
  const doctor = await DoctorModel.findById(doctorId).lean();
  if (!doctor) throw new AppError('Profile not found', 404, 'NOT_FOUND');
  const hospital = doctor.hospitalId ? await HospitalModel.findById(doctor.hospitalId).lean() : null;
  const department = hospital?.departments.find((d) => doctor.departmentId && d._id.equals(doctor.departmentId));
  return {
    name: doctor.fullName,
    phone: doctor.phone ?? '',
    specialization: doctor.specialization,
    qualifications: doctor.qualifications ?? [],
    experienceYears: doctor.experienceYears,
    consultationFee: doctor.consultationFee,
    consultationModes: doctor.consultationModes ?? [],
    registrationNumber: doctor.licenseNumber,
    medicalCouncil: doctor.medicalCouncil,
    verificationStatus: doctor.verificationStatus,
    verificationNotes: doctor.verificationNotes ?? null,
    hospital: hospital ? { name: hospital.name } : null,
    department: department ? { name: department.name } : null,
  };
};

doctorDashboardRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    res.status(200).json({ success: true, data: await loadProfile(actor.doctorId as string) });
  })
);

// Name, registration number and verification are controlled by the hospital admin
const profileBody = z
  .object({
    phone: phoneSchema.optional(),
    qualifications: z.array(z.string().trim().min(2).max(80)).max(10).optional(),
    experienceYears: z.number().int().min(0).max(70).optional(),
    consultationFee: z.number().min(0).max(100000).optional(),
    consultationModes: z.array(z.enum(['IN_PERSON', 'VIDEO'])).min(1, 'Choose at least one mode').optional(),
  })
  .strict();

doctorDashboardRouter.patch(
  '/profile',
  validateBody(profileBody),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const body = req.body as z.infer<typeof profileBody>;
    const update = {
      ...body,
      ...(body.consultationModes ? { consultationModes: [...new Set(body.consultationModes)] } : {}),
    };
    await DoctorModel.updateOne({ _id: actor.doctorId }, { $set: update });
    res.status(200).json({ success: true, data: await loadProfile(actor.doctorId as string) });
  })
);
