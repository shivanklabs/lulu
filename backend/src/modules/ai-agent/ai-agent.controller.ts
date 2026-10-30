import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AIAgentService } from './ai-agent.service';
import { AppError } from '../../middleware/errorHandler';

const promptSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty').max(2000, 'Prompt cannot exceed 2000 characters'),
});

const confirmActionSchema = z.object({
  action: z.enum([
    'initiateAppointmentBooking',
    'cancelAppointment',
    'draftPrescription',
    'revokeAccessConsent',
  ]),
  resourceId: z.string().min(1, 'Resource ID is required'),
  payload: z.record(z.unknown()),
  nonce: z.string().min(16, 'Invalid nonce'),
  expiresAt: z.string().datetime(),
  confirmationToken: z.string().length(64, 'Invalid HMAC confirmation token format'),
});

export class AIAgentController {
  static async handleAgentTurn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const { prompt } = promptSchema.parse(req.body);
      const result = await AIAgentService.processAgentTurn(req.user, prompt);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async handleConfirmAction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const input = confirmActionSchema.parse(req.body);
      const result = await AIAgentService.executeConfirmedAction(req.user, input);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async handleCompanionAssist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, channel } = req.body;
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new AppError('Query text or voice transcript is required', 400, 'INVALID_INPUT');
      }

      const { VoiceRemedyBookingService } = await import('./voice-remedy-booking.service');
      const result = await VoiceRemedyBookingService.assistCompanion(query, req.user, channel);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
