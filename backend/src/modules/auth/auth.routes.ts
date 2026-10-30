import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  meHandler,
  complianceInfoHandler,
  acceptInviteHandler,
} from './auth.controller';
import { authRateLimiter } from '../../middleware/rateLimiter';
import { authenticate } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate';
import { registerSchema, loginSchema, acceptInviteSchema, refreshSchema } from './auth.schemas';

export const authRouter = Router();

authRouter.get('/compliance-info', complianceInfoHandler);
// Session reads are not credential attempts, so they sit outside the strict auth limiter
authRouter.get('/me', authenticate, meHandler);
authRouter.use(authRateLimiter);
authRouter.post('/register', validateBody(registerSchema), registerHandler);
authRouter.post('/login', validateBody(loginSchema), loginHandler);
authRouter.post('/accept-invite', validateBody(acceptInviteSchema), acceptInviteHandler);
authRouter.post('/refresh', validateBody(refreshSchema), refreshHandler);
