import type { AppointmentStatus, ConsultationMode, Role, VerificationStatus } from './types';

// Appointment dates/times come from the API as IST wall-clock 'YYYY-MM-DD' / 'HH:mm'
export const formatDate = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

export const formatTime = (time: string): string => {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
};

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export const formatFee = (amount: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

// Today's date in India (bookings and schedules are in IST)
export const todayIst = (): string => {
  const shifted = new Date(Date.now() + 330 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
};

export const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'Awaiting confirmation',
  CONFIRMED: 'Confirmed',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'Missed',
};

export const MODE_LABEL: Record<ConsultationMode, string> = {
  IN_PERSON: 'In person',
  VIDEO: 'Video',
};

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  PENDING: 'Pending review',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};

export const ROLE_LABEL: Record<Role, string> = {
  PATIENT: 'Patient',
  DOCTOR: 'Doctor',
  HOSPITAL: 'Hospital admin',
  ADMIN: 'Platform admin',
};

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const initials = (name: string): string =>
  name
    .replace(/^dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

export const doctorName = (name: string): string => (/^dr\.?\s/i.test(name) ? name : `Dr. ${name}`);

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
