import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  dispatchAmbulanceHandler,
  getMyDispatchesHandler,
  getActiveDispatchesHandler,
  updateDispatchStatusHandler,
  getNearbyAmbulancesHandler,
} from './ambulance-sos.controller';

export const ambulanceSosRouter = Router();

ambulanceSosRouter.get('/nearby', getNearbyAmbulancesHandler);
ambulanceSosRouter.use(authenticate);

ambulanceSosRouter.post('/dispatch', requireRole('PATIENT'), dispatchAmbulanceHandler);
ambulanceSosRouter.get('/my-dispatches', requireRole('PATIENT'), getMyDispatchesHandler);
ambulanceSosRouter.get('/active', requireRole('ADMIN', 'DOCTOR'), getActiveDispatchesHandler);
ambulanceSosRouter.patch('/:id/status', requireRole('ADMIN', 'DOCTOR'), updateDispatchStatusHandler);
