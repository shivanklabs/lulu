import request from 'supertest';
import type { Express } from 'express';
import { UserModel, UserRole } from '../../src/modules/users/user.model';
import { DoctorModel } from '../../src/modules/doctors/doctor.model';
import { hashPassword, signAccessToken, signRefreshToken } from '../../src/lib/crypto';

export interface TestRegisterBody {
  email: string;
  password: string;
  role?: UserRole;
  fullName: string;
  phone?: string;
  specialization?: string;
  licenseNumber?: string;
  medicalCouncil?: string;
  consultationFee?: number;
  experienceYears?: number;
  [key: string]: unknown;
}

interface AuthLikeResponse {
  status: number;
  body: {
    success: boolean;
    data: { userId: string; email: string; role: UserRole; accessToken: string; refreshToken: string };
  };
}

// Public signup is PATIENT-only. Patients still go through the real endpoint; DOCTOR/ADMIN/HOSPITAL
// test accounts are created directly in the database (the way bootstrap/invite flows create them).
export const registerAccount = async (app: Express, body: TestRegisterBody): Promise<AuthLikeResponse> => {
  if (!body.role || body.role === 'PATIENT') {
    return request(app).post('/api/v1/auth/register').send(body);
  }

  const user = await UserModel.create({
    name: body.fullName,
    email: body.email.toLowerCase(),
    passwordHash: await hashPassword(body.password),
    role: body.role,
    isActive: true,
  });

  if (body.role === 'DOCTOR') {
    await DoctorModel.create({
      userId: user._id,
      fullName: body.fullName,
      phone: body.phone,
      specialization: body.specialization || 'General Medicine',
      licenseNumber: body.licenseNumber || `RMP-TEST-${user._id.toString()}`,
      medicalCouncil: body.medicalCouncil || 'Test Medical Council',
      consultationFee: body.consultationFee ?? 500,
      experienceYears: body.experienceYears ?? 1,
      verificationStatus: 'PENDING',
    });
  }

  const payload = { userId: user._id.toString(), role: user.role, email: user.email };
  return {
    status: 201,
    body: {
      success: true,
      data: {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        accessToken: signAccessToken(payload),
        refreshToken: signRefreshToken(payload),
      },
    },
  };
};
