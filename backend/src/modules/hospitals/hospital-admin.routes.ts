import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { loadActor, requireActor } from '../../middleware/actor.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  validateBody,
  validateQuery,
  validateObjectIdParams,
  objectIdString,
  paginationQuery,
} from '../../middleware/validate';
import { emailSchema, nameSchema, phoneSchema } from '../auth/auth.schemas';
import { hospitalStats, listHospitalAppointments } from '../appointments/booking.service';
import {
  addDepartment,
  getHospitalProfile,
  inviteDoctor,
  listDepartments,
  listHospitalDoctors,
  reissueDoctorInvite,
  setDoctorActive,
  setDoctorVerification,
  updateDepartment,
  updateHospitalProfile,
} from './hospital-admin.service';
import { isValidCalendarDate } from '../../lib/ist-time';

// Every handler is scoped to req.actor.hospitalId (from the database, never the request)
export const hospitalAdminRouter = Router();

hospitalAdminRouter.use(authenticate, requireRole('HOSPITAL'), loadActor);

const hid = (req: Parameters<typeof requireActor>[0]): string => requireActor(req).hospitalId as string;

// --- Metrics -----------------------------------------------------------------
hospitalAdminRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, data: await hospitalStats(hid(req)) });
  })
);

// --- Doctors -----------------------------------------------------------------
hospitalAdminRouter.get(
  '/doctors',
  asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, data: await listHospitalDoctors(hid(req)) });
  })
);

const inviteBody = z.object({
  fullName: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  specialization: z.string().trim().min(2).max(80),
  departmentId: objectIdString,
  registrationNumber: z
    .string()
    .trim()
    .min(3, 'Registration number is required')
    .max(40)
    .regex(/^[A-Za-z0-9/-]+$/, 'Only letters, numbers, "/" and "-"'),
  medicalCouncil: z.string().trim().min(2).max(120),
  qualifications: z.array(z.string().trim().min(2).max(80)).min(1, 'Add at least one qualification').max(10),
  consultationModes: z.array(z.enum(['IN_PERSON', 'VIDEO'])).min(1).default(['IN_PERSON']),
  consultationFee: z.number().min(0).max(100000),
  experienceYears: z.number().int().min(0).max(70),
});

hospitalAdminRouter.post(
  '/doctors',
  validateBody(inviteBody),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const data = await inviteDoctor(hid(req), actor.userId, req.body);
    res.status(201).json({ success: true, data });
  })
);

hospitalAdminRouter.post(
  '/doctors/:id/invite',
  validateObjectIdParams('id'),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    res.status(200).json({ success: true, data: await reissueDoctorInvite(hid(req), actor.userId, req.params.id) });
  })
);

const verificationBody = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
  notes: z.string().trim().max(500).optional(),
});

hospitalAdminRouter.patch(
  '/doctors/:id/verification',
  validateObjectIdParams('id'),
  validateBody(verificationBody),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const { status, notes } = req.body as z.infer<typeof verificationBody>;
    const data = await setDoctorVerification(hid(req), actor.userId, req.params.id, status, notes);
    res.status(200).json({ success: true, data });
  })
);

const activeBody = z.object({ isActive: z.boolean(), confirm: z.boolean().default(false) });

hospitalAdminRouter.patch(
  '/doctors/:id/active',
  validateObjectIdParams('id'),
  validateBody(activeBody),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const { isActive, confirm } = req.body as z.infer<typeof activeBody>;
    const data = await setDoctorActive(hid(req), actor.userId, req.params.id, isActive, confirm);
    res.status(200).json({ success: true, data });
  })
);

// --- Departments -------------------------------------------------------------
hospitalAdminRouter.get(
  '/departments',
  asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, data: await listDepartments(hid(req)) });
  })
);

const departmentName = z.string().trim().min(2, 'Name is too short').max(80);

hospitalAdminRouter.post(
  '/departments',
  validateBody(z.object({ name: departmentName })),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    res.status(201).json({ success: true, data: await addDepartment(hid(req), actor.userId, req.body.name) });
  })
);

const departmentPatch = z
  .object({ name: departmentName.optional(), isActive: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, { message: 'Nothing to update' });

hospitalAdminRouter.patch(
  '/departments/:id',
  validateObjectIdParams('id'),
  validateBody(departmentPatch),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const data = await updateDepartment(hid(req), actor.userId, req.params.id, req.body);
    res.status(200).json({ success: true, data });
  })
);

// --- Appointments ------------------------------------------------------------
const appointmentsQuery = z.object({
  date: z.string().refine(isValidCalendarDate, { message: 'Use a valid YYYY-MM-DD date' }).optional(),
  doctorId: objectIdString.optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  q: z.string().trim().min(2).max(60).optional(),
  ...paginationQuery,
});

hospitalAdminRouter.get(
  '/appointments',
  validateQuery(appointmentsQuery),
  asyncHandler(async (req, res) => {
    const filters = res.locals.query as z.infer<typeof appointmentsQuery>;
    res.status(200).json({ success: true, data: await listHospitalAppointments(hid(req), filters) });
  })
);

// --- Hospital profile ----------------------------------------------------------
hospitalAdminRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, data: await getHospitalProfile(hid(req)) });
  })
);

const profileBody = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    address: z.string().trim().min(5).max(300).optional(),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
  })
  .strict();

hospitalAdminRouter.patch(
  '/profile',
  validateBody(profileBody),
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    res.status(200).json({ success: true, data: await updateHospitalProfile(hid(req), actor.userId, req.body) });
  })
);
