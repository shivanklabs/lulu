import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { getOverviewHandler, getAuditLogsHandler } from './admin.controller';

export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(requireRole('ADMIN'));

adminRouter.get('/overview', getOverviewHandler);
adminRouter.get('/audit-logs', getAuditLogsHandler);
