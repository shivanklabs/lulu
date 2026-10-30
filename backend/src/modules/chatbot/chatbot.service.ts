import { AIProviderFactory } from '../../integrations/ai/ai.factory';
import { ChatMessage } from '../../integrations/ai/ai.types';

export const CLINICAL_DISCLAIMER =
  'MediBridge AI Assistant provides informational guidance only and is not a substitute for professional medical judgment, diagnosis, or treatment. In medical emergencies, immediately contact local emergency services.';

export const SYSTEM_TRIAGE_PROMPT = `You are the MediBridge Informational Assistant.
Your duties:
1. Provide clear, empathetic health education, navigation of clinics, and appointment guidance.
2. YOU HAVE ZERO AUTHORITY TO PRESCRIBE MEDICATIONS, DIAGNOSE CONDITIONS, OR ALTER MEDICAL RECORDS.
3. You must NEVER present yourself as a licensed medical practitioner.
4. If a user exhibits emergency symptoms (severe chest pain, shortness of breath, sudden numbness, heavy bleeding, stroke signs), immediately advise them to contact local emergency medical services (e.g. 112 / 911 / local emergency).
5. Always maintain professional empathy and encourage verified clinical consultations.`;

export class ChatbotService {
  /**
   * Minimizes Protected Health Information by redacting phone numbers, emails, and numeric IDs.
   */
  static scrubPII(text: string): string {
    return text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
      .replace(/\b\d{10,12}\b/g, '[REDACTED_ID_OR_PHONE]');
  }

  static async processMessage(
    userMessage: string,
    history: ChatMessage[] = []
  ): Promise<{
    reply: string;
    disclaimer: string;
    provider: string;
    model: string;
    liveAiActive?: boolean;
  }> {
    const scrubbedMessage = this.scrubPII(userMessage);
    const provider = AIProviderFactory.getDefaultProvider();

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_TRIAGE_PROMPT },
      ...history.slice(-6).map((m) => ({
        role: m.role,
        content: this.scrubPII(m.content),
      })),
      { role: 'user', content: scrubbedMessage },
    ];

    try {
      const response = await provider.generateText(messages);
      return {
        reply: response.content,
        disclaimer: CLINICAL_DISCLAIMER,
        provider: response.provider,
        model: response.model,
        liveAiActive: response.provider === 'gemini',
      };
    } catch (err) {
      // Graceful Runtime Fallback: Never crash with 500/503 on live API failure
      console.warn('[ChatbotService] AI provider call failed, falling back to clinical default:', err instanceof Error ? err.message : err);
      return {
        reply:
          'MediBridge Informational Assistant (Clinical Fallback): I provide safe health guidance and clinic navigation. For any persistent symptoms or acute discomfort, please consult a Registered Medical Practitioner or schedule an in-person consultation with our verified doctors.',
        disclaimer: CLINICAL_DISCLAIMER,
        provider: 'fallback',
        model: 'system-fallback',
        liveAiActive: false,
      };
    }
  }
}
