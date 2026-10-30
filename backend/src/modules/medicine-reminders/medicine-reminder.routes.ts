import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  createReminderHandler,
  listMyRemindersHandler,
  toggleReminderHandler,
  triggerDispatchHandler,
  triggerSingleReminderHandler,
} from './medicine-reminder.controller';

export const medicineReminderRouter = Router();

medicineReminderRouter.use(authenticate);

medicineReminderRouter.post('/', createReminderHandler);
medicineReminderRouter.get('/my-reminders', requireRole('PATIENT'), listMyRemindersHandler);
medicineReminderRouter.patch('/:id/status', toggleReminderHandler);
medicineReminderRouter.post('/trigger-dispatch', triggerDispatchHandler);
medicineReminderRouter.post('/:id/trigger-now', triggerSingleReminderHandler);
