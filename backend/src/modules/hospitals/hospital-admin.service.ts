import crypto from 'crypto';
import { Types } from 'mongoose';
import { HospitalModel, IHospital } from './hospital.model';
import { DoctorModel, DoctorVerificationStatus, ConsultationMode } from '../doctors/doctor.model';
import { UserModel } from '../users/user.model';
import { hashInviteToken } from '../auth/auth.service';
import { countActiveBookingsForDoctor } from '../appointments/booking.service';
import { logAuditEvent } from '../audit/audit.service';
import { hashPassword } from '../../lib/crypto';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';

const loadHospital = async (hospitalId: string) => {
  const hospital = await HospitalModel.findById(hospitalId);
  if (!hospital) throw new AppError('Hospital not found', 404, 'NOT_FOUND');
  return hospital;
};

export const toHospitalProfile = (h: IHospital) => ({
  id: h._id.toString(),
  name: h.name,
  address: h.address,
  phone: h.phone,
  email: h.email,
  isVerified: h.isVerified,
  departments: h.departments.map((d) => ({ id: d._id.toString(), name: d.name, isActive: d.isActive })),
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export const getHospitalProfile = async (hospitalId: string) => toHospitalProfile(await loadHospital(hospitalId));

export const updateHospitalProfile = async (
  hospitalId: string,
  actorUserId: string,
  input: Partial<{ name: string; address: string; phone: string; email: string }>
) => {
  const hospital = await loadHospital(hospitalId);
  Object.assign(hospital, input);
  await hospital.save();
  await logAuditEvent({
    actorId: actorUserId,
    actorRole: 'HOSPITAL',
    action: 'HOSPITAL_UPDATE',
    resourceType: 'Hospital',
    resourceId: hospitalId,
    outcome: 'SUCCESS',
    details: { fields: Object.keys(input) },
  });
  return toHospitalProfile(hospital);
};

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------
export const listDepartments = async (hospitalId: string) => {
  const hospital = await loadHospital(hospitalId);
  const counts = await DoctorModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { hospitalId: hospital._id, departmentId: { $exists: true } } },
    { $group: { _id: '$departmentId', count: { $sum: 1 } } },
  ]);
  const byDept = new Map(counts.map((c) => [c._id.toString(), c.count]));
  return hospital.departments.map((d) => ({
    id: d._id.toString(),
    name: d.name,
    isActive: d.isActive,
    doctorCount: byDept.get(d._id.toString()) ?? 0,
  }));
};

const assertUniqueDepartmentName = (hospital: IHospital, name: string, exceptId?: string) => {
  const clash = hospital.departments.some(
    (d) => d.name.toLowerCase() === name.toLowerCase() && d._id.toString() !== exceptId
  );
  if (clash) throw new AppError('A department with this name already exists', 409, 'DEPARTMENT_EXISTS');
};

export const addDepartment = async (hospitalId: string, actorUserId: string, name: string) => {
  const hospital = await loadHospital(hospitalId);
  assertUniqueDepartmentName(hospital, name);
  hospital.departments.push({ name, isActive: true });
  await hospital.save();
  await logAuditEvent({
    actorId: actorUserId,
    actorRole: 'HOSPITAL',
    action: 'HOSPITAL_UPDATE',
    resourceType: 'Hospital',
    resourceId: hospitalId,
    outcome: 'SUCCESS',
    details: { departmentAdded: name },
  });
  return listDepartments(hospitalId);
};

export const updateDepartment = async (
  hospitalId: string,
  actorUserId: string,
  departmentId: string,
  input: { name?: string; isActive?: boolean }
) => {
  const hospital = await loadHospital(hospitalId);
  const dept = hospital.departments.id(departmentId);
  if (!dept) throw new AppError('Department not found', 404, 'NOT_FOUND');

  if (input.name !== undefined) {
    assertUniqueDepartmentName(hospital, input.name, departmentId);
    dept.name = input.name;
  }
  if (input.isActive === false && dept.isActive) {
    const doctorsInDept = await DoctorModel.countDocuments({ hospitalId: hospital._id, departmentId: dept._id });
    if (doctorsInDept > 0) {
      throw new AppError(
        `Move the ${doctorsInDept} doctor(s) in this department to another department first`,
        409,
        'DEPARTMENT_IN_USE'
      );
    }
  }
  if (input.isActive !== undefined) dept.isActive = input.isActive;
  await hospital.save();
  await logAuditEvent({
    actorId: actorUserId,
    actorRole: 'HOSPITAL',
    action: 'HOSPITAL_UPDATE',
    resourceType: 'Hospital',
    resourceId: hospitalId,
    outcome: 'SUCCESS',
    details: { departmentUpdated: departmentId, ...input },
  });
  return listDepartments(hospitalId);
};

// ---------------------------------------------------------------------------
// Doctors
// ---------------------------------------------------------------------------
export const listHospitalDoctors = async (hospitalId: string) => {
  const hospital = await loadHospital(hospitalId);
  const doctors = await DoctorModel.find({ hospitalId: hospital._id }).sort({ createdAt: -1 }).lean();
  const users = await UserModel.find({ _id: { $in: doctors.map((d) => d.userId) } })
    .select('email isActive +inviteTokenHash')
    .lean();
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const deptName = new Map(hospital.departments.map((d) => [d._id.toString(), d.name]));

  return doctors.map((d) => {
    const user = userById.get(d.userId.toString());
    return {
      id: d._id.toString(),
      name: d.fullName,
      email: user?.email,
      phone: d.phone,
      specialization: d.specialization,
      qualifications: d.qualifications ?? [],
      registrationNumber: d.licenseNumber,
      medicalCouncil: d.medicalCouncil,
      department: d.departmentId ? { id: d.departmentId.toString(), name: deptName.get(d.departmentId.toString()) } : null,
      consultationModes: d.consultationModes ?? [],
      verificationStatus: d.verificationStatus,
      verificationNotes: d.verificationNotes,
      isActive: user?.isActive ?? false,
      invitePending: Boolean(user?.inviteTokenHash),
    };
  });
};

export interface InviteDoctorInput {
  fullName: string;
  email: string;
  phone: string;
  specialization: string;
  departmentId: string;
  registrationNumber: string;
  medicalCouncil: string;
  qualifications: string[];
  consultationModes: ConsultationMode[];
  consultationFee: number;
  experienceYears: number;
}

const newInvite = () => {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(Date.now() + env.DOCTOR_INVITE_TTL_HOURS * 60 * 60 * 1000),
  };
};

const inviteResponse = (token: string, expiresAt: Date) => ({
  // Shown to the hospital admin ONCE. Only a SHA-256 hash is stored.
  inviteToken: token,
  invitePath: `/accept-invite?token=${token}`,
  inviteExpiresAt: expiresAt.toISOString(),
});

export const inviteDoctor = async (hospitalId: string, actorUserId: string, input: InviteDoctorInput) => {
  const hospital = await loadHospital(hospitalId);
  const dept = hospital.departments.id(input.departmentId);
  if (!dept || !dept.isActive) {
    throw new AppError('Select an active department', 400, 'VALIDATION_ERROR', { departmentId: ['Unknown department'] });
  }
  if (await UserModel.exists({ email: input.email })) {
    throw new AppError('An account with this email already exists', 409, 'EMAIL_EXISTS');
  }
  if (await DoctorModel.exists({ licenseNumber: input.registrationNumber })) {
    throw new AppError('A doctor with this registration number already exists', 409, 'REGISTRATION_EXISTS');
  }

  const invite = newInvite();
  // Unusable random password until the doctor accepts the invite and sets their own
  const placeholderHash = await hashPassword(crypto.randomBytes(32).toString('hex'));
  const user = await UserModel.create({
    name: input.fullName,
    email: input.email,
    passwordHash: placeholderHash,
    role: 'DOCTOR',
    hospitalId: hospital._id,
    isActive: false,
    inviteTokenHash: invite.tokenHash,
    inviteExpiresAt: invite.expiresAt,
  });

  let doctorId: string;
  try {
    const doctor = await DoctorModel.create({
      userId: user._id,
      hospitalId: hospital._id,
      departmentId: dept._id,
      fullName: input.fullName,
      phone: input.phone,
      specialization: input.specialization,
      qualifications: input.qualifications,
      consultationModes: input.consultationModes,
      licenseNumber: input.registrationNumber,
      medicalCouncil: input.medicalCouncil,
      consultationFee: input.consultationFee,
      experienceYears: input.experienceYears,
      verificationStatus: 'PENDING',
    });
    doctorId = doctor._id.toString();
  } catch (err) {
    await UserModel.deleteOne({ _id: user._id });
    if ((err as { code?: number }).code === 11000) {
      throw new AppError('A doctor with this registration number already exists', 409, 'REGISTRATION_EXISTS');
    }
    throw err;
  }

  await logAuditEvent({
    actorId: actorUserId,
    actorRole: 'HOSPITAL',
    action: 'DOCTOR_INVITE',
    resourceType: 'Doctor',
    resourceId: doctorId,
    outcome: 'SUCCESS',
    details: { hospitalId },
  });

  return { doctorId, ...inviteResponse(invite.token, invite.expiresAt) };
};

const loadOwnDoctor = async (hospitalId: string, doctorId: string) => {
  const doctor = await DoctorModel.findOne({ _id: doctorId, hospitalId: new Types.ObjectId(hospitalId) });
  if (!doctor) throw new AppError('Doctor not found', 404, 'NOT_FOUND');
  return doctor;
};

export const reissueDoctorInvite = async (hospitalId: string, actorUserId: string, doctorId: string) => {
  const doctor = await loadOwnDoctor(hospitalId, doctorId);
  const user = await UserModel.findById(doctor.userId).select('+inviteTokenHash');
  if (!user || !user.inviteTokenHash) {
    throw new AppError('This doctor has already accepted the invitation', 409, 'INVITE_ALREADY_ACCEPTED');
  }
  const invite = newInvite();
  user.inviteTokenHash = invite.tokenHash;
  user.inviteExpiresAt = invite.expiresAt;
  await user.save();
  await logAuditEvent({
    actorId: actorUserId,
    actorRole: 'HOSPITAL',
    action: 'DOCTOR_INVITE',
    resourceType: 'Doctor',
    resourceId: doctorId,
    outcome: 'SUCCESS',
    details: { reissued: true },
  });
  return inviteResponse(invite.token, invite.expiresAt);
};

export const setDoctorVerification = async (
  hospitalId: string,
  actorUserId: string,
  doctorId: string,
  status: Extract<DoctorVerificationStatus, 'PENDING' | 'VERIFIED' | 'REJECTED'>,
  notes?: string
) => {
  const doctor = await loadOwnDoctor(hospitalId, doctorId);
  doctor.verificationStatus = status;
  doctor.verificationNotes = notes;
  doctor.verifiedAt = status === 'VERIFIED' ? new Date() : undefined;
  doctor.verifiedBy = status === 'VERIFIED' ? new Types.ObjectId(actorUserId) : undefined;
  await doctor.save();

  await logAuditEvent({
    actorId: actorUserId,
    actorRole: 'HOSPITAL',
    action: 'DOCTOR_VERIFY',
    resourceType: 'Doctor',
    resourceId: doctorId,
    outcome: 'SUCCESS',
    details: { status, notes, method: 'MANUAL_REGISTRATION_CHECK' },
  });
  return { id: doctorId, verificationStatus: doctor.verificationStatus };
};

export const setDoctorActive = async (
  hospitalId: string,
  actorUserId: string,
  doctorId: string,
  isActive: boolean,
  confirm: boolean
) => {
  const doctor = await loadOwnDoctor(hospitalId, doctorId);
  const user = await UserModel.findById(doctor.userId).select('+inviteTokenHash');
  if (!user) throw new AppError('Doctor not found', 404, 'NOT_FOUND');
  if (isActive && user.inviteTokenHash) {
    throw new AppError('The doctor must accept the invitation before the account can be activated', 409, 'INVITE_PENDING');
  }

  if (!isActive) {
    const activeBookings = await countActiveBookingsForDoctor(doctorId);
    if (activeBookings > 0 && !confirm) {
      throw new AppError(
        `This doctor has ${activeBookings} upcoming booking(s). They will NOT be cancelled automatically.`,
        409,
        'AFFECTS_BOOKINGS',
        { activeBookings }
      );
    }
  }

  user.isActive = isActive;
  await user.save();
  await logAuditEvent({
    actorId: actorUserId,
    actorRole: 'HOSPITAL',
    action: 'DOCTOR_ACTIVATION_CHANGE',
    resourceType: 'Doctor',
    resourceId: doctorId,
    outcome: 'SUCCESS',
    details: { isActive },
  });
  return { id: doctorId, isActive };
};
