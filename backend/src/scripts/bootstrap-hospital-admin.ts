import 'dotenv/config';
import { z } from 'zod';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { UserModel } from '../modules/users/user.model';
import { HospitalModel } from '../modules/hospitals/hospital.model';
import { emailSchema, nameSchema, passwordSchema, phoneSchema } from '../modules/auth/auth.schemas';
import { hashPassword } from '../lib/crypto';
import { logAuditEvent } from '../modules/audit/audit.service';

// Creates the first hospital and its hospital admin. Values come ONLY from environment
// variables (BOOTSTRAP_*), never from code. Safe to re-run: an existing admin is left untouched.
export const bootstrapInputSchema = z.object({
  BOOTSTRAP_HOSPITAL_NAME: z.string().trim().min(2).max(160),
  BOOTSTRAP_HOSPITAL_ADDRESS: z.string().trim().min(5).max(300),
  BOOTSTRAP_HOSPITAL_PHONE: phoneSchema,
  BOOTSTRAP_HOSPITAL_EMAIL: emailSchema,
  BOOTSTRAP_ADMIN_NAME: nameSchema,
  BOOTSTRAP_ADMIN_EMAIL: emailSchema,
  BOOTSTRAP_ADMIN_PASSWORD: passwordSchema,
});

export type BootstrapInput = z.infer<typeof bootstrapInputSchema>;

export type BootstrapResult =
  | { status: 'CREATED'; hospitalId: string; adminEmail: string }
  | { status: 'ALREADY_EXISTS'; adminEmail: string };

export const bootstrapHospitalAdmin = async (input: BootstrapInput): Promise<BootstrapResult> => {
  const existing = await UserModel.findOne({ email: input.BOOTSTRAP_ADMIN_EMAIL });
  if (existing) {
    if (existing.role !== 'HOSPITAL') {
      throw new Error('An account with BOOTSTRAP_ADMIN_EMAIL already exists with a different role. Use another email.');
    }
    return { status: 'ALREADY_EXISTS', adminEmail: existing.email };
  }

  // Created by the platform operator via CLI, so the hospital starts verified
  const hospital = await HospitalModel.create({
    name: input.BOOTSTRAP_HOSPITAL_NAME,
    address: input.BOOTSTRAP_HOSPITAL_ADDRESS,
    phone: input.BOOTSTRAP_HOSPITAL_PHONE,
    email: input.BOOTSTRAP_HOSPITAL_EMAIL,
    departments: [],
    isVerified: true,
  });

  try {
    const admin = await UserModel.create({
      name: input.BOOTSTRAP_ADMIN_NAME,
      email: input.BOOTSTRAP_ADMIN_EMAIL,
      passwordHash: await hashPassword(input.BOOTSTRAP_ADMIN_PASSWORD),
      role: 'HOSPITAL',
      hospitalId: hospital._id,
      isActive: true,
    });
    await logAuditEvent({
      actorId: 'bootstrap-cli',
      actorRole: 'SYSTEM',
      action: 'AUTH_REGISTER',
      resourceType: 'User',
      resourceId: admin._id.toString(),
      outcome: 'SUCCESS',
      details: { role: 'HOSPITAL', hospitalId: hospital._id.toString() },
    });
  } catch (err) {
    await HospitalModel.deleteOne({ _id: hospital._id });
    throw err;
  }

  return { status: 'CREATED', hospitalId: hospital._id.toString(), adminEmail: input.BOOTSTRAP_ADMIN_EMAIL };
};

if (require.main === module) {
  (async () => {
    const parsed = bootstrapInputSchema.safeParse(process.env);
    if (!parsed.success) {
      // Only field names are printed — never values (the password lives in this env)
      const fields = Object.keys(parsed.error.flatten().fieldErrors).join(', ');
      process.stderr.write(`Missing or invalid bootstrap settings in backend/.env: ${fields}\n`);
      process.exit(1);
    }
    try {
      await connectDatabase();
      const result = await bootstrapHospitalAdmin(parsed.data);
      process.stdout.write(
        result.status === 'CREATED'
          ? `Hospital admin created for ${result.adminEmail} (hospitalId ${result.hospitalId}).\n` +
              'Remove BOOTSTRAP_ADMIN_PASSWORD from .env now that the account exists.\n'
          : `Hospital admin ${result.adminEmail} already exists. Nothing changed.\n`
      );
      await disconnectDatabase();
      process.exit(0);
    } catch (err) {
      process.stderr.write(`Bootstrap failed: ${err instanceof Error ? err.message : 'unknown error'}\n`);
      await disconnectDatabase().catch(() => undefined);
      process.exit(1);
    }
  })();
}
