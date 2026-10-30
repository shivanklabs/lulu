import { ChatMessage, AICompletionOptions, AICompletionResult, IAIProviderAdapter } from './ai.types';

export class MockAIAdapter implements IAIProviderAdapter {
  readonly name = 'mock';
  readonly model = 'mock-model-v1';

  async generateText(
    messages: ChatMessage[],
    _options?: AICompletionOptions
  ): Promise<AICompletionResult> {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content.toLowerCase() || '';

    let reply = 'I am the MediBridge Informational Assistant. How may I assist you with your clinic navigation or health questions today?';

    if (lastUserMessage.includes('headache') || lastUserMessage.includes('migraine')) {
      reply = 'Frequent or severe headaches can be triggered by stress, dehydration, lack of sleep, or underlying neurological factors. It is recommended to stay hydrated, rest in a quiet dark room, and schedule a consultation with a registered medical practitioner if symptoms persist or worsen.';
    } else if (lastUserMessage.includes('fever') || lastUserMessage.includes('temperature')) {
      reply = 'A fever indicates that your body may be fighting an infection. Monitor your temperature closely, stay hydrated, and consult a doctor immediately if the fever exceeds 102°F (38.9°C) or is accompanied by difficulty breathing.';
    } else if (lastUserMessage.includes('appointment') || lastUserMessage.includes('book') || lastUserMessage.includes('slot')) {
      reply = 'To schedule a consultation, you may select an available slot with your preferred verified specialist and reserve it through our two-phase checkout hold.';
    } else if (lastUserMessage.includes('prescription') || lastUserMessage.includes('medicine')) {
      reply = 'Prescriptions can only be drafted and digitally signed by verified Registered Medical Practitioners (RMPs) following a clinical consultation.';
    }

    return {
      content: reply,
      provider: this.name,
      model: this.model,
      promptTokens: messages.reduce((acc, m) => acc + m.content.length / 4, 0),
      completionTokens: reply.length / 4,
    };
  }

  async generateStructuredResponse<T>(
    messages: ChatMessage[],
    schemaDescription: string,
    options?: AICompletionOptions
  ): Promise<T> {
    const textRes = await this.generateText(messages, options);
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content.toLowerCase() || '';

    // Handle tool call extraction or action decision structured JSON
    if (schemaDescription.includes('toolCall') || lastUserMessage.includes('book') || lastUserMessage.includes('schedule')) {
      return {
        toolName: 'stageAppointmentBooking',
        reasoning: 'Patient expressed intent to book an appointment with Dr. Gregory House.',
        parameters: {
          doctorSpecialty: 'Neurology',
          preferredTime: 'morning',
        },
      } as unknown as T;
    }

    if (lastUserMessage.includes('cancel')) {
      return {
        toolName: 'stageAppointmentCancellation',
        reasoning: 'Patient requested cancellation of their scheduled consultation.',
        parameters: {
          reason: 'Schedule conflict',
        },
      } as unknown as T;
    }

    if (lastUserMessage.includes('revoke') || lastUserMessage.includes('consent')) {
      return {
        toolName: 'stageConsentRevocation',
        reasoning: 'Patient wishes to revoke clinical notes access.',
        parameters: {
          category: 'CLINICAL_NOTES',
        },
      } as unknown as T;
    }

    // Default structured response
    return {
      message: textRes.content,
      isEmergency: lastUserMessage.includes('emergency') || lastUserMessage.includes('chest pain'),
    } as unknown as T;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
