import { Types } from 'mongoose';
import {
  IncognitoSessionModel,
  IIncognitoSession,
  IncognitoCategory,
  ConsultationChannelMode,
} from './incognito-session.model';
import { PatientModel } from '../patients/patient.model';
import { DoctorModel } from '../doctors/doctor.model';
import {
  generateIncognitoPseudonym,
  maskPatientPII,
  MaskedPatientView,
} from '../../middleware/incognito-masking.middleware';
import {
  hashPassword,
  comparePassword,
  encryptPhi,
  decryptPhi,
  TokenPayload,
} from '../../lib/crypto';
import { logAuditEvent } from '../audit/audit.service';
import { AppError } from '../../middleware/errorHandler';

export interface CreateIncognitoInput {
  doctorId: string;
  category: IncognitoCategory;
  channelMode: ConsultationChannelMode;
  pin: string; // 4-6 digit secret PIN
  initialNotes?: string;
}

export class IncognitoConsultService {
  static async createSession(
    input: CreateIncognitoInput,
    patientUser: TokenPayload
  ): Promise<{ session: IIncognitoSession; pseudonym: string }> {
    if (patientUser.role !== 'PATIENT') {
      throw new AppError('Only patients can create incognito sessions', 403, 'FORBIDDEN');
    }

    const patient = await PatientModel.findOne({ userId: patientUser.userId });
    if (!patient) {
      throw new AppError('Patient profile not found', 404, 'PATIENT_NOT_FOUND');
    }

    const doctor = await DoctorModel.findById(input.doctorId);
    if (!doctor) {
      throw new AppError('Doctor not found', 404, 'DOCTOR_NOT_FOUND');
    }

    if (!input.pin || input.pin.length < 4) {
      throw new AppError('Private vault PIN must be at least 4 digits', 400, 'INVALID_PIN');
    }

    const pseudonym = generateIncognitoPseudonym();
    const vaultPinHash = await hashPassword(input.pin);

    let encryptedVaultNotes: string | undefined;
    if (input.initialNotes) {
      encryptedVaultNotes = encryptPhi(input.initialNotes);
    }

    const session = await IncognitoSessionModel.create({
      patientId: patient._id,
      doctorId: doctor._id,
      pseudonym,
      category: input.category,
      channelMode: input.channelMode,
      vaultPinHash,
      encryptedVaultNotes,
      status: 'ACTIVE',
    });

    await logAuditEvent({
      actorId: patientUser.userId,
      actorRole: 'PATIENT',
      action: 'PHI_CREATE',
      resourceType: 'IncognitoSession',
      resourceId: (session._id as Types.ObjectId).toString(),
      patientId: patient._id.toString(),
      outcome: 'SUCCESS',
      details: { pseudonym, category: input.category, channelMode: input.channelMode },
    });

    return { session, pseudonym };
  }

  static async unlockVault(
    sessionId: string,
    pin: string,
    actor: TokenPayload
  ): Promise<{ notes: string; pseudonym: string; category: string }> {
    const session = await IncognitoSessionModel.findById(sessionId);
    if (!session) {
      throw new AppError('Incognito session not found', 404, 'NOT_FOUND');
    }

    const patient = await PatientModel.findById(session.patientId);
    if (!patient || patient.userId.toString() !== actor.userId) {
      throw new AppError('Vault PIN unlock can only be performed by the session owner', 403, 'FORBIDDEN');
    }

    const isValid = await comparePassword(pin, session.vaultPinHash);
    if (!isValid) {
      await logAuditEvent({
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'PHI_READ',
        resourceType: 'IncognitoVault',
        resourceId: sessionId,
        patientId: patient._id.toString(),
        outcome: 'DENIED',
        details: { reason: 'INVALID_PIN' },
      });
      throw new AppError('Incorrect Private Vault PIN', 401, 'INVALID_PIN');
    }

    let notes = '';
    if (session.encryptedVaultNotes) {
      notes = decryptPhi(session.encryptedVaultNotes);
    }

    await logAuditEvent({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'PHI_READ',
      resourceType: 'IncognitoVault',
      resourceId: sessionId,
      patientId: patient._id.toString(),
      outcome: 'SUCCESS',
    });

    return {
      notes,
      pseudonym: session.pseudonym,
      category: session.category,
    };
  }

  static async updateVaultNotes(
    sessionId: string,
    pin: string,
    notes: string,
    actor: TokenPayload
  ): Promise<{ success: boolean }> {
    const session = await IncognitoSessionModel.findById(sessionId);
    if (!session) throw new AppError('Session not found', 404, 'NOT_FOUND');

    const isValid = await comparePassword(pin, session.vaultPinHash);
    if (!isValid) {
      throw new AppError('Incorrect Private Vault PIN', 401, 'INVALID_PIN');
    }

    session.encryptedVaultNotes = encryptPhi(notes);
    await session.save();

    await logAuditEvent({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'PHI_UPDATE',
      resourceType: 'IncognitoVault',
      resourceId: sessionId,
      patientId: session.patientId.toString(),
      outcome: 'SUCCESS',
    });

    return { success: true };
  }

  static async getDoctorMaskedView(
    sessionId: string,
    doctorUser: TokenPayload
  ): Promise<{ session: IIncognitoSession; patientMask: MaskedPatientView }> {
    const session = await IncognitoSessionModel.findById(sessionId).populate('patientId');
    if (!session) {
      throw new AppError('Incognito session not found', 404, 'NOT_FOUND');
    }

    const doctor = await DoctorModel.findOne({ userId: doctorUser.userId });
    if (!doctor || doctor._id.toString() !== session.doctorId.toString()) {
      throw new AppError('Only the assigned clinician can access this incognito room', 403, 'FORBIDDEN');
    }

    const patientDoc = session.patientId as unknown as { dateOfBirth?: string; gender?: string; bloodGroup?: string };
    const patientMask = maskPatientPII(patientDoc || {}, session.pseudonym);

    return {
      session,
      patientMask,
    };
  }
}
