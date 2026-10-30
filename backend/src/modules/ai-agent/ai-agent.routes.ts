import { Router } from 'express';
import { AIAgentController } from './ai-agent.controller';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware';
import { aiRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.use(aiRateLimiter);
// AI Agent routes operating under authenticated session (with friendly aliases)
router.post('/turn', authenticate, AIAgentController.handleAgentTurn);
router.post('/propose', authenticate, AIAgentController.handleAgentTurn);
router.post('/confirm-action', authenticate, AIAgentController.handleConfirmAction);
router.post('/confirm', authenticate, AIAgentController.handleConfirmAction);
router.post('/companion-assist', optionalAuthenticate, AIAgentController.handleCompanionAssist);
router.post('/voice-consult', optionalAuthenticate, AIAgentController.handleCompanionAssist);

export const aiAgentRoutes = router;
