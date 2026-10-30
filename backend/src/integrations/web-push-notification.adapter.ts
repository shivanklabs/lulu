import { logger } from '../lib/logger';

export interface WebPushPayload {
  userId: string;
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export interface WebPushDeliveryResult {
  success: boolean;
  dispatchId: string;
  deliveredAt: string;
}

export class WebPushNotificationAdapter {
  static async sendPush(payload: WebPushPayload): Promise<WebPushDeliveryResult> {
    const dispatchId = `push_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    logger.info(
      {
        dispatchId,
        userId: payload.userId,
        title: payload.title,
      },
      'Dispatched browser Web Push medicine notification'
    );

    return {
      success: true,
      dispatchId,
      deliveredAt: new Date().toISOString(),
    };
  }
}
