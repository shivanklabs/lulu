import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { requireVerifiedDoctor } from '../doctors/verification.guard';
import {
  draftPrescriptionHandler,
  signPrescriptionHandler,
  getPrescriptionHandler,
  listMyPrescriptionsHandler,
  getUsageGuideHandler,
  checkConflictsHandler,
} from './prescription.controller';

export const prescriptionRouter = Router();

prescriptionRouter.use(authenticate);

prescriptionRouter.post('/draft', requireRole('DOCTOR'), requireVerifiedDoctor, draftPrescriptionHandler);
prescriptionRouter.post('/check-conflicts', checkConflictsHandler);
prescriptionRouter.post('/:id/sign', requireRole('DOCTOR'), requireVerifiedDoctor, signPrescriptionHandler);
prescriptionRouter.get('/my-prescriptions', requireRole('PATIENT'), listMyPrescriptionsHandler);
prescriptionRouter.get('/:id/usage-guide', getUsageGuideHandler);
prescriptionRouter.get('/:id', getPrescriptionHandler);
