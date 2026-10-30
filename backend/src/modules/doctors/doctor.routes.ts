import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  listVerifiedDoctors,
  getMyDoctorProfile,
  updateDoctorVerification,
  findNearbyDoctorsHandler,
  stageNearbyHoldHandler,
  patientSpecialIdLookupHandler,
} from './doctor.controller';

export const doctorRouter = Router();

doctorRouter.get('/', listVerifiedDoctors);
doctorRouter.get('/nearby/match', findNearbyDoctorsHandler);
doctorRouter.post('/nearby/stage-hold', authenticate, requireRole('PATIENT'), stageNearbyHoldHandler);
doctorRouter.get('/patient-lookup/:specialId', authenticate, requireRole('DOCTOR', 'ADMIN'), patientSpecialIdLookupHandler);
doctorRouter.get('/me', authenticate, requireRole('DOCTOR'), getMyDoctorProfile);
doctorRouter.patch('/:id/verify', authenticate, requireRole('ADMIN'), updateDoctorVerification);
