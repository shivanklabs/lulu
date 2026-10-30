import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validateQuery, validateObjectIdParams, objectIdString } from '../../middleware/validate';
import { AppError } from '../../middleware/errorHandler';
import { HospitalModel } from '../hospitals/hospital.model';
import { DoctorModel } from '../doctors/doctor.model';
import { UserModel } from '../users/user.model';
import { computeAvailableSlots } from './availability.service';
import { isValidCalendarDate } from '../../lib/ist-time';

// Booking catalog: hospital → department → verified doctor → available slot.
// Only verified hospitals and verified, active doctors are ever listed.
export const catalogRouter = Router();

catalogRouter.use(authenticate, requireRole('PATIENT'));

const activeDoctorUserIds = async (userIds: Types.ObjectId[]): Promise<Set<string>> => {
  const users = await UserModel.find({ _id: { $in: userIds }, isActive: true }).select('_id').lean();
  return new Set(users.map((u) => u._id.toString()));
};

const loadVerifiedHospital = async (hospitalId: string) => {
  const hospital = await HospitalModel.findOne({ _id: hospitalId, isVerified: true }).lean();
  if (!hospital) throw new AppError('Hospital not found', 404, 'NOT_FOUND');
  return hospital;
};

catalogRouter.get(
  '/hospitals',
  asyncHandler(async (_req, res) => {
    const hospitals = await HospitalModel.find({ isVerified: true }).sort({ name: 1 }).lean();
    res.status(200).json({
      success: true,
      data: hospitals.map((h) => ({
        id: h._id.toString(),
        name: h.name,
        address: h.address,
        phone: h.phone,
        departmentCount: h.departments.filter((d) => d.isActive).length,
      })),
    });
  })
);

catalogRouter.get(
  '/hospitals/:hospitalId/departments',
  validateObjectIdParams('hospitalId'),
  asyncHandler(async (req, res) => {
    const hospital = await loadVerifiedHospital(req.params.hospitalId);
    res.status(200).json({
      success: true,
      data: hospital.departments.filter((d) => d.isActive).map((d) => ({ id: d._id.toString(), name: d.name })),
    });
  })
);

const doctorsQuery = z.object({ hospitalId: objectIdString, departmentId: objectIdString.optional() });

catalogRouter.get(
  '/doctors',
  validateQuery(doctorsQuery),
  asyncHandler(async (_req, res) => {
    const { hospitalId, departmentId } = res.locals.query as z.infer<typeof doctorsQuery>;
    const hospital = await loadVerifiedHospital(hospitalId);
    const doctors = await DoctorModel.find({
      hospitalId: hospital._id,
      verificationStatus: 'VERIFIED',
      ...(departmentId ? { departmentId: new Types.ObjectId(departmentId) } : {}),
    })
      .sort({ fullName: 1 })
      .lean();
    const active = await activeDoctorUserIds(doctors.map((d) => d.userId));
    const deptName = new Map(hospital.departments.map((d) => [d._id.toString(), d.name]));

    res.status(200).json({
      success: true,
      data: doctors
        .filter((d) => active.has(d.userId.toString()))
        .map((d) => ({
          id: d._id.toString(),
          name: d.fullName,
          specialization: d.specialization,
          qualifications: d.qualifications ?? [],
          experienceYears: d.experienceYears,
          consultationFee: d.consultationFee,
          consultationModes: d.consultationModes?.length ? d.consultationModes : ['IN_PERSON'],
          department: d.departmentId ? deptName.get(d.departmentId.toString()) : undefined,
        })),
    });
  })
);

const slotsQuery = z.object({
  date: z.string().refine(isValidCalendarDate, { message: 'Use a valid YYYY-MM-DD date' }),
});

catalogRouter.get(
  '/doctors/:doctorId/slots',
  validateObjectIdParams('doctorId'),
  validateQuery(slotsQuery),
  asyncHandler(async (req, res) => {
    const { date } = res.locals.query as z.infer<typeof slotsQuery>;
    const doctor = await DoctorModel.findOne({ _id: req.params.doctorId, verificationStatus: 'VERIFIED' }).lean();
    if (!doctor || !doctor.hospitalId) throw new AppError('Doctor not found', 404, 'NOT_FOUND');
    const [active, hospital] = await Promise.all([
      activeDoctorUserIds([doctor.userId]),
      HospitalModel.exists({ _id: doctor.hospitalId, isVerified: true }),
    ]);
    if (active.size === 0 || !hospital) throw new AppError('Doctor not found', 404, 'NOT_FOUND');

    res.status(200).json({ success: true, data: await computeAvailableSlots(doctor._id.toString(), date) });
  })
);
