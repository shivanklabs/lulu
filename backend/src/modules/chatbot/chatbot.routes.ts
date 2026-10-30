import { Router } from 'express';
import { ChatbotController } from './chatbot.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { aiRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.use(aiRateLimiter);
// Informational Chatbot Endpoint (Zero DB mutations, mandatory clinical disclaimer)
router.post('/message', authenticate, ChatbotController.handleMessage);

export const chatbotRoutes = router;
