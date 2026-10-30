import crypto from 'crypto';
import { Types } from 'mongoose';
import { PrescriptionModel, IPrescription, IMedicationItem } from './prescription.model';
import { DoctorModel } from '../doctors/doctor.model';
import { PatientModel } from '../patients/patient.model';
import { evaluateConsentAccess } from '../consent/consent.service';
import { createNotification } from '../notifications/notification.service';
import { logAuditEvent } from '../audit/audit.service';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';
import { TokenPayload } from '../../lib/crypto';

export const CURRENT_PRESCRIPTION_KEY_VERSION = 'v1';

export interface PrescriptionVerificationKeyring {
  [keyVersion: string]: string;
}

/**
 * Controlled verification keyring for validating current and rotated signature keys.
 * Maps key versions (e.g. 'v1', 'v2') to their respective HMAC secrets.
 */
export const getPrescriptionVerificationKeyring = (): PrescriptionVerificationKeyring => {
  return {
    v1: env.PRESCRIPTION_SIGNING_KEY,
  };
};

export interface DraftPrescriptionInput {
  patientId: string;
  appointmentId?: string;
  medications: IMedicationItem[];
  notes?: string;
}

export const draftPrescription = async (
  input: DraftPrescriptionInput,
  doctorUser: TokenPayload
): Promise<IPrescription> => {
  const doctor = await DoctorModel.findOne({ userId: doctorUser.userId });
  if (!doctor || doctor.verificationStatus !== 'VERIFIED') {
    throw new AppError('Only verified clinicians can draft prescriptions', 403, 'DOCTOR_NOT_VERIFIED');
  }

  const patient = await PatientModel.findById(input.patientId);
  if (!patient) {
    throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
  }

  const prescription = await PrescriptionModel.create({
    patientId: patient._id,
    doctorId: doctor._id,
    appointmentId: input.appointmentId ? new Types.ObjectId(input.appointmentId) : undefined,
    medications: input.medications,
    status: 'DRAFT_PENDING_DOCTOR_SIGNATURE',
    notes: input.notes,
  });

  await logAuditEvent({
    actorId: doctorUser.userId,
    actorRole: 'DOCTOR',
    action: 'PHI_CREATE',
    resourceType: 'Prescription',
    resourceId: (prescription._id as Types.ObjectId).toString(),
    patientId: input.patientId,
    outcome: 'SUCCESS',
    details: { status: 'DRAFT_PENDING_DOCTOR_SIGNATURE', medicationCount: input.medications.length },
  });

  return prescription;
};

export const signAndIssuePrescription = async (
  prescriptionId: string,
  doctorUser: TokenPayload
): Promise<IPrescription> => {
  const doctor = await DoctorModel.findOne({ userId: doctorUser.userId });
  if (!doctor || doctor.verificationStatus !== 'VERIFIED') {
    throw new AppError('Only verified clinicians can digitally sign prescriptions', 403, 'DOCTOR_NOT_VERIFIED');
  }

  const prescription = await PrescriptionModel.findById(prescriptionId);
  if (!prescription) {
    throw new AppError('Prescription not found', 404, 'NOT_FOUND');
  }

  if (prescription.doctorId.toString() !== doctor._id.toString()) {
    throw new AppError('Only the authoring clinician can sign this prescription', 403, 'FORBIDDEN');
  }

  if (prescription.status !== 'DRAFT_PENDING_DOCTOR_SIGNATURE') {
    throw new AppError(`Cannot sign prescription in status: ${prescription.status}`, 400, 'INVALID_STATUS');
  }

  const now = new Date();
  // Generate cryptographic tamper-evident signature digest using dedicated prescription key.
  // Envelope format: sig:<version>:<hmacHex>
  // Note: Server-side HMAC digest; does not substitute for legally recognized asymmetric PKI/DSC signatures.
  const payloadToSign = `${doctor._id}:${prescription.patientId}:${JSON.stringify(prescription.medications)}:${now.toISOString()}:${doctor.licenseNumber}`;
  const hmacHex = crypto
    .createHmac('sha256', env.PRESCRIPTION_SIGNING_KEY)
    .update(payloadToSign)
    .digest('hex');
  const digitalSignature = `sig:${CURRENT_PRESCRIPTION_KEY_VERSION}:${hmacHex}`;

  prescription.status = 'ISSUED';
  prescription.digitalSignature = digitalSignature;
  prescription.signedAt = now;
  prescription.signedBy = doctor._id as Types.ObjectId;
  await prescription.save();

  // Notify Patient
  const patient = await PatientModel.findById(prescription.patientId);
  if (patient) {
    await createNotification({
      userId: patient.userId,
      title: 'Prescription Issued',
      message: `Dr. ${doctor.fullName} has issued a digital prescription (${prescription.medications.length} items).`,
      type: 'PRESCRIPTION_ISSUED',
      metadata: { prescriptionId: prescription._id },
    });
  }

  await logAuditEvent({
    actorId: doctorUser.userId,
    actorRole: 'DOCTOR',
    action: 'PHI_UPDATE',
    resourceType: 'Prescription',
    resourceId: prescriptionId,
    patientId: prescription.patientId.toString(),
    outcome: 'SUCCESS',
    details: { digitalSignature, status: 'ISSUED' },
  });

  return prescription;
};

export const getPrescriptionById = async (
  prescriptionId: string,
  user: TokenPayload
): Promise<IPrescription> => {
  const prescription = await PrescriptionModel.findById(prescriptionId)
    .populate('doctorId', 'fullName specialization licenseNumber medicalCouncil')
    .populate('patientId', 'fullName phone dateOfBirth');

  if (!prescription) {
    throw new AppError('Prescription not found', 404, 'NOT_FOUND');
  }

  let authorized = false;
  if (user.role === 'PATIENT') {
    const patient = await PatientModel.findOne({ userId: user.userId });
    if (patient && patient._id.toString() === prescription.patientId._id.toString()) {
      authorized = true;
    }
  } else if (user.role === 'DOCTOR') {
    const doctor = await DoctorModel.findOne({ userId: user.userId });
    if (doctor) {
      if (doctor._id.toString() === prescription.doctorId._id.toString()) {
        authorized = true;
      } else {
        // Evaluate hybrid consent for PRESCRIPTIONS category
        authorized = await evaluateConsentAccess(
          doctor._id.toString(),
          prescription.patientId._id.toString(),
          'PRESCRIPTIONS'
        );
      }
    }
  }

  if (!authorized) {
    throw new AppError('Unauthorized access to prescription. Active consent required.', 403, 'CONSENT_REQUIRED');
  }

  return prescription;
};

/**
 * Verifies prescription tamper-evident cryptographic integrity digest.
 * Supports:
 * 1. Versioned signatures (sig:<version>:<hmacHex>) validated via the controlled verification keyring.
 * 2. Unversioned signatures validated against PRESCRIPTION_SIGNING_KEY.
 * 3. Read-only legacy fallback to JWT_ACCESS_SECRET for pre-existing unversioned records.
 *
 * Note: Server-side HMAC digest for tamper detection; does not substitute for legally recognized
 * asymmetric PKI/DSC digital signatures under the Indian Information Technology Act (2000).
 */
export const verifyPrescriptionSignature = (
  prescription: IPrescription,
  doctorLicenseNumber: string,
  customKeyring?: PrescriptionVerificationKeyring
): boolean => {
  if (!prescription.digitalSignature || !prescription.signedAt) {
    return false;
  }
  const payloadToSign = `${prescription.doctorId}:${prescription.patientId}:${JSON.stringify(prescription.medications)}:${prescription.signedAt.toISOString()}:${doctorLicenseNumber}`;

  // 1. Versioned signature format: sig:<keyVersion>:<hmacHex>
  const versionMatch = prescription.digitalSignature.match(/^sig:([^:]+):([a-fA-F0-9]{64})$/);
  if (versionMatch) {
    const [, keyVersion, providedHmacHex] = versionMatch;
    const keyring = customKeyring || getPrescriptionVerificationKeyring();
    const signingKey = keyring[keyVersion];
    if (!signingKey) {
      // Key version not registered in controlled verification keyring
      return false;
    }

    const expectedHmacHex = crypto
      .createHmac('sha256', signingKey)
      .update(payloadToSign)
      .digest('hex');

    const providedBuf = Buffer.from(providedHmacHex, 'hex');
    const expectedBuf = Buffer.from(expectedHmacHex, 'hex');

    return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
  }

  // 2. Unversioned 64-hex legacy/transition signatures
  if (/^[a-fA-F0-9]{64}$/.test(prescription.digitalSignature)) {
    const providedBuf = Buffer.from(prescription.digitalSignature, 'hex');

    // 2a. Primary unversioned verification with PRESCRIPTION_SIGNING_KEY
    const currentExpected = crypto
      .createHmac('sha256', env.PRESCRIPTION_SIGNING_KEY)
      .update(payloadToSign)
      .digest('hex');
    const currentBuf = Buffer.from(currentExpected, 'hex');

    if (providedBuf.length === currentBuf.length && crypto.timingSafeEqual(providedBuf, currentBuf)) {
      return true;
    }

    // 2b. Read-only fallback for historical records signed with JWT_ACCESS_SECRET
    try {
      const legacyExpected = crypto
        .createHmac('sha256', env.JWT_ACCESS_SECRET)
        .update(payloadToSign)
        .digest('hex');
      const legacyBuf = Buffer.from(legacyExpected, 'hex');
      if (providedBuf.length === legacyBuf.length && crypto.timingSafeEqual(providedBuf, legacyBuf)) {
        return true;
      }
    } catch {
      // Ignore legacy comparison errors
    }
  }

  return false;
};
