import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  createIncognitoHandler,
  unlockVaultHandler,
  updateVaultNotesHandler,
  getDoctorIncognitoHandler,
  listMyIncognitoSessionsHandler,
} from './incognito-consult.controller';

export const incognitoRouter = Router();

incognitoRouter.use(authenticate);

incognitoRouter.post('/', requireRole('PATIENT'), createIncognitoHandler);
incognitoRouter.get('/my-sessions', requireRole('PATIENT'), listMyIncognitoSessionsHandler);
incognitoRouter.post('/:id/unlock', requireRole('PATIENT'), unlockVaultHandler);
incognitoRouter.post('/:id/notes', requireRole('PATIENT'), updateVaultNotesHandler);
incognitoRouter.get('/:id/doctor-view', requireRole('DOCTOR'), getDoctorIncognitoHandler);
