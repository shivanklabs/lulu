import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import { UserModel } from '../modules/users/user.model';
import { HospitalModel } from '../modules/hospitals/hospital.model';
import { DoctorModel } from '../modules/doctors/doctor.model';
import { PatientModel } from '../modules/patients/patient.model';
import { AvailabilityModel } from '../modules/appointments/availability.model';
import { passwordSchema } from '../modules/auth/auth.schemas';
import { hashPassword } from '../lib/crypto';

// LOCAL / TEST ONLY. Creates one clearly-labelled test account per role so the dashboards
// can be exercised. Every record is marked "TEST" and every user has isTestAccount=true.
// Refuses to run against anything that does not look like a local or test database.

export const TEST_EMAILS = {
  hospitalAdmin: 'hospital.admin@medibridge.test',
  doctor: 'doctor@medibridge.test',
  patient: 'patient@medibridge.test',
} as const;

export const isSafeTestTarget = (uri: string, nodeEnv: string): boolean => {
  if (nodeEnv === 'test') return true;
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?/);
  if (!match) return false;
  const hosts = match[1].split(',').map((h) => h.split(':')[0].toLowerCase());
  const dbName = (match[2] || '').toLowerCase();
  const allLocal = hosts.every((h) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]');
  return allLocal || dbName.includes('test');
};

export const seedTestUsers = async (password: string) => {
  const passwordHash = await hashPassword(password);

  let hospital = await HospitalModel.findOne({ email: 'hospital@medibridge.test' });
  if (!hospital) {
    hospital = await HospitalModel.create({
      name: 'TEST Hospital (local test data)',
      address: 'TEST address — not a real facility',
      phone: '+91 00000 00000',
      email: 'hospital@medibridge.test',
      departments: [{ name: 'TEST General Medicine', isActive: true }],
      isVerified: true,
    });
  }
  const department = hospital.departments[0];

  const upsertUser = async (email: string, name: string, role: 'PATIENT' | 'DOCTOR' | 'HOSPITAL') => {
    const existing = await UserModel.findOne({ email });
    if (existing) {
      if (!existing.isTestAccount) throw new Error(`${email} exists and is NOT a test account; refusing to touch it.`);
      return existing;
    }
    return UserModel.create({
      name,
      email,
      passwordHash,
      role,
      hospitalId: role === 'PATIENT' ? undefined : hospital?._id,
      isActive: true,
      isTestAccount: true,
    });
  };

  await upsertUser(TEST_EMAILS.hospitalAdmin, 'TEST Hospital Admin', 'HOSPITAL');

  const doctorUser = await upsertUser(TEST_EMAILS.doctor, 'TEST Doctor', 'DOCTOR');
  let doctor = await DoctorModel.findOne({ userId: doctorUser._id });
  if (!doctor) {
    doctor = await DoctorModel.create({
      userId: doctorUser._id,
      hospitalId: hospital._id,
      departmentId: department?._id,
      fullName: 'TEST Doctor',
      phone: '+91 00000 00001',
      specialization: 'TEST General Medicine',
      qualifications: ['TEST qualification'],
      consultationModes: ['IN_PERSON', 'VIDEO'],
      licenseNumber: 'TEST-REG-0001',
      medicalCouncil: 'TEST council (not real)',
      experienceYears: 0,
      consultationFee: 0,
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
    });
    // Mon–Sat 10:00–13:00 IST, 15-minute slots, so the booking flow has something to show
    await AvailabilityModel.insertMany(
      [1, 2, 3, 4, 5, 6].map((weekday) => ({
        doctorId: doctor?._id,
        hospitalId: hospital?._id,
        type: 'WEEKLY',
        weekday,
        startTime: '10:00',
        endTime: '13:00',
        slotMinutes: 15,
      }))
    );
  }

  const patientUser = await upsertUser(TEST_EMAILS.patient, 'TEST Patient', 'PATIENT');
  if (!(await PatientModel.exists({ userId: patientUser._id }))) {
    await PatientModel.create({
      userId: patientUser._id,
      fullName: 'TEST Patient',
      phone: '+91 00000 00002',
      gender: 'PREFER_NOT_TO_SAY',
    });
  }

  return { hospitalId: hospital._id.toString(), emails: TEST_EMAILS };
};

if (require.main === module) {
  (async () => {
    if (!isSafeTestTarget(env.MONGODB_URI, env.NODE_ENV)) {
      process.stderr.write(
        'Refusing to seed: MONGODB_URI is not localhost and its database name does not contain "test".\n'
      );
      process.exit(1);
    }
    const password = passwordSchema.safeParse(process.env.TEST_USERS_PASSWORD ?? '');
    if (!password.success) {
      process.stderr.write('Set TEST_USERS_PASSWORD in backend/.env (min 10 chars, a letter and a number).\n');
      process.exit(1);
    }
    try {
      await connectDatabase();
      const result = await seedTestUsers(password.data);
      process.stdout.write(
        `Test accounts ready (password = TEST_USERS_PASSWORD):\n` +
          Object.entries(result.emails)
            .map(([role, email]) => `  ${role}: ${email}`)
            .join('\n') +
          '\n'
      );
      await disconnectDatabase();
      process.exit(0);
    } catch (err) {
      process.stderr.write(`Seeding failed: ${err instanceof Error ? err.message : 'unknown error'}\n`);
      await disconnectDatabase().catch(() => undefined);
      process.exit(1);
    }
  })();
}
