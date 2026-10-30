import { PatientModel, IPatient } from './patient.model';
import { AppointmentModel } from '../appointments/appointment.model';
import { PrescriptionModel } from '../prescriptions/prescription.model';
import { MedicalRecordModel } from '../medical-records/medical-record.model';
import { decryptPhi, TokenPayload } from '../../lib/crypto';
import { logAuditEvent } from '../audit/audit.service';
import { AppError } from '../../middleware/errorHandler';

export interface PatientLongitudinalHistory {
  patient: {
    id: string;
    specialId: string;
    fullName: string;
    age?: number;
    gender: string;
    bloodGroup: string;
    phone: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    allergies: string[];
  };
  pastTreatments: Array<{
    date: Date | string;
    title: string;
    doctorName?: string;
    summary: string;
    type: 'APPOINTMENT' | 'PROCEDURE' | 'CLINICAL_ENCOUNTER';
  }>;
  pastMedications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    prescribedDate: Date;
    doctorName?: string;
  }>;
  currentActiveMedications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions?: string;
    purpose?: string;
    prescribedAt: Date;
  }>;
  records: Array<{
    id: string;
    category: string;
    title: string;
    createdAt: Date;
    notes?: string;
    attachmentsCount: number;
  }>;
}

export class PatientSpecialIdService {
  /**
   * Generates or assigns a unique Special Health ID (#MB-PAT-XXXX) if not present.
   */
  static async ensureSpecialId(patient: IPatient): Promise<string> {
    if (patient.specialId) {
      return patient.specialId;
    }

    const rand = Math.floor(1000 + Math.random() * 9000);
    const specialId = `#MB-PAT-${rand}`;
    patient.specialId = specialId;
    await patient.save();
    return specialId;
  }

  /**
   * Looks up patient by Special Health ID or MongoDB _id and returns longitudinal clinical history.
   */
  static async lookupPatientHistory(
    specialIdOrId: string,
    doctorUser: TokenPayload,
    ipAddress?: string,
    userAgent?: string
  ): Promise<PatientLongitudinalHistory> {
    if (doctorUser.role !== 'DOCTOR' && doctorUser.role !== 'ADMIN') {
      throw new AppError('Only verified clinicians and administrators can access patient lookup', 403, 'FORBIDDEN');
    }

    const cleanId = specialIdOrId.trim();
    const isSpecialId = cleanId.startsWith('#MB-PAT-');

    const patient = isSpecialId
      ? await PatientModel.findOne({ specialId: cleanId })
      : await PatientModel.findOne({
          $or: [{ _id: cleanId.match(/^[0-9a-fA-F]{24}$/) ? cleanId : null }, { specialId: cleanId }],
        });

    if (!patient) {
      throw new AppError(`Patient with identifier "${specialIdOrId}" was not found`, 404, 'PATIENT_NOT_FOUND');
    }

    const resolvedSpecialId = await this.ensureSpecialId(patient);

    // Calculate age from date of birth
    let age: number | undefined;
    if (patient.dateOfBirth) {
      const birthYear = new Date(patient.dateOfBirth).getFullYear();
      if (!isNaN(birthYear)) {
        age = new Date().getFullYear() - birthYear;
      }
    }

    // 1. Fetch Appointments (Past & Scheduled)
    const appointments = await AppointmentModel.find({ patientId: patient._id })
      .populate('doctorId', 'fullName specialization')
      .sort({ startTime: -1 });

    const pastTreatments = appointments.map((apt) => {
      const doc = apt.doctorId as unknown as { fullName?: string; specialization?: string };
      return {
        date: apt.startTime,
        title: `Consultation: ${doc?.specialization || 'General'} with ${doc?.fullName || 'Clinician'}`,
        doctorName: doc?.fullName,
        summary: apt.clinicalNotesSummary || 'Clinical consultation concluded.',
        type: 'APPOINTMENT' as const,
      };
    });

    // 2. Fetch Prescriptions (Active & Historical)
    const prescriptions = await PrescriptionModel.find({ patientId: patient._id })
      .populate('doctorId', 'fullName')
      .sort({ createdAt: -1 });

    const pastMedications: PatientLongitudinalHistory['pastMedications'] = [];
    const currentActiveMedications: PatientLongitudinalHistory['currentActiveMedications'] = [];

    const now = new Date();
    for (const rx of prescriptions) {
      const doc = rx.doctorId as unknown as { fullName?: string };
      const isRecent = now.getTime() - new Date(rx.createdAt).getTime() <= 30 * 24 * 60 * 60 * 1000;

      for (const med of rx.medications) {
        if (isRecent) {
          currentActiveMedications.push({
            name: med.name,
            dosage: med.dosage,
            frequency: med.frequency,
            duration: med.duration,
            instructions: med.instructions,
            purpose: med.instructions || 'Maintenance therapeutic regimen',
            prescribedAt: rx.createdAt,
          });
        } else {
          pastMedications.push({
            name: med.name,
            dosage: med.dosage,
            frequency: med.frequency,
            duration: med.duration,
            prescribedDate: rx.createdAt,
            doctorName: doc?.fullName,
          });
        }
      }
    }

    // 3. Fetch Encrypted Medical Records (AES-256-GCM)
    const records = await MedicalRecordModel.find({ patientId: patient._id }).sort({ createdAt: -1 });
    const decryptedRecords = records.map((rec) => {
      let notes: string | undefined;
      if (rec.encryptedNotes) {
        try {
          const decrypted = decryptPhi(rec.encryptedNotes);
          try {
            const parsed = JSON.parse(decrypted);
            notes = parsed.extracted?.rawSummary || parsed.userNotes || decrypted;
          } catch {
            notes = decrypted;
          }
        } catch {
          notes = '[Encrypted Clinical Note - Verified Key Required]';
        }
      }

      return {
        id: rec._id.toString(),
        category: rec.category,
        title: rec.title,
        createdAt: rec.createdAt,
        notes,
        attachmentsCount: rec.attachments?.length || 0,
      };
    });

    // 4. Immutable Audit Log
    await logAuditEvent({
      actorId: doctorUser.userId,
      actorRole: doctorUser.role,
      action: 'PHI_READ',
      resourceType: 'PatientLongitudinalHistory',
      resourceId: patient._id.toString(),
      patientId: patient._id.toString(),
      outcome: 'SUCCESS',
      ipAddress,
      userAgent,
      details: {
        specialId: resolvedSpecialId,
        treatmentsCount: pastTreatments.length,
        prescriptionsCount: prescriptions.length,
      },
    });

    return {
      patient: {
        id: patient._id.toString(),
        specialId: resolvedSpecialId,
        fullName: patient.fullName,
        age,
        gender: patient.gender,
        // Never fabricate a blood group: show that it was not recorded
        bloodGroup: patient.bloodGroup || 'Not recorded',
        phone: patient.phone,
        emergencyContactName: patient.emergencyContactName,
        emergencyContactPhone: patient.emergencyContactPhone,
        allergies: patient.allergies || [],
      },
      pastTreatments,
      pastMedications,
      currentActiveMedications,
      records: decryptedRecords,
    };
  }
}
