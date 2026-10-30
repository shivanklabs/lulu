import { scrubExifMetadata } from '../../lib/exif-scrubber';
import { AIProviderFactory } from '../../integrations/ai/ai.factory';
import {
  VisualTriageResult,
  MANDATORY_CLINICAL_DISCLAIMER,
} from '../../integrations/gemini-multimodal.adapter';
import { logAuditEvent } from '../audit/audit.service';
import { TokenPayload } from '../../lib/crypto';
import { AppError } from '../../middleware/errorHandler';

export interface SkinScreeningInput {
  fileBuffer: Buffer;
  mimeType: string;
  symptoms?: string;
  patientId?: string;
}

export class SkinDiseasePhotoService {
  /**
   * Evaluates patient uploaded skin lesion/rash photos.
   * Enforces zero database mutations (informational decision-support only).
   * Strips all EXIF/GPS metadata before AI processing.
   */
  static async screenPhoto(
    input: SkinScreeningInput,
    actor?: TokenPayload
  ): Promise<VisualTriageResult> {
    if (!input.fileBuffer || input.fileBuffer.length === 0) {
      throw new AppError('Image file buffer is empty or missing', 400, 'BAD_REQUEST');
    }

    // 1. Strip EXIF & Geolocation metadata
    const sanitizedBuffer = scrubExifMetadata(input.fileBuffer);

    // 2. Call Gemini Multimodal Adapter
    const multimodal = AIProviderFactory.getMultimodalAdapter();
    const result = await multimodal.screenSkinOrWound(
      sanitizedBuffer,
      input.mimeType || 'image/jpeg',
      input.symptoms
    );

    // 3. Audit Logging (Zero DB mutation of patient records; audit log only)
    if (actor) {
      await logAuditEvent({
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'PHI_READ',
        resourceType: 'SkinScreening',
        patientId: input.patientId,
        outcome: 'SUCCESS',
        details: {
          suspectedCategory: result.suspectedCategory,
          recommendedSpecialist: result.recommendedSpecialist,
          urgency: result.urgency,
          isEmergency: result.isEmergency,
        },
      });
    }

    return {
      ...result,
      disclaimer: MANDATORY_CLINICAL_DISCLAIMER,
    };
  }
}
