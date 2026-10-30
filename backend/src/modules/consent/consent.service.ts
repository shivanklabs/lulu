import { Types } from 'mongoose';
import { ConsentGrantModel, IConsentGrant, MedicalRecordCategory } from './consent.model';
import { logAuditEvent } from '../audit/audit.service';
import { AppError } from '../../middleware/errorHandler';

export interface GrantConsentInput {
  patientId: string;
  doctorId: string;
  categories: MedicalRecordCategory[];
  durationDays?: number;
  encounterId?: string;
}

export const createConsentGrant = async (
  input: GrantConsentInput,
  actorId: string,
  actorRole: 'PATIENT' | 'DOCTOR' = 'PATIENT'
): Promise<IConsentGrant> => {
  const duration = input.durationDays || 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + duration);

  const grant = await ConsentGrantModel.create({
    patientId: new Types.ObjectId(input.patientId),
    doctorId: new Types.ObjectId(input.doctorId),
    categories: input.categories,
    encounterId: input.encounterId,
    status: 'ACTIVE',
    grantedAt: new Date(),
    expiresAt,
  });

  await logAuditEvent({
    actorId,
    actorRole,
    action: 'CONSENT_GRANT',
    resourceType: 'ConsentGrant',
    resourceId: (grant._id as Types.ObjectId).toString(),
    patientId: input.patientId,
    outcome: 'SUCCESS',
    details: { doctorId: input.doctorId, categories: input.categories, expiresAt },
  });

  return grant;
};

export const revokeConsentGrant = async (
  grantId: string,
  patientId: string,
  reason?: string
): Promise<IConsentGrant> => {
  const grant = await ConsentGrantModel.findOne({
    _id: grantId,
    patientId: new Types.ObjectId(patientId),
  });

  if (!grant) {
    throw new AppError('Consent grant not found or not owned by patient', 404, 'NOT_FOUND');
  }

  grant.status = 'REVOKED';
  grant.revokedAt = new Date();
  grant.revocationReason = reason;
  await grant.save();

  await logAuditEvent({
    actorId: patientId,
    actorRole: 'PATIENT',
    action: 'CONSENT_REVOKE',
    resourceType: 'ConsentGrant',
    resourceId: grantId,
    patientId,
    outcome: 'SUCCESS',
    details: { reason },
  });

  return grant;
};

export const evaluateConsentAccess = async (
  doctorId: string,
  patientId: string,
  category: MedicalRecordCategory,
  encounterId?: string
): Promise<boolean> => {
  const now = new Date();

  // Find active, unexpired grant matching doctor, patient, and category
  const grant = await ConsentGrantModel.findOne({
    doctorId: new Types.ObjectId(doctorId),
    patientId: new Types.ObjectId(patientId),
    status: 'ACTIVE',
    expiresAt: { $gt: now },
    categories: category,
  });

  if (!grant) {
    return false;
  }

  // If the grant is encounter-scoped, it must match the record's encounterId
  if (grant.encounterId && encounterId && grant.encounterId !== encounterId) {
    return false;
  }

  return true;
};
