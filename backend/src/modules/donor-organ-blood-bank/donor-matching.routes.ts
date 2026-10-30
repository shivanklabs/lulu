import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  getDonorInventoryHandler,
  searchCompatibleDonorsHandler,
  requestAllocationHandler,
} from './donor-matching.controller';

export const donorBankRouter = Router();

donorBankRouter.get('/inventory', getDonorInventoryHandler);
donorBankRouter.get('/search-donors', searchCompatibleDonorsHandler);
donorBankRouter.post(
  '/request-allocation',
  authenticate,
  requireRole('DOCTOR', 'ADMIN'),
  requestAllocationHandler
);
