import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { getMyPatientProfile } from './patient.controller';

export const patientRouter = Router();

patientRouter.use(authenticate);
patientRouter.get('/me', requireRole('PATIENT'), getMyPatientProfile);
