import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(160);

export const nameSchema = z.string().trim().min(2, 'Name is too short').max(120, 'Name is too long');

// Indian mobile/landline style: optional +91, 10–13 digits allowing spaces/hyphens
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 -]{8,16}[0-9]$/, 'Enter a valid phone number');

// Public self-registration is PATIENT-only. Any other role in the body is rejected.
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    fullName: nameSchema,
    phone: phoneSchema,
    role: z.literal('PATIENT', { errorMap: () => ({ message: 'Only patients can self-register' }) }).optional(),
    privacyPolicyAccepted: z.boolean().optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
      .optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
    // Optional and only stored when the patient enters it; never defaulted
    bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  })
  .strip();

export type RegisterBody = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
  role: z.enum(['PATIENT', 'DOCTOR', 'HOSPITAL', 'ADMIN']).optional(),
});

export const acceptInviteSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid invitation token'),
  password: passwordSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
