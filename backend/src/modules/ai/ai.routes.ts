import { Router, Request, Response } from 'express';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware';
import { aiRateLimiter } from '../../middleware/rateLimiter';
import { AIAgentController } from '../ai-agent/ai-agent.controller';
import { ChatbotController } from '../chatbot/chatbot.controller';
import { uploadPhotoOcrHandler } from '../medical-records/medical-record.controller';
import { AIProviderFactory } from '../../integrations/ai/ai.factory';

const router = Router();

router.use(aiRateLimiter);

// System AI Status & Mode
router.get('/status', (_req: Request, res: Response) => {
  const status = AIProviderFactory.getAIStatus();
  res.status(200).json({
    success: true,
    data: status,
  });
});

// 1. Voice AI & Gharelu Upay
router.post('/voice-consult', optionalAuthenticate, AIAgentController.handleCompanionAssist);

// 2. Multimodal Prescription & Lab Scanner OCR
router.post('/prescription-ocr', authenticate, uploadPhotoOcrHandler);

// 3. Informational Health Chatbot
router.post('/chatbot/message', ChatbotController.handleMessage);
router.post('/chatbot', ChatbotController.handleMessage);

// 4. Sandboxed AI Agent with 5-Min HMAC Confirmation Token
router.post('/propose', authenticate, AIAgentController.handleAgentTurn);
router.post('/turn', authenticate, AIAgentController.handleAgentTurn);
router.post('/confirm', authenticate, AIAgentController.handleConfirmAction);
router.post('/confirm-action', authenticate, AIAgentController.handleConfirmAction);

export const aiUnifiedRoutes = router;
