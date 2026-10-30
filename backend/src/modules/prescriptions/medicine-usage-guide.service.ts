import { PrescriptionModel } from './prescription.model';
import { PatientModel } from '../patients/patient.model';
import { DoctorModel } from '../doctors/doctor.model';
import { evaluateConsentAccess } from '../consent/consent.service';
import { TokenPayload } from '../../lib/crypto';
import { AIProviderFactory } from '../../integrations/ai/ai.factory';
import { MedicineExplanation } from '../../integrations/gemini-multimodal.adapter';
import { logAuditEvent } from '../audit/audit.service';
import { AppError } from '../../middleware/errorHandler';

export const generatePrescriptionUsageGuide = async (
  prescriptionId: string,
  actor: TokenPayload,
  language: 'en' | 'hi' | 'hinglish' = 'hinglish'
): Promise<MedicineExplanation[]> => {
  const prescription = await PrescriptionModel.findById(prescriptionId);
  if (!prescription) {
    throw new AppError('Prescription not found', 404, 'NOT_FOUND');
  }

  // Evaluate Authorization
  let authorized = false;
  if (actor.role === 'PATIENT') {
    const patient = await PatientModel.findOne({ userId: actor.userId });
    if (patient && patient._id.toString() === prescription.patientId.toString()) {
      authorized = true;
    }
  } else if (actor.role === 'DOCTOR') {
    const doctor = await DoctorModel.findOne({ userId: actor.userId });
    if (doctor) {
      if (doctor._id.toString() === prescription.doctorId.toString()) {
        authorized = true;
      } else if (doctor.verificationStatus === 'VERIFIED') {
        authorized = await evaluateConsentAccess(
          doctor._id.toString(),
          prescription.patientId.toString(),
          'PRESCRIPTIONS'
        );
      }
    }
  }

  if (!authorized) {
    throw new AppError('Access to prescription medicine guide denied. Active consent required.', 403, 'FORBIDDEN');
  }

  const multimodal = AIProviderFactory.getMultimodalAdapter();
  const guides: MedicineExplanation[] = [];

  for (const med of prescription.medications) {
    const guide = await multimodal.explainMedicineInPlainLanguage(
      med.name,
      `${med.dosage} (${med.frequency})`,
      language
    );
    guides.push(guide);
  }

  await logAuditEvent({
    actorId: actor.userId,
    actorRole: actor.role,
    action: 'PHI_READ',
    resourceType: 'PrescriptionGuide',
    resourceId: prescriptionId,
    patientId: prescription.patientId.toString(),
    outcome: 'SUCCESS',
    details: { medicationCount: guides.length, language },
  });

  return guides;
};
