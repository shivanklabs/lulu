import { Types } from 'mongoose';
import { DoctorModel } from '../doctors/doctor.model';
import { PatientModel } from '../patients/patient.model';
import { MedicalRecordModel } from '../medical-records/medical-record.model';
import { ConsentGrantModel } from './consent.model';
import { NotificationModel } from '../notifications/notification.model';
import { UserModel } from '../users/user.model';
import { logAuditEvent } from '../audit/audit.service';
import { decryptPhi, TokenPayload } from '../../lib/crypto';
import { AppError } from '../../middleware/errorHandler';

export interface EmergencyAccessSummary {
  emergencyAccessGranted: boolean;
  grantId: string;
  expiresAt: Date;
  justification: string;
  patient: {
    id: string;
    fullName: string;
    dateOfBirth?: string;
    gender: string;
    phone: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    allergies: string[];
  };
  recentRecords: Array<{
    id: string;
    category: string;
    title: string;
    createdAt: Date;
    decryptedClinicalNote?: string;
  }>;
}

export class BreakTheGlassService {
  /**
   * Verified doctors can trigger Emergency Break-The-Glass protocol for life-threatening scenarios.
   * Creates an immutable 30-minute full consent grant, triggers dual notifications (patient + admins),
   * and logs an immutable audit event.
   */
  static async executeBreakTheGlass(
    patientIdentifier: string,
    justification: string,
    doctorUser: TokenPayload,
    ipAddress?: string,
    userAgent?: string
  ): Promise<EmergencyAccessSummary> {
    if (doctorUser.role !== 'DOCTOR') {
      throw new AppError('Only clinicians may execute emergency break-the-glass override', 403, 'FORBIDDEN');
    }

    if (!justification || justification.trim().length < 15) {
      throw new AppError(
        'Mandatory clinical justification required (minimum 15 characters describing acute life-threatening emergency)',
        400,
        'INVALID_JUSTIFICATION'
      );
    }

    const doctor = await DoctorModel.findOne({ userId: doctorUser.userId });
    if (!doctor) {
      throw new AppError('Doctor profile not found', 404, 'NOT_FOUND');
    }

    if (doctor.verificationStatus !== 'VERIFIED') {
      throw new AppError(
        'Doctor verification is pending. Only NMC-verified clinicians may trigger emergency break-the-glass',
        403,
        'DOCTOR_NOT_VERIFIED'
      );
    }

    // Resolve patient by ID or userId
    let patient = null;
    if (Types.ObjectId.isValid(patientIdentifier)) {
      patient = await PatientModel.findById(patientIdentifier);
    }
    if (!patient && Types.ObjectId.isValid(patientIdentifier)) {
      patient = await PatientModel.findOne({ userId: new Types.ObjectId(patientIdentifier) });
    }
    if (!patient) {
      throw new AppError('Patient profile not found for emergency override', 404, 'PATIENT_NOT_FOUND');
    }

    // 30-minute emergency grant
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const emergencyGrant = await ConsentGrantModel.create({
      patientId: patient._id,
      doctorId: doctor._id,
      categories: ['CLINICAL_NOTES', 'LAB_RESULTS', 'PRESCRIPTIONS', 'IMAGING_REPORTS'],
      status: 'ACTIVE',
      grantedAt: new Date(),
      expiresAt,
      encounterId: 'EMERGENCY_OVERRIDE',
    });

    // Fetch recent medical records to prepare summary
    const records = await MedicalRecordModel.find({ patientId: patient._id })
      .sort({ createdAt: -1 })
      .limit(5);

    const decryptedRecords = records.map((rec) => {
      let clinicalNote = '';
      try {
        clinicalNote = decryptPhi(rec.encryptedNotes);
      } catch {
        clinicalNote = '[Decryption unavailable]';
      }
      return {
        id: (rec._id as Types.ObjectId).toString(),
        category: rec.category,
        title: rec.title,
        createdAt: rec.createdAt,
        decryptedClinicalNote: clinicalNote,
      };
    });

    // Notify patient immediately
    await NotificationModel.create({
      userId: patient.userId,
      title: '🚨 EMERGENCY BREAK-GLASS ACCESS TRIGGERED',
      message: `Dr. ${doctor.fullName} (Reg: ${doctor.licenseNumber}) accessed your health records under Emergency Break-Glass protocol. Justification: "${justification}". Temporary 30-minute access granted.`,
      type: 'CONSENT_ALERT',
      metadata: {
        doctorId: doctor._id.toString(),
        justification,
        expiresAt,
      },
    });

    // Notify all Admins immediately for compliance governance
    const admins = await UserModel.find({ role: 'ADMIN' });
    for (const admin of admins) {
      await NotificationModel.create({
        userId: admin._id,
        title: '🚨 HIGH PRIORITY: Clinical Emergency Break-The-Glass Override',
        message: `Dr. ${doctor.fullName} (${doctor.licenseNumber}) invoked emergency break-glass for patient ${patient.fullName}. Justification: "${justification}". Review required.`,
        type: 'CONSENT_ALERT',
        metadata: {
          doctorId: doctor._id.toString(),
          patientId: patient._id.toString(),
          justification,
          expiresAt,
        },
      });
    }

    // Append-only tamper-evident audit log
    await logAuditEvent({
      actorId: doctorUser.userId,
      actorRole: 'DOCTOR',
      action: 'EMERGENCY_BREAK_GLASS',
      resourceType: 'MedicalRecordEmergencyOverride',
      resourceId: (emergencyGrant._id as Types.ObjectId).toString(),
      patientId: patient._id.toString(),
      ipAddress,
      userAgent,
      outcome: 'SUCCESS',
      details: {
        doctorId: doctor._id.toString(),
        doctorLicense: doctor.licenseNumber,
        justification,
        expiresAt,
      },
    });

    return {
      emergencyAccessGranted: true,
      grantId: (emergencyGrant._id as Types.ObjectId).toString(),
      expiresAt,
      justification,
      patient: {
        id: (patient._id as Types.ObjectId).toString(),
        fullName: patient.fullName,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        phone: patient.phone,
        emergencyContactName: patient.emergencyContactName,
        emergencyContactPhone: patient.emergencyContactPhone,
        allergies: patient.allergies || [],
      },
      recentRecords: decryptedRecords,
    };
  }
}
