import crypto from 'crypto';
import { env } from '../../config/env';
import { AgentActionNonceModel } from './action-nonce.model';
import { AppError } from '../../middleware/errorHandler';

export interface StagedActionPayload {
  action: 'initiateAppointmentBooking' | 'cancelAppointment' | 'draftPrescription' | 'revokeAccessConsent';
  resourceId: string;
  payload: Record<string, unknown>;
  nonce: string;
  expiresAt: string;
  confirmationToken: string;
}

export class ActionTokenManager {
  private static computePayloadHash(payload: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private static computeSignature(
    userId: string,
    action: string,
    resourceId: string,
    payloadHash: string,
    nonce: string,
    expiresAt: number
  ): string {
    const raw = `${userId}:${action}:${resourceId}:${payloadHash}:${nonce}:${expiresAt}`;
    return crypto.createHmac('sha256', env.ACTION_TOKEN_SECRET).update(raw).digest('hex');
  }

  static async stageAction(
    userId: string,
    action: StagedActionPayload['action'],
    resourceId: string,
    payload: Record<string, unknown>
  ): Promise<StagedActionPayload> {
    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAtMs = Date.now() + 5 * 60 * 1000; // 5-minute validity
    const expiresAt = new Date(expiresAtMs);
    const payloadHash = this.computePayloadHash(payload);

    const confirmationToken = this.computeSignature(
      userId,
      action,
      resourceId,
      payloadHash,
      nonce,
      expiresAtMs
    );

    // Persist single-use nonce
    await AgentActionNonceModel.create({
      nonce,
      userId,
      action,
      expiresAt,
      used: false,
    });

    return {
      action,
      resourceId,
      payload,
      nonce,
      expiresAt: expiresAt.toISOString(),
      confirmationToken,
    };
  }

  static async verifyAndConsumeToken(
    userId: string,
    action: string,
    resourceId: string,
    payload: Record<string, unknown>,
    nonce: string,
    expiresAtIso: string,
    providedToken: string
  ): Promise<void> {
    const expiresAtMs = new Date(expiresAtIso).getTime();
    if (Date.now() > expiresAtMs) {
      throw new AppError('Confirmation token has expired (5-minute window exceeded)', 400, 'TOKEN_EXPIRED');
    }

    const payloadHash = this.computePayloadHash(payload);
    const expectedToken = this.computeSignature(
      userId,
      action,
      resourceId,
      payloadHash,
      nonce,
      expiresAtMs
    );

    // Constant-time comparison
    const expectedBuf = Buffer.from(expectedToken, 'hex');
    const providedBuf = Buffer.from(providedToken, 'hex');

    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      throw new AppError('Invalid confirmation token signature', 403, 'INVALID_CONFIRMATION_TOKEN');
    }

    // Atomic single-use consume
    const consumed = await AgentActionNonceModel.findOneAndUpdate(
      {
        nonce,
        userId,
        action,
        used: false,
        expiresAt: { $gt: new Date() },
      },
      { used: true }
    );

    if (!consumed) {
      throw new AppError(
        'Confirmation token has already been used or was revoked (replay attack prevented)',
        409,
        'TOKEN_ALREADY_USED'
      );
    }
  }
}
