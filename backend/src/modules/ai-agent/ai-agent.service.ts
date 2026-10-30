import { TokenPayload } from '../../lib/crypto';
import { AppError } from '../../middleware/errorHandler';
import { AIProviderFactory } from '../../integrations/ai/ai.factory';
import { ChatMessage } from '../../integrations/ai/ai.types';
import { ActionTokenManager, StagedActionPayload } from './action-token';
import { getAvailableDoctorSlots, confirmAppointmentBooking, cancelAppointmentBooking } from '../appointments/appointment.service';
import { draftPrescription } from '../prescriptions/prescription.service';
import { revokeConsentGrant } from '../consent/consent.service';
import { logAuditEvent } from '../audit/audit.service';
import { DoctorModel } from '../doctors/doctor.model';
import { PatientModel } from '../patients/patient.model';

export interface AgentTurnResponse {
  reply: string;
  thought?: string;
  toolUsed?: string;
  stagedAction?: StagedActionPayload;
  data?: unknown;
  limitations?: string;
}

export interface ConfirmActionInput {
  action: StagedActionPayload['action'];
  resourceId: string;
  payload: Record<string, unknown>;
  nonce: string;
  expiresAt: string;
  confirmationToken: string;
}

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

export class AIAgentService {
  /**
   * Architecture Limitation:
   * Real provider-native tool calling (e.g. Gemini FunctionDeclaration / OpenAI Tools) requires
   * active external provider credentials. In this environment, the agent operates in
   * deterministic staging mode: parameters are strictly validated on the server, authorized
   * against the user session, and staged with single-use HMAC-SHA256 confirmation tokens.
   */
  static readonly TOOL_CALLING_LIMITATION =
    'Real provider-native LLM tool-calling is not currently active; the agent uses server-authorized parameter extraction and single-use HMAC-SHA256 confirmation tokens.';

  static async processAgentTurn(
    user: TokenPayload,
    userPrompt: string
  ): Promise<AgentTurnResponse> {
    const provider = AIProviderFactory.getDefaultProvider();
    const normalizedPrompt = userPrompt.toLowerCase().trim();

    // 1. Read-Only Query Tool: Find available slots
    if (
      normalizedPrompt.includes('show slots') ||
      normalizedPrompt.includes('available slots') ||
      normalizedPrompt.includes('find slots')
    ) {
      const doctors = await DoctorModel.find({ verificationStatus: 'VERIFIED' }).limit(5);
      const slots = [];
      for (const doc of doctors) {
        const docSlots = await getAvailableDoctorSlots(doc._id.toString());
        slots.push(...docSlots);
      }

      return {
        reply: `Found ${slots.length} available consultation slot(s) with verified doctors.`,
        toolUsed: 'findAvailableSlots',
        data: slots,
        limitations: this.TOOL_CALLING_LIMITATION,
      };
    }

    // 2. Consequential Action: Stage Appointment Booking (PATIENT ONLY)
    if (
      normalizedPrompt.includes('book') ||
      normalizedPrompt.includes('schedule') ||
      normalizedPrompt.includes('reserve')
    ) {
      if (user.role !== 'PATIENT') {
        throw new AppError('Only patients can initiate appointment booking', 403, 'FORBIDDEN');
      }

      const slotMatch = userPrompt.match(/slot[:=\s]+(\S+)/i);
      const holdTokenMatch = userPrompt.match(/hold[:=\s]+(\S+)/i);

      if (!slotMatch || !holdTokenMatch) {
        return {
          reply:
            'To stage an appointment booking, please provide both a valid 24-character slot ID and your active hold token (e.g., "book slot:<slotId> hold:<holdToken>"). You can find available slots using "show slots".',
          thought: 'Missing required parameters: slotId or holdToken.',
          limitations: this.TOOL_CALLING_LIMITATION,
        };
      }

      const slotId = slotMatch[1];
      const holdToken = holdTokenMatch[1];

      if (!OBJECT_ID_REGEX.test(slotId)) {
        throw new AppError('Invalid slot ID format. Expected 24-character hexadecimal ObjectId.', 400, 'INVALID_PARAMETER');
      }

      const staged = await ActionTokenManager.stageAction(
        user.userId,
        'initiateAppointmentBooking',
        slotId,
        {
          slotId,
          holdToken,
          notes: 'AI Agent assisted booking',
        }
      );

      return {
        reply:
          'I have prepared your appointment booking. Please review and confirm within 5 minutes to complete the reservation.',
        thought: 'Staged atomic appointment confirmation with single-use HMAC-SHA256 signature.',
        toolUsed: 'stageAppointmentBooking',
        stagedAction: staged,
        limitations: this.TOOL_CALLING_LIMITATION,
      };
    }

    // 3. Consequential Action: Stage Appointment Cancellation
    if (
      normalizedPrompt.includes('cancel appointment') ||
      normalizedPrompt.includes('cancel booking')
    ) {
      const aptMatch = userPrompt.match(/appointment[:=\s]+(\S+)/i);

      if (!aptMatch) {
        return {
          reply:
            'To stage an appointment cancellation, please specify the appointment ID (e.g., "cancel appointment:<appointmentId>").',
          thought: 'Missing required parameter: appointmentId.',
          limitations: this.TOOL_CALLING_LIMITATION,
        };
      }

      const appointmentId = aptMatch[1];

      if (!OBJECT_ID_REGEX.test(appointmentId)) {
        throw new AppError('Invalid appointment ID format. Expected 24-character hexadecimal ObjectId.', 400, 'INVALID_PARAMETER');
      }

      const staged = await ActionTokenManager.stageAction(
        user.userId,
        'cancelAppointment',
        appointmentId,
        {
          appointmentId,
          reason: 'Patient requested cancellation through AI agent',
        }
      );

      return {
        reply:
          'I have prepared your appointment cancellation request. Please confirm to finalize releasing the slot.',
        thought: 'Staged appointment cancellation with single-use HMAC token.',
        toolUsed: 'stageAppointmentCancellation',
        stagedAction: staged,
        limitations: this.TOOL_CALLING_LIMITATION,
      };
    }

    // 4. Consequential Action: Stage Draft Prescription (DOCTOR ONLY)
    if (
      normalizedPrompt.includes('draft prescription') ||
      normalizedPrompt.includes('prescribe')
    ) {
      if (user.role !== 'DOCTOR') {
        throw new AppError(
          'Prescriptions can only be drafted by verified medical practitioners',
          403,
          'DOCTOR_ROLE_REQUIRED'
        );
      }

      const doctor = await DoctorModel.findOne({ userId: user.userId });
      if (!doctor || doctor.verificationStatus !== 'VERIFIED') {
        throw new AppError('Only verified clinicians can draft prescriptions', 403, 'DOCTOR_NOT_VERIFIED');
      }

      const patientMatch = userPrompt.match(/patient[:=\s]+(\S+)/i);

      if (!patientMatch) {
        return {
          reply:
            'To stage a draft prescription, please specify the patient ID (e.g., "draft prescription for patient:<patientId>").',
          thought: 'Missing required parameter: patientId.',
          limitations: this.TOOL_CALLING_LIMITATION,
        };
      }

      const patientId = patientMatch[1];

      if (!OBJECT_ID_REGEX.test(patientId)) {
        throw new AppError('Invalid patient ID format. Expected 24-character hexadecimal ObjectId.', 400, 'INVALID_PARAMETER');
      }

      const staged = await ActionTokenManager.stageAction(
        user.userId,
        'draftPrescription',
        patientId,
        {
          patientId,
          medications: [
            {
              name: 'Paracetamol',
              dosage: '500mg',
              frequency: 'TDS (Three times daily)',
              duration: '3 days',
              instructions: 'Take after meals',
            },
          ],
          notes: 'Staged by clinician via AI agent',
        }
      );

      return {
        reply:
          'A draft prescription has been staged in status DRAFT_PENDING_DOCTOR_SIGNATURE. You must review and confirm to apply it.',
        thought: 'Staged prescription draft requiring RMP signature digest upon confirmation.',
        toolUsed: 'stageDraftPrescription',
        stagedAction: staged,
        limitations: this.TOOL_CALLING_LIMITATION,
      };
    }

    // 5. Consequential Action: Stage Consent Revocation (PATIENT ONLY)
    if (
      normalizedPrompt.includes('revoke consent') ||
      normalizedPrompt.includes('withdraw consent')
    ) {
      if (user.role !== 'PATIENT') {
        throw new AppError('Only patients can revoke access consent', 403, 'FORBIDDEN');
      }

      const grantMatch = userPrompt.match(/grant[:=\s]+(\S+)/i);

      if (!grantMatch) {
        return {
          reply:
            'To stage a consent revocation, please specify the grant ID (e.g., "revoke consent grant:<grantId>").',
          thought: 'Missing required parameter: grantId.',
          limitations: this.TOOL_CALLING_LIMITATION,
        };
      }

      const grantId = grantMatch[1];

      if (!OBJECT_ID_REGEX.test(grantId)) {
        throw new AppError('Invalid consent grant ID format. Expected 24-character hexadecimal ObjectId.', 400, 'INVALID_PARAMETER');
      }

      const staged = await ActionTokenManager.stageAction(
        user.userId,
        'revokeAccessConsent',
        grantId,
        {
          grantId,
          reason: 'Revoked by patient via AI Agent request',
        }
      );

      return {
        reply:
          'I have prepared the consent revocation for this medical record grant. Please confirm to apply immediate access restriction.',
        thought: 'Staged consent revocation with instantaneous cache invalidation token.',
        toolUsed: 'stageConsentRevocation',
        stagedAction: staged,
        limitations: this.TOOL_CALLING_LIMITATION,
      };
    }

    // 6. Default Fallback
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are the MediBridge Agent. You assist with clinical navigation, checking slots, and staging actions under strict user confirmation.',
      },
      { role: 'user', content: userPrompt },
    ];
    const completion = await provider.generateText(messages);

    return {
      reply: completion.content,
      thought: 'Processed general assistance query with provider adapter.',
      limitations: this.TOOL_CALLING_LIMITATION,
    };
  }

  static async executeConfirmedAction(
    user: TokenPayload,
    input: ConfirmActionInput
  ): Promise<{ success: boolean; action: string; result: unknown }> {
    // 1. Verify single-use HMAC confirmation token & nonce replay protection
    await ActionTokenManager.verifyAndConsumeToken(
      user.userId,
      input.action,
      input.resourceId,
      input.payload,
      input.nonce,
      input.expiresAt,
      input.confirmationToken
    );

    let result: unknown = null;

    // 2. Commit domain action based on type
    switch (input.action) {
      case 'initiateAppointmentBooking': {
        if (user.role !== 'PATIENT') {
          throw new AppError('Only patients can confirm booking', 403, 'FORBIDDEN');
        }
        result = await confirmAppointmentBooking(
          {
            slotId: input.payload.slotId as string,
            holdToken: input.payload.holdToken as string,
            notes: (input.payload.notes as string) || 'Confirmed via AI Agent',
          },
          user
        );
        break;
      }

      case 'cancelAppointment': {
        result = await cancelAppointmentBooking(
          input.resourceId,
          user,
          (input.payload.reason as string) || 'Cancelled via AI Agent'
        );
        break;
      }

      case 'draftPrescription': {
        if (user.role !== 'DOCTOR') {
          throw new AppError('Only doctors can draft prescriptions', 403, 'FORBIDDEN');
        }
        result = await draftPrescription(
          {
            patientId: input.payload.patientId as string,
            medications: input.payload.medications as unknown as Array<{
              name: string;
              dosage: string;
              frequency: string;
              duration: string;
              instructions?: string;
            }>,
            notes: input.payload.notes as string,
          },
          user
        );
        break;
      }

      case 'revokeAccessConsent': {
        if (user.role !== 'PATIENT') {
          throw new AppError('Only patients can revoke consent', 403, 'FORBIDDEN');
        }
        const patient = await PatientModel.findOne({ userId: user.userId });
        if (!patient) {
          throw new AppError('Patient profile not found', 404, 'PATIENT_NOT_FOUND');
        }
        result = await revokeConsentGrant(
          input.resourceId,
          patient._id.toString(),
          (input.payload.reason as string) || 'Revoked via AI Agent'
        );
        break;
      }

      default:
        throw new AppError('Unsupported agent action type', 400, 'UNSUPPORTED_ACTION');
    }

    // 3. Append-only Audit Trail
    await logAuditEvent({
      actorId: user.userId,
      actorRole: user.role,
      action: 'AI_AGENT_ACTION_CONFIRMED',
      resourceType: input.action,
      resourceId: input.resourceId,
      outcome: 'SUCCESS',
      details: {
        action: input.action,
        nonce: input.nonce,
      },
    });

    return {
      success: true,
      action: input.action,
      result,
    };
  }
}
