import { logger } from '../lib/logger';

export interface WhatsAppReminderPayload {
  toPhoneNumber: string;
  patientName: string;
  medicineName: string;
  dosage: string;
  timeLabel: string;
  instructions?: string;
  isCheckupFollowUp?: boolean;
}

export interface WhatsAppDeliveryResult {
  success: boolean;
  messageId: string;
  timestamp: string;
  simulated: boolean;
}

export class WhatsAppReminderAdapter {
  static formatMessageText(payload: WhatsAppReminderPayload): string {
    if (payload.isCheckupFollowUp) {
      return `Namaste ${payload.patientName},\nThis is your MediBridge Clinical Care follow-up.\nIt has been 3 days since your teleconsultation. How are you feeling today? If you need a follow-up review with your doctor, you can book via your patient portal.\n(Informational message only • In emergencies dial 112)`;
    }

    return `Namaste ${payload.patientName},\nMedicine Reminder from MediBridge:\nTime to take: ${payload.medicineName} (${payload.dosage})\nScheduled: ${payload.timeLabel}\nInstructions: ${payload.instructions || 'Take as directed by your clinician'}\n\nStay consistent with your treatment for optimal health!`;
  }

  static async sendReminder(payload: WhatsAppReminderPayload): Promise<WhatsAppDeliveryResult> {
    const messageId = `wa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const text = this.formatMessageText(payload);

    // Sanitized logging (Pino will redact sensitive numbers)
    logger.info(
      {
        messageId,
        recipient: payload.toPhoneNumber.slice(-4).padStart(payload.toPhoneNumber.length, '*'),
        medicine: payload.medicineName,
        time: payload.timeLabel,
        preview: text.slice(0, 30),
      },
      'Dispatched WhatsApp patient medicine reminder'
    );

    return {
      success: true,
      messageId,
      timestamp: new Date().toISOString(),
      simulated: true, // Operating in verified webhook / simulation mode
    };
  }
}
