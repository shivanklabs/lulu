import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { requireVerifiedDoctor } from '../doctors/verification.guard';
import {
  createSlotsHandler,
  getDoctorSlotsHandler,
  holdSlotHandler,
  confirmBookingHandler,
  cancelBookingHandler,
  listMyAppointmentsHandler,
  getDoctorOpdQueueHandler,
  getMyLiveQueueStatusHandler,
  broadcastDoctorDelayHandler,
  joinWaitlistHandler,
  getMyWaitlistsHandler,
} from './appointment.controller';

export const appointmentRouter = Router();

// Public / Authenticated slot browsing & queue info
appointmentRouter.get('/doctors/:doctorId/slots', getDoctorSlotsHandler);
appointmentRouter.get('/opd-queue/doctor/:doctorId', getDoctorOpdQueueHandler);

appointmentRouter.use(authenticate);

// Doctor publishes slots & broadcasts delays
appointmentRouter.post('/slots', requireRole('DOCTOR'), requireVerifiedDoctor, createSlotsHandler);
appointmentRouter.post('/opd-queue/broadcast-delay', requireRole('DOCTOR'), broadcastDoctorDelayHandler);

// Patient two-phase hold & confirmation
appointmentRouter.post('/slots/:slotId/hold', requireRole('PATIENT'), holdSlotHandler);
appointmentRouter.post('/hold', requireRole('PATIENT'), (req, res, next) => {
  if (req.body?.slotId) req.params.slotId = req.body.slotId;
  return holdSlotHandler(req, res, next);
});
appointmentRouter.post('/confirm', requireRole('PATIENT'), confirmBookingHandler);

// Live OPD Queue tracking for patient
appointmentRouter.get('/opd-queue/my-status', requireRole('PATIENT'), getMyLiveQueueStatusHandler);

// Smart Waitlist
appointmentRouter.post('/waitlist', requireRole('PATIENT'), joinWaitlistHandler);
appointmentRouter.get('/waitlist/my-entries', requireRole('PATIENT'), getMyWaitlistsHandler);

// Appointment lifecycle
appointmentRouter.post('/:id/cancel', cancelBookingHandler);
appointmentRouter.get('/my-appointments', listMyAppointmentsHandler);
