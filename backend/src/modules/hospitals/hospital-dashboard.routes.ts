import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  getHospitalOverviewHandler,
  getTopDoctorsHandler,
  getStaffRosterHandler,
  addStaffMemberHandler,
  updateStaffShiftStatusHandler,
} from './hospital-dashboard.controller';

export const hospitalDashboardRouter = Router();

// Hospital operations require authenticated session
hospitalDashboardRouter.use(authenticate);

hospitalDashboardRouter.get('/overview', getHospitalOverviewHandler);
hospitalDashboardRouter.get('/top-doctors', getTopDoctorsHandler);
hospitalDashboardRouter.get('/staff', getStaffRosterHandler);
hospitalDashboardRouter.post('/staff', requireRole('HOSPITAL', 'ADMIN'), addStaffMemberHandler);
hospitalDashboardRouter.patch('/staff/:id/shift', requireRole('HOSPITAL', 'ADMIN'), updateStaffShiftStatusHandler);
