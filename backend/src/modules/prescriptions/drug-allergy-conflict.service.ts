import { Types } from 'mongoose';
import { PatientModel } from '../patients/patient.model';
import { PrescriptionModel } from './prescription.model';
import { AppError } from '../../middleware/errorHandler';

export interface DrugConflictItem {
  severity: 'HIGH' | 'MODERATE' | 'LOW';
  title: string;
  description: string;
  conflictingMedication: string;
  source: 'ALLERGY' | 'DRUG_INTERACTION';
}

export interface DrugConflictReport {
  hasConflict: boolean;
  conflicts: DrugConflictItem[];
}

export const checkPrescriptionConflicts = async (
  patientId: string,
  proposedMedications: Array<{ name: string; dosage?: string }>
): Promise<DrugConflictReport> => {
  const patient = await PatientModel.findById(patientId);
  if (!patient) {
    throw new AppError('Patient profile not found', 404, 'PATIENT_NOT_FOUND');
  }

  const conflicts: DrugConflictItem[] = [];

  // 1. Patient Known Allergies Scan
  const patientAllergies = (patient.allergies || []).map((a) => a.toLowerCase().trim());

  for (const proposed of proposedMedications) {
    const medName = proposed.name.toLowerCase();

    // Penicillin class
    const isPenicillin =
      medName.includes('penicillin') ||
      medName.includes('amoxicillin') ||
      medName.includes('ampicillin') ||
      medName.includes('augmentin');

    if (isPenicillin && patientAllergies.some((a) => a.includes('penicillin') || a.includes('amox'))) {
      conflicts.push({
        severity: 'HIGH',
        title: 'Severe Penicillin Allergy Contraindication',
        description: `Patient has documented allergy to Penicillin. Prescribing "${proposed.name}" poses severe risk of anaphylactic hypersensitivity.`,
        conflictingMedication: proposed.name,
        source: 'ALLERGY',
      });
    }

    // Sulfa class
    const isSulfa =
      medName.includes('sulfa') ||
      medName.includes('bactrim') ||
      medName.includes('sulfamethoxazole') ||
      medName.includes('septra');

    if (isSulfa && patientAllergies.some((a) => a.includes('sulfa'))) {
      conflicts.push({
        severity: 'HIGH',
        title: 'Sulfa Hypersensitivity Conflict',
        description: `Patient allergy record indicates Sulfa intolerance. "${proposed.name}" contains sulfonamides.`,
        conflictingMedication: proposed.name,
        source: 'ALLERGY',
      });
    }

    // NSAIDs / Aspirin class
    const isNsaid =
      medName.includes('aspirin') ||
      medName.includes('ibuprofen') ||
      medName.includes('naproxen') ||
      medName.includes('diclofenac') ||
      medName.includes('ketorolac');

    if (isNsaid && patientAllergies.some((a) => a.includes('nsaid') || a.includes('aspirin') || a.includes('ibuprofen'))) {
      conflicts.push({
        severity: 'HIGH',
        title: 'NSAID / Aspirin Hypersensitivity Warning',
        description: `Patient has documented reactive intolerance to NSAIDs/Aspirin. Prescribing "${proposed.name}" may trigger bronchospasm or severe urticaria.`,
        conflictingMedication: proposed.name,
        source: 'ALLERGY',
      });
    }
  }

  // 2. Active Prescriptions Drug-Drug Interactions Scan
  const activePrescriptions = await PrescriptionModel.find({
    patientId: new Types.ObjectId(patientId),
    status: { $in: ['ISSUED', 'DISPENSED'] },
  });

  const existingMeds: string[] = [];
  for (const rx of activePrescriptions) {
    for (const m of rx.medications) {
      existingMeds.push(m.name.toLowerCase());
    }
  }

  for (const proposed of proposedMedications) {
    const pName = proposed.name.toLowerCase();

    // Interaction: Sildenafil + Nitrates (in existing prescriptions or within candidate regimen)
    const isSildenafil = pName.includes('sildenafil') || pName.includes('tadalafil') || pName.includes('viagra');
    const hasNitrates =
      existingMeds.some((m) => m.includes('nitroglycerin') || m.includes('isosorbide') || m.includes('nitrate')) ||
      proposedMedications.some(
        (m) =>
          m.name.toLowerCase() !== pName &&
          (m.name.toLowerCase().includes('nitroglycerin') ||
            m.name.toLowerCase().includes('isosorbide') ||
            m.name.toLowerCase().includes('nitrate'))
      );

    if (isSildenafil && hasNitrates) {
      conflicts.push({
        severity: 'HIGH',
        title: 'Life-Threatening Hypotension Interaction (PDE-5 Inhibitor + Nitrate)',
        description: `Co-administration of "${proposed.name}" with Nitrate vasodilator therapy causes severe refractory hypotension.`,
        conflictingMedication: proposed.name,
        source: 'DRUG_INTERACTION',
      });
    }

    // Interaction: Warfarin + NSAIDs
    const isAnticoagulant =
      existingMeds.some((m) => m.includes('warfarin') || m.includes('heparin') || m.includes('apixaban')) ||
      proposedMedications.some(
        (m) =>
          m.name.toLowerCase() !== pName &&
          (m.name.toLowerCase().includes('warfarin') || m.name.toLowerCase().includes('heparin'))
      );

    const isNsaidMed = pName.includes('ibuprofen') || pName.includes('naproxen') || pName.includes('aspirin') || pName.includes('diclofenac');
    if (isNsaidMed && isAnticoagulant) {
      conflicts.push({
        severity: 'HIGH',
        title: 'Major Hemorrhagic Bleeding Risk (Anticoagulant + NSAID)',
        description: `Prescribing "${proposed.name}" while patient is on therapeutic anticoagulant therapy significantly elevates gastrointestinal hemorrhage risk.`,
        conflictingMedication: proposed.name,
        source: 'DRUG_INTERACTION',
      });
    }

    // Interaction: High-dose Statin + Gemfibrozil
    const isStatin = pName.includes('atorvastatin') || pName.includes('simvastatin') || pName.includes('rosuvastatin');
    const hasFibrate =
      existingMeds.some((m) => m.includes('gemfibrozil') || m.includes('fenofibrate')) ||
      proposedMedications.some(
        (m) =>
          m.name.toLowerCase() !== pName &&
          (m.name.toLowerCase().includes('gemfibrozil') || m.name.toLowerCase().includes('fenofibrate'))
      );

    if (isStatin && hasFibrate) {
      conflicts.push({
        severity: 'MODERATE',
        title: 'Rhabdomyolysis & Myopathy Risk (Statin + Fibrate)',
        description: `Concurrent Statin and Fibrate therapy increases risk of severe skeletal muscle breakdown (rhabdomyolysis).`,
        conflictingMedication: proposed.name,
        source: 'DRUG_INTERACTION',
      });
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
};
