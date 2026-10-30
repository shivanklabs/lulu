import crypto from 'crypto';
import { UserModel, UserRole, IUser } from '../users/user.model';
import { PatientModel } from '../patients/patient.model';
import { DoctorModel } from '../doctors/doctor.model';
import { HospitalModel } from '../hospitals/hospital.model';
import { RegisterBody } from './auth.schemas';
import { hashPassword, comparePassword, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/crypto';
import { logAuditEvent } from '../audit/audit.service';
import { AppError } from '../../middleware/errorHandler';

export interface PublicUser {
  id: string;
  name?: string;
  email: string;
  role: UserRole;
  hospitalId?: string;
}

export const toPublicUser = (user: IUser): PublicUser => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  hospitalId: user.hospitalId ? user.hospitalId.toString() : undefined,
});

const issueTokens = (user: IUser): { accessToken: string; refreshToken: string } => {
  const tokenPayload = { userId: user._id.toString(), role: user.role, email: user.email };
  return { accessToken: signAccessToken(tokenPayload), refreshToken: signRefreshToken(tokenPayload) };
};

export const hashInviteToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

// Public self-registration: always creates a PATIENT. Doctors are invited by their hospital admin,
// hospital admins are created by the bootstrap CLI. Input is validated by registerSchema.
export const registerUser = async (
  input: RegisterBody
): Promise<{ user: IUser; accessToken: string; refreshToken: string }> => {
  const existing = await UserModel.findOne({ email: input.email.toLowerCase() });
  if (existing) {
    throw new AppError('An account with this email already exists', 409, 'EMAIL_EXISTS');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await UserModel.create({
    name: input.fullName,
    email: input.email.toLowerCase(),
    passwordHash,
    role: 'PATIENT',
  });

  const specialCode = crypto.randomInt(1000, 10000);
  const specialId = `#MB-PAT-${specialCode}`;
  try {
    await PatientModel.create({
      userId: user._id,
      fullName: input.fullName,
      specialId,
      phone: input.phone,
      // Only store what the patient actually provided — no fabricated defaults
      dateOfBirth: input.dateOfBirth,
      bloodGroup: input.bloodGroup,
      gender: input.gender || 'PREFER_NOT_TO_SAY',
    });
  } catch (err) {
    // Do not leave an orphan login without a patient profile
    await UserModel.deleteOne({ _id: user._id });
    throw err;
  }

  const { accessToken, refreshToken } = issueTokens(user);

  await logAuditEvent({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: 'AUTH_REGISTER',
    resourceType: 'User',
    resourceId: user._id.toString(),
    outcome: 'SUCCESS',
  });

  if (input.privacyPolicyAccepted) {
    await logAuditEvent({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'PRIVACY_CONSENT_ACKNOWLEDGED',
      resourceType: 'User',
      resourceId: user._id.toString(),
      outcome: 'SUCCESS',
      details: {
        privacyPolicyAccepted: true,
        acceptedAt: new Date().toISOString(),
        governingAct: 'DPDPA 2023',
      },
    });
  }

  return { user, accessToken, refreshToken };
};

// A doctor invited by a hospital admin sets a password with the one-time token and is activated.
export const acceptDoctorInvite = async (
  token: string,
  password: string
): Promise<{ user: IUser; accessToken: string; refreshToken: string }> => {
  const user = await UserModel.findOne({
    inviteTokenHash: hashInviteToken(token),
    inviteExpiresAt: { $gt: new Date() },
  });
  if (!user) {
    throw new AppError('This invitation link is invalid or has expired', 400, 'INVITE_INVALID');
  }

  user.passwordHash = await hashPassword(password);
  user.isActive = true;
  user.inviteTokenHash = undefined;
  user.inviteExpiresAt = undefined;
  await user.save();

  await logAuditEvent({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: 'AUTH_INVITE_ACCEPTED',
    resourceType: 'User',
    resourceId: user._id.toString(),
    outcome: 'SUCCESS',
  });

  return { user, ...issueTokens(user) };
};

export const loginUser = async (
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string,
  expectedRole?: IUser['role']
): Promise<{ user: IUser; accessToken: string; refreshToken: string }> => {
  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (!user) {
    await logAuditEvent({
      actorId: 'anonymous',
      actorRole: 'SYSTEM',
      action: 'AUTH_LOGIN',
      resourceType: 'User',
      ipAddress,
      userAgent,
      outcome: 'DENIED',
      details: { email },
    });
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const matches = await comparePassword(password, user.passwordHash);
  if (!matches) {
    await logAuditEvent({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'AUTH_LOGIN',
      resourceType: 'User',
      ipAddress,
      userAgent,
      outcome: 'DENIED',
    });
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    await logAuditEvent({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'AUTH_LOGIN',
      resourceType: 'User',
      ipAddress,
      userAgent,
      outcome: 'DENIED',
      details: { reason: 'ACCOUNT_INACTIVE' },
    });
    throw new AppError('This account is not active. Contact your hospital administrator.', 403, 'ACCOUNT_INACTIVE');
  }

  if (expectedRole && user.role !== expectedRole) {
    await logAuditEvent({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'AUTH_LOGIN',
      resourceType: 'User',
      ipAddress,
      userAgent,
      outcome: 'DENIED',
      details: { reason: 'ROLE_MISMATCH', selectedRole: expectedRole },
    });
    throw new AppError('This account cannot use the selected sign-in option.', 403, 'ROLE_MISMATCH');
  }

  const { accessToken, refreshToken } = issueTokens(user);

  await logAuditEvent({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: 'AUTH_LOGIN',
    resourceType: 'User',
    resourceId: user._id.toString(),
    ipAddress,
    userAgent,
    outcome: 'SUCCESS',
  });

  return { user, accessToken, refreshToken };
};

export const refreshAccessToken = async (refreshTokenString: string): Promise<{ accessToken: string }> => {
  let payload: { userId: string; role: UserRole; email: string };
  try {
    payload = verifyRefreshToken(refreshTokenString);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }
  const user = await UserModel.findById(payload.userId);
  if (!user || !user.isActive || user.role !== payload.role) {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }
  return { accessToken: signAccessToken({ userId: payload.userId, role: user.role, email: user.email }) };
};

export const getCurrentUserAndProfile = async (
  userId: string
): Promise<{ user: PublicUser; profile: unknown }> => {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  let profile: unknown = null;
  if (user.role === 'PATIENT') {
    profile = await PatientModel.findOne({ userId: user._id });
  } else if (user.role === 'DOCTOR') {
    profile = await DoctorModel.findOne({ userId: user._id });
  } else if (user.role === 'HOSPITAL' && user.hospitalId) {
    // Real hospital record for the admin's own hospital (null if not linked)
    profile = await HospitalModel.findById(user.hospitalId);
  }

  return {
    user: toPublicUser(user),
    profile,
  };
};
