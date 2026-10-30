import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ChatbotService } from './chatbot.service';

const chatMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message cannot exceed 2000 characters'),
  history: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().max(2000),
      })
    )
    .optional()
    .default([]),
});

export class ChatbotController {
  static async handleMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { message, history } = chatMessageSchema.parse(req.body);
      const result = await ChatbotService.processMessage(message, history);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
