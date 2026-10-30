import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { loadActor, requireActor } from '../../middleware/actor.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { bookingRateLimiter } from '../../middleware/rateLimiter';
import {
  validateBody,
  validateQuery,
  validateObjectIdParams,
  objectIdString,
  paginationQuery,
} from '../../middleware/validate';
import { AppError } from '../../middleware/errorHandler';
import { nameSchema, phoneSchema } from '../auth/auth.schemas';
import {
  createBooking,
  listPatientAppointments,
  patientSummary,
  transitionAppointment,
} from '../appointments/booking.service';
import { PatientModel } from './patient.model';
import { UserModel } from '../users/user.model';
import { isValidCalendarDate, TIME_RE } from '../../lib/ist-time';

export const patientDashboardRouter = Router();

patientDashboardRouter.use(authenticate, requireRole('PATIENT'), loadActor);

patientDashboardRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    res.status(200).json({ success: true, data: await patientSummary(actor.patientId as string) });
  })
);

const listQuery = z.object({ scope: z.enum(['upcoming', 'history']).default('upcoming'), ...paginationQuery });

patientDashboardRouter.get(
  '/appointments',
  validateQuery(listQuery),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const { scope, page, limit } = res.locals.query as z.infer<typeof listQuery>;
    res.status(200).json({
      success: true,
      data: await listPatientAppointments(actor.patientId as string, scope, page, limit),
    });
  })
);

const bookingBody = z.object({
  doctorId: objectIdString,
  date: z.string().refine(isValidCalendarDate, { message: 'Use a valid YYYY-MM-DD date' }),
  startTime: z.string().regex(TIME_RE, 'Use HH:mm'),
  mode: z.enum(['IN_PERSON', 'VIDEO']).default('IN_PERSON'),
  reason: z.string().trim().max(200, 'Keep the reason under 200 characters').optional(),
});

patientDashboardRouter.post(
  '/appointments',
  bookingRateLimiter,
  validateBody(bookingBody),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const rawKey = req.headers['idempotency-key'];
    const idempotencyKey = typeof rawKey === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(rawKey) ? rawKey : undefined;
    const { appointment, replayed } = await createBooking(actor, req.body, idempotencyKey);
    res.status(replayed ? 200 : 201).json({ success: true, data: appointment });
  })
);

const cancelBody = z.object({ reason: z.string().trim().max(200).optional() });

patientDashboardRouter.post(
  '/appointments/:id/cancel',
  bookingRateLimiter,
  validateObjectIdParams('id'),
  validateBody(cancelBody),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const data = await transitionAppointment(actor, req.params.id, 'cancel', req.body.reason);
    res.status(200).json({ success: true, data });
  })
);

const toProfile = (
  patient: { fullName: string; phone: string; dateOfBirth?: string; gender: string; specialId?: string },
  email: string
) => ({
  name: patient.fullName,
  email,
  phone: patient.phone,
  dateOfBirth: patient.dateOfBirth ?? null,
  gender: patient.gender,
  patientCode: patient.specialId ?? null,
});

patientDashboardRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const [patient, user] = await Promise.all([
      PatientModel.findById(actor.patientId).lean(),
      UserModel.findById(actor.userId).select('email').lean(),
    ]);
    if (!patient || !user) throw new AppError('Profile not found', 404, 'NOT_FOUND');
    res.status(200).json({ success: true, data: toProfile(patient, user.email) });
  })
);

const profileBody = z
  .object({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),
    dateOfBirth: z
      .string()
      .refine(isValidCalendarDate, { message: 'Use a valid YYYY-MM-DD date' })
      .refine((d) => d <= new Date().toISOString().slice(0, 10), { message: 'Date of birth cannot be in the future' })
      .nullable()
      .optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
  })
  .strict();

patientDashboardRouter.patch(
  '/profile',
  validateBody(profileBody),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const body = req.body as z.infer<typeof profileBody>;
    const patient = await PatientModel.findById(actor.patientId);
    const user = await UserModel.findById(actor.userId);
    if (!patient || !user) throw new AppError('Profile not found', 404, 'NOT_FOUND');

    if (body.name !== undefined) {
      patient.fullName = body.name;
      user.name = body.name;
    }
    if (body.phone !== undefined) patient.phone = body.phone;
    if (body.dateOfBirth !== undefined) patient.dateOfBirth = body.dateOfBirth ?? undefined;
    if (body.gender !== undefined) patient.gender = body.gender;
    await Promise.all([patient.save(), user.save()]);

    res.status(200).json({ success: true, data: toProfile(patient, user.email) });
  })
);
