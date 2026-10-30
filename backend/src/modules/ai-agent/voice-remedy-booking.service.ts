import { DoctorModel } from '../doctors/doctor.model';
import { SlotModel } from '../appointments/slot.model';
import { holdSlotForPatient } from '../appointments/appointment.service';
import { ActionTokenManager, StagedActionPayload } from './action-token';
import { TokenPayload } from '../../lib/crypto';

export interface HomeRemedyItem {
  title: string;
  remedy: string;
  preparation: string;
  category: 'HERBAL' | 'HYDRATION' | 'REST' | 'DIETARY';
}

export interface VoiceCompanionAssistResult {
  reply: string;
  speechText: string;
  isMinorAilment: boolean;
  homeRemedies: HomeRemedyItem[];
  redFlags: string[];
  recommendedSpecialist?: string;
  shouldBookConsultation: boolean;
  stagedNextDayBooking?: {
    stagedAction: StagedActionPayload;
    holdToken: string;
    heldUntil: Date;
    doctorName: string;
    specialization: string;
    slotStartTime: Date;
  };
  clinicalDisclaimer: string;
}

export const MANDATORY_VOICE_COMPANION_DISCLAIMER =
  'MediBridge AI Assistant provides informational guidance only and is not a substitute for professional medical judgment, diagnosis, or treatment. In medical emergencies, immediately contact local emergency services or call 108.';

export class VoiceRemedyBookingService {
  /**
   * Assesses patient query (from voice transcript or typing), returning safe home remedies
   * or staging a next-day appointment slot with HMAC confirmation token when clinical care is indicated.
   */
  static async assistCompanion(
    query: string,
    user?: TokenPayload,
    _channel: 'VOICE' | 'TEXT' = 'TEXT'
  ): Promise<VoiceCompanionAssistResult> {
    const q = query.toLowerCase();

    // 1. Analyze for common minor ailments
    const isColdCough = q.includes('cold') || q.includes('cough') || q.includes('throat') || q.includes('gala');
    const isHeadache = q.includes('headache') || q.includes('sir dard') || q.includes('sar dard') || q.includes('migraine');
    const isIndigestion = q.includes('stomach') || q.includes('gas') || q.includes('acidity') || q.includes('pet') || q.includes('indigestion');
    const isMinorFever = q.includes('mild fever') || q.includes('halka bukhar');
    const isMinorAilment = (isColdCough || isHeadache || isIndigestion || isMinorFever) && !q.includes('severe') && !q.includes('chest pain');

    // 2. Prepare Home Remedies
    const homeRemedies: HomeRemedyItem[] = [];
    const redFlags: string[] = [
      'High fever exceeding 102°F (38.9°C) persisting over 48 hours',
      'Shortness of breath, chest tightness, or respiratory distress',
      'Sudden severe dizziness, fainting, or loss of consciousness',
      'Inability to retain liquids or severe persistent vomiting',
    ];

    if (isColdCough) {
      homeRemedies.push(
        {
          title: 'Adrak-Tulsi Kadha (Ginger Basil Decoction)',
          remedy: 'Boil crushed ginger, 5-6 fresh tulsi leaves, and black pepper in water. Drink warm twice daily.',
          preparation: 'Simmer 2 cups water down to 1 cup, strain, and add half teaspoon honey.',
          category: 'HERBAL',
        },
        {
          title: 'Steam Inhalation with Nilgiri (Eucalyptus)',
          remedy: 'Inhale warm steam for 8-10 minutes to relieve nasal congestion and soothe vocal cords.',
          preparation: 'Add 2 drops of eucalyptus oil to hot water bowl, cover head with towel and breathe deeply.',
          category: 'REST',
        },
        {
          title: 'Warm Salt Water Gargle',
          remedy: 'Gargle 3 times daily to reduce pharyngeal bacterial load and alleviate throat inflammation.',
          preparation: 'Dissolve half teaspoon rock salt in one glass of warm water.',
          category: 'HYDRATION',
        }
      );
    } else if (isHeadache) {
      homeRemedies.push(
        {
          title: 'Deep Hydration & Electrolyte Intake',
          remedy: 'Dehydration is the primary trigger for tension headaches. Drink 500ml electrolyte water.',
          preparation: 'Mix fresh lemon juice and pinch of salt in room-temperature water.',
          category: 'HYDRATION',
        },
        {
          title: 'Peppermint or Menthol Temple Acupressure',
          remedy: 'Gently massage temples in circular motions for 5 minutes in a darkened, quiet room.',
          preparation: 'Apply a drop of diluted peppermint or lavender oil to temples.',
          category: 'REST',
        }
      );
    } else if (isIndigestion) {
      homeRemedies.push(
        {
          title: 'Jeera & Saunf Warm Water (Cumin Fennel Brew)',
          remedy: 'Alleviates bloating, neutralizes stomach acidity, and accelerates digestive enzyme release.',
          preparation: 'Boil 1 tsp cumin seeds and 1 tsp fennel seeds in 2 glasses of water for 5 minutes.',
          category: 'HERBAL',
        },
        {
          title: 'Ajwain with Black Salt (Carom Seeds)',
          remedy: 'Traditional carminative remedy for acute spasmodic gas and indigestion.',
          preparation: 'Chew half teaspoon ajwain with warm water.',
          category: 'DIETARY',
        }
      );
    } else {
      homeRemedies.push({
        title: 'Hydration & Rest Protocol',
        remedy: 'Maintain oral hydration with warm fluids, coconut water, and get 8 hours of uninterrupted sleep.',
        preparation: 'Sip warm fluids every hour and avoid strenuous physical exertion.',
        category: 'REST',
      });
    }

    // 3. Check if Doctor Consultation or Next-Day Slot is Requested or Indicated
    const wantsConsultation =
      q.includes('doctor') ||
      q.includes('appointment') ||
      q.includes('consult') ||
      q.includes('book') ||
      q.includes('severe') ||
      q.includes('chest') ||
      q.includes('dermatologist') ||
      q.includes('specialist');

    const shouldBookConsultation = wantsConsultation || !isMinorAilment;
    let recommendedSpecialist = 'General Internal Medicine';
    if (q.includes('skin') || q.includes('rash') || q.includes('itching')) {
      recommendedSpecialist = 'Dermatology';
    } else if (q.includes('heart') || q.includes('chest') || q.includes('pressure')) {
      recommendedSpecialist = 'Cardiology';
    } else if (q.includes('throat') || q.includes('ear') || q.includes('nose')) {
      recommendedSpecialist = 'ENT (Otolaryngology)';
    }

    let stagedNextDayBooking: VoiceCompanionAssistResult['stagedNextDayBooking'] | undefined;

    // 4. If consultation requested and user is an authenticated patient, stage Next-Day Slot with HMAC
    if (shouldBookConsultation && user && user.role === 'PATIENT') {
      try {
        // Find a verified doctor of the recommended specialty or any verified doctor
        let doctor = await DoctorModel.findOne({
          verificationStatus: 'VERIFIED',
          specialization: new RegExp(recommendedSpecialist, 'i'),
        });

        if (!doctor) {
          doctor = await DoctorModel.findOne({ verificationStatus: 'VERIFIED' });
        }

        if (doctor) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(10, 0, 0, 0); // 10:00 AM tomorrow

          // Look for an existing available slot tomorrow or create one for test/demo
          let slot = await SlotModel.findOne({
            doctorId: doctor._id,
            startTime: { $gte: tomorrow },
            status: 'AVAILABLE',
          });

          if (!slot) {
            const slotEndTime = new Date(tomorrow.getTime() + 30 * 60 * 1000);
            slot = await SlotModel.create({
              doctorId: doctor._id,
              startTime: tomorrow,
              endTime: slotEndTime,
              status: 'AVAILABLE',
            });
          }

          // Acquire 5-minute atomic slot hold
          const holdRes = await holdSlotForPatient(slot._id.toString(), user);

          // Stage consequential booking action with 5-minute HMAC token
          const staged = await ActionTokenManager.stageAction(
            user.userId,
            'initiateAppointmentBooking',
            slot._id.toString(),
            {
              slotId: slot._id.toString(),
              holdToken: holdRes.holdToken,
              notes: `Voice AI Companion Consultation: ${query.slice(0, 100)}`,
            }
          );

          stagedNextDayBooking = {
            stagedAction: staged,
            holdToken: holdRes.holdToken,
            heldUntil: holdRes.heldUntil,
            doctorName: doctor.fullName,
            specialization: doctor.specialization,
            slotStartTime: slot.startTime,
          };
        }
      } catch (err) {
        // Safe fail-closed: return remedies without breaking voice turn
        console.error('Voice companion next-day slot staging skipped:', err);
      }
    }

    // 5. Compose natural spoken reply
    let reply = '';
    if (isMinorAilment && !wantsConsultation) {
      reply = `I understand you are experiencing discomfort with your symptoms. For minor relief, I recommend trying gentle home remedies like warm ginger-tulsi tea, steam inhalation, and proper hydration. However, please watch out for warning signs like high fever or breathing distress.`;
    } else if (stagedNextDayBooking) {
      reply = `Based on your symptoms, a consultation with Dr. ${stagedNextDayBooking.doctorName} (${stagedNextDayBooking.specialization}) is recommended. I have reserved an opening for tomorrow at ${new Date(stagedNextDayBooking.slotStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. You can confirm your booking with one tap below.`;
    } else {
      reply = `Your symptoms suggest consulting a ${recommendedSpecialist}. Please stay rested and hydrated. Would you like me to reserve a doctor consultation slot for you?`;
    }

    return {
      reply,
      speechText: reply,
      isMinorAilment,
      homeRemedies,
      redFlags,
      recommendedSpecialist,
      shouldBookConsultation,
      stagedNextDayBooking,
      clinicalDisclaimer: MANDATORY_VOICE_COMPANION_DISCLAIMER,
    };
  }
}
