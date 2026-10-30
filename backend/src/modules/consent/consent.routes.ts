import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  grantConsentHandler,
  revokeConsentHandler,
  getMyConsentsHandler,
  breakGlassEmergencyHandler,
} from './consent.controller';

export const consentRouter = Router();

consentRouter.use(authenticate);
consentRouter.post('/break-glass', requireRole('DOCTOR'), breakGlassEmergencyHandler);
consentRouter.post('/', requireRole('PATIENT'), grantConsentHandler);
consentRouter.post('/:id/revoke', requireRole('PATIENT'), revokeConsentHandler);
consentRouter.get('/my-grants', requireRole('PATIENT'), getMyConsentsHandler);
