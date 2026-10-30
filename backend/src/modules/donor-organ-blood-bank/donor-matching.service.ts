import crypto from 'crypto';
import { AnonymizedDonorModel, IAnonymizedDonor } from './anonymized-donor.model';
import { BloodOrganBankModel, BloodGroupType, OrganTissueType, IBloodOrganBank } from './blood-organ-bank.model';
import { PatientModel } from '../patients/patient.model';
import { logAuditEvent } from '../audit/audit.service';
import { TokenPayload } from '../../lib/crypto';
import { AppError } from '../../middleware/errorHandler';

export interface SanitizedDonorMatchView {
  donorAliasId: string;
  bloodGroup: BloodGroupType;
  organOrTissueType: OrganTissueType;
  hlaMatchPercentage: number;
  ageBracket: string;
  medicalFitnessStatus: string;
  nodalRegistryCode: string;
  distanceKm: number;
  isAvailable: boolean;
  complianceNotice: string;
}

export interface DonorSearchCriteria {
  bloodGroup?: BloodGroupType;
  organType?: OrganTissueType;
  minHlaMatchPercent?: number;
  maxDistanceKm?: number;
}

export interface AllocationRequestResult {
  requestId: string;
  donorAliasId: string;
  recipientSpecialId: string;
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY_CRITICAL';
  status: 'SUBMITTED_TO_NOTTO_NODAL_OFFICER';
  timestamp: string;
  auditRecorded: boolean;
}

const DEFAULT_DONOR_SEEDS = [
  {
    donorAliasId: '#DONOR-8821',
    bloodGroup: 'O-' as BloodGroupType,
    organOrTissueType: 'BLOOD' as OrganTissueType,
    hlaMatchPercentage: 100,
    ageBracket: '25-35',
    medicalFitnessStatus: 'FIT_APPROVED' as const,
    nodalRegistryCode: 'NOTTO-DL-402',
    distanceKm: 4.8,
    isAvailable: true,
    registryAuditHash: crypto.randomBytes(16).toString('hex'),
  },
  {
    donorAliasId: '#DONOR-9043',
    bloodGroup: 'A+' as BloodGroupType,
    organOrTissueType: 'KIDNEY' as OrganTissueType,
    hlaMatchPercentage: 94,
    ageBracket: '30-40',
    medicalFitnessStatus: 'FIT_APPROVED' as const,
    nodalRegistryCode: 'NOTTO-DL-408',
    distanceKm: 8.2,
    isAvailable: true,
    registryAuditHash: crypto.randomBytes(16).toString('hex'),
  },
  {
    donorAliasId: '#DONOR-4412',
    bloodGroup: 'B+' as BloodGroupType,
    organOrTissueType: 'LIVER' as OrganTissueType,
    hlaMatchPercentage: 88,
    ageBracket: '25-35',
    medicalFitnessStatus: 'FIT_APPROVED' as const,
    nodalRegistryCode: 'NOTTO-DL-412',
    distanceKm: 14.5,
    isAvailable: true,
    registryAuditHash: crypto.randomBytes(16).toString('hex'),
  },
  {
    donorAliasId: '#DONOR-7182',
    bloodGroup: 'AB+' as BloodGroupType,
    organOrTissueType: 'CORNEA' as OrganTissueType,
    hlaMatchPercentage: 99,
    ageBracket: '20-30',
    medicalFitnessStatus: 'FIT_APPROVED' as const,
    nodalRegistryCode: 'NOTTO-DL-401',
    distanceKm: 3.1,
    isAvailable: true,
    registryAuditHash: crypto.randomBytes(16).toString('hex'),
  },
  {
    donorAliasId: '#DONOR-5590',
    bloodGroup: 'O+' as BloodGroupType,
    organOrTissueType: 'BONE_MARROW' as OrganTissueType,
    hlaMatchPercentage: 96,
    ageBracket: '20-30',
    medicalFitnessStatus: 'FIT_APPROVED' as const,
    nodalRegistryCode: 'NOTTO-DL-419',
    distanceKm: 11.0,
    isAvailable: true,
    registryAuditHash: crypto.randomBytes(16).toString('hex'),
  },
  {
    donorAliasId: '#DONOR-3301',
    bloodGroup: 'O+' as BloodGroupType,
    organOrTissueType: 'HEART' as OrganTissueType,
    hlaMatchPercentage: 92,
    ageBracket: '25-35',
    medicalFitnessStatus: 'FIT_APPROVED' as const,
    nodalRegistryCode: 'NOTTO-DL-405',
    distanceKm: 18.2,
    isAvailable: true,
    registryAuditHash: crypto.randomBytes(16).toString('hex'),
  },
];

const DEFAULT_BLOOD_INVENTORY = [
  { bloodGroup: 'O+' as BloodGroupType, wholeBloodUnits: 42, prbcUnits: 55, plateletUnits: 28, ffpUnits: 34, lastTestedAt: new Date() },
  { bloodGroup: 'O-' as BloodGroupType, wholeBloodUnits: 14, prbcUnits: 18, plateletUnits: 9, ffpUnits: 12, lastTestedAt: new Date() },
  { bloodGroup: 'A+' as BloodGroupType, wholeBloodUnits: 36, prbcUnits: 48, plateletUnits: 22, ffpUnits: 30, lastTestedAt: new Date() },
  { bloodGroup: 'A-' as BloodGroupType, wholeBloodUnits: 9, prbcUnits: 12, plateletUnits: 6, ffpUnits: 8, lastTestedAt: new Date() },
  { bloodGroup: 'B+' as BloodGroupType, wholeBloodUnits: 38, prbcUnits: 50, plateletUnits: 25, ffpUnits: 32, lastTestedAt: new Date() },
  { bloodGroup: 'B-' as BloodGroupType, wholeBloodUnits: 8, prbcUnits: 11, plateletUnits: 5, ffpUnits: 7, lastTestedAt: new Date() },
  { bloodGroup: 'AB+' as BloodGroupType, wholeBloodUnits: 21, prbcUnits: 26, plateletUnits: 14, ffpUnits: 19, lastTestedAt: new Date() },
  { bloodGroup: 'AB-' as BloodGroupType, wholeBloodUnits: 5, prbcUnits: 7, plateletUnits: 3, ffpUnits: 4, lastTestedAt: new Date() },
];

const DEFAULT_ORGAN_REGISTRY = [
  { organType: 'KIDNEY' as OrganTissueType, availableCount: 2, nodalCenter: 'AIIMS Delhi Organ Recovery Nodal Unit', preservationColdIschemiaLimitHours: 24, status: 'READY_FOR_MATCH' as const },
  { organType: 'LIVER' as OrganTissueType, availableCount: 1, nodalCenter: 'ILBS New Delhi Hepatic Transplant Wing', preservationColdIschemiaLimitHours: 12, status: 'READY_FOR_MATCH' as const },
  { organType: 'CORNEA' as OrganTissueType, availableCount: 6, nodalCenter: 'Dr. R.P. Centre for Ophthalmic Sciences', preservationColdIschemiaLimitHours: 96, status: 'READY_FOR_MATCH' as const },
  { organType: 'HEART' as OrganTissueType, availableCount: 1, nodalCenter: 'National Heart Institute Transit Bank', preservationColdIschemiaLimitHours: 4, status: 'READY_FOR_MATCH' as const },
  { organType: 'BONE_MARROW' as OrganTissueType, availableCount: 4, nodalCenter: 'Tata Memorial Registry Node', preservationColdIschemiaLimitHours: 72, status: 'READY_FOR_MATCH' as const },
];

export class DonorMatchingService {
  private static async seedDefaultsIfEmpty(): Promise<void> {
    const donorCount = await AnonymizedDonorModel.countDocuments();
    if (donorCount === 0) {
      await AnonymizedDonorModel.insertMany(DEFAULT_DONOR_SEEDS);
    }

    const bankCount = await BloodOrganBankModel.countDocuments();
    if (bankCount === 0) {
      await BloodOrganBankModel.create({
        hospitalFacility: 'Metropolitan Nodal Blood & Organ Bank',
        bloodInventory: DEFAULT_BLOOD_INVENTORY,
        organRegistry: DEFAULT_ORGAN_REGISTRY,
      });
    }
  }

  static async getInventory(): Promise<IBloodOrganBank> {
    await this.seedDefaultsIfEmpty();
    let bank = await BloodOrganBankModel.findOne();
    if (!bank) {
      bank = await BloodOrganBankModel.create({
        hospitalFacility: 'Metropolitan Nodal Blood & Organ Bank',
        bloodInventory: DEFAULT_BLOOD_INVENTORY,
        organRegistry: DEFAULT_ORGAN_REGISTRY,
      });
    }
    return bank;
  }

  /**
   * Searches compatible donors based on Blood Group and Organ/Tissue type.
   * ANTI-BLACK-MARKET & ANTI-TRAFFICKING SAFEGUARD:
   * Explicitly strips all donor PII (Name, phone, address, national ID, financial records).
   */
  static async searchCompatibleDonors(criteria: DonorSearchCriteria): Promise<SanitizedDonorMatchView[]> {
    await this.seedDefaultsIfEmpty();

    const query: Record<string, unknown> = { isAvailable: true };

    if (criteria.organType) {
      query.organOrTissueType = criteria.organType;
    }

    if (criteria.bloodGroup) {
      // Compatibility logic: O- is universal blood donor; otherwise match exact or compatible
      if (criteria.bloodGroup === 'AB+') {
        // Universal recipient
      } else if (criteria.bloodGroup.endsWith('-')) {
        query.bloodGroup = { $in: [criteria.bloodGroup, 'O-'] };
      } else {
        const baseLetter = criteria.bloodGroup.replace('+', '');
        query.bloodGroup = { $in: [criteria.bloodGroup, `${baseLetter}-`, 'O+', 'O-'] };
      }
    }

    if (criteria.minHlaMatchPercent) {
      query.hlaMatchPercentage = { $gte: criteria.minHlaMatchPercent };
    }

    if (criteria.maxDistanceKm) {
      query.distanceKm = { $lte: criteria.maxDistanceKm };
    }

    const donors = await AnonymizedDonorModel.find(query).sort({ hlaMatchPercentage: -1, distanceKm: 1 });

    return donors.map((d: IAnonymizedDonor) => ({
      donorAliasId: d.donorAliasId,
      bloodGroup: d.bloodGroup,
      organOrTissueType: d.organOrTissueType,
      hlaMatchPercentage: d.hlaMatchPercentage,
      ageBracket: d.ageBracket,
      medicalFitnessStatus: d.medicalFitnessStatus,
      nodalRegistryCode: d.nodalRegistryCode,
      distanceKm: d.distanceKm,
      isAvailable: d.isAvailable,
      complianceNotice:
        'Protected under National Organ & Tissue Transplant Organisation (NOTTO) regulations. Donor PII is anonymized to prevent organ commercialization and black-market trafficking.',
    }));
  }

  /**
   * Institutional request to allocate a matched blood or organ donor to a verified patient.
   */
  static async requestAllocation(
    donorAliasId: string,
    recipientSpecialId: string,
    urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY_CRITICAL',
    justification: string,
    doctorUser: TokenPayload
  ): Promise<AllocationRequestResult> {
    if (doctorUser.role !== 'DOCTOR' && doctorUser.role !== 'ADMIN') {
      throw new AppError('Only verified clinicians and administrators may submit donor allocation requests', 403, 'FORBIDDEN');
    }

    const donor = await AnonymizedDonorModel.findOne({ donorAliasId });
    if (!donor) {
      throw new AppError(`Donor alias "${donorAliasId}" not found in registry`, 404, 'DONOR_NOT_FOUND');
    }

    const patient = await PatientModel.findOne({
      $or: [{ specialId: recipientSpecialId }, { _id: recipientSpecialId.match(/^[0-9a-fA-F]{24}$/) ? recipientSpecialId : null }],
    });

    if (!patient) {
      throw new AppError(`Recipient patient "${recipientSpecialId}" not found`, 404, 'PATIENT_NOT_FOUND');
    }

    const requestId = `ALLOC-NOTTO-${Math.floor(100000 + Math.random() * 900000)}`;

    // Tamper-evident append-only audit record
    await logAuditEvent({
      actorId: doctorUser.userId,
      actorRole: doctorUser.role,
      action: 'ORGAN_DONOR_ALLOCATION_REQUEST',
      resourceType: 'AnonymizedDonor',
      resourceId: donor._id.toString(),
      patientId: patient._id.toString(),
      outcome: 'SUCCESS',
      details: {
        requestId,
        donorAliasId,
        recipientSpecialId: patient.specialId || patient._id.toString(),
        organOrTissueType: donor.organOrTissueType,
        bloodGroup: donor.bloodGroup,
        urgency,
        justification,
        statutoryRegulatoryBody: 'NOTTO',
      },
    });

    return {
      requestId,
      donorAliasId,
      recipientSpecialId: patient.specialId || patient._id.toString(),
      urgency,
      status: 'SUBMITTED_TO_NOTTO_NODAL_OFFICER',
      timestamp: new Date().toISOString(),
      auditRecorded: true,
    };
  }
}
