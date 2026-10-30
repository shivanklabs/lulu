import { DoctorModel, IDoctor } from './doctor.model';
import { SlotModel, ISlot } from '../appointments/slot.model';
import { holdSlotForPatient } from '../appointments/appointment.service';
import { ActionTokenManager, StagedActionPayload } from '../ai-agent/action-token';
import { AIProviderFactory } from '../../integrations/ai/ai.factory';
import { SpecialistMappingResult } from '../../integrations/gemini-multimodal.adapter';
import { TokenPayload } from '../../lib/crypto';
import { AppError } from '../../middleware/errorHandler';

export interface DoctorWithSlotsAndDistance {
  doctor: IDoctor;
  distanceKm: number;
  availableSlots: ISlot[];
}

export interface NearbyDoctorMatchResult {
  symptomMapping: SpecialistMappingResult;
  doctors: DoctorWithSlotsAndDistance[];
}

export interface StageNearbyBookingResult {
  stagedAction: StagedActionPayload;
  holdToken: string;
  heldUntil: Date;
}

export class NearbyDoctorMatcherService {
  /**
   * Calculates approximate distance between two GPS coordinates using the Haversine formula (km).
   */
  private static calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  static async findNearbySpecialists(
    symptoms: string,
    userLat: number = 28.6139,
    userLng: number = 77.2090,
    maxDistanceKm: number = 50
  ): Promise<NearbyDoctorMatchResult> {
    const multimodal = AIProviderFactory.getMultimodalAdapter();
    const mapping = await multimodal.mapSymptomsToSpecialist(symptoms);

    const specialtiesToMatch = [
      mapping.primarySpecialty,
      ...mapping.secondarySpecialties,
    ];

    const regexArray = specialtiesToMatch.map((s) => new RegExp(s.replace(/&/g, '.*'), 'i'));

    // Query verified doctors
    const doctors = await DoctorModel.find({
      verificationStatus: 'VERIFIED',
      $or: regexArray.map((r) => ({ specialization: r })),
    });

    // If no direct specialty matches, broaden to verified doctors in general practice / internal medicine
    let matchedDoctors = doctors;
    if (matchedDoctors.length === 0) {
      matchedDoctors = await DoctorModel.find({ verificationStatus: 'VERIFIED' }).limit(5);
    }

    const now = new Date();
    const results: DoctorWithSlotsAndDistance[] = [];

    for (const doc of matchedDoctors) {
      const docCoords = doc.location?.coordinates || [77.2090, 28.6139];
      const docLng = docCoords[0];
      const docLat = docCoords[1];
      const distanceKm = this.calculateDistanceKm(userLat, userLng, docLat, docLng);

      if (distanceKm <= maxDistanceKm) {
        const slots = await SlotModel.find({
          doctorId: doc._id,
          startTime: { $gte: now },
          status: 'AVAILABLE',
        })
          .sort({ startTime: 1 })
          .limit(5);

        results.push({
          doctor: doc,
          distanceKm,
          availableSlots: slots,
        });
      }
    }

    results.sort((a, b) => a.distanceKm - b.distanceKm);

    return {
      symptomMapping: mapping,
      doctors: results,
    };
  }

  /**
   * Stages a slot hold for a matched nearby doctor protected by single-use HMAC token.
   */
  static async stageNearbyHold(
    slotId: string,
    patientUser: TokenPayload
  ): Promise<StageNearbyBookingResult> {
    if (patientUser.role !== 'PATIENT') {
      throw new AppError('Only patients can hold appointment slots', 403, 'FORBIDDEN');
    }

    // 1. Acquire 5-minute atomic checkout hold on the slot
    const holdRes = await holdSlotForPatient(slotId, patientUser);

    // 2. Stage consequential booking action with 5-minute single-use HMAC token
    const staged = await ActionTokenManager.stageAction(
      patientUser.userId,
      'initiateAppointmentBooking',
      slotId,
      {
        slotId,
        holdToken: holdRes.holdToken,
        notes: 'Nearby Doctor Automated Recommendation Hold',
      }
    );

    return {
      stagedAction: staged,
      holdToken: holdRes.holdToken,
      heldUntil: holdRes.heldUntil,
    };
  }
}
