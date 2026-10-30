// India Standard Time helpers. IST is a fixed UTC+05:30 offset with no daylight saving,
// so plain arithmetic is exact. Dates are 'YYYY-MM-DD', times are 'HH:mm' (wall clock in IST).
const IST_OFFSET_MS = 330 * 60 * 1000;

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const pad = (n: number): string => n.toString().padStart(2, '0');

export const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export const minutesToTime = (minutes: number): string => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

// Wall-clock IST date + time → absolute instant
export const istToUtc = (date: string, time: string): Date => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS);
};

// Absolute instant → IST calendar date
export const utcToIstDate = (instant: Date): string => {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
};

export const utcToIstTime = (instant: Date): string => {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
};

export const todayIst = (now: Date = new Date()): string => utcToIstDate(now);

// 0 = Sunday … 6 = Saturday
export const istWeekday = (date: string): number => {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
};

export const isValidCalendarDate = (date: string): boolean => {
  if (!DATE_RE.test(date)) return false;
  const [y, mo, d] = date.split('-').map(Number);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
};

// [start, end) of an IST calendar day as absolute instants
export const istDayRange = (date: string): { start: Date; end: Date } => {
  const start = istToUtc(date, '00:00');
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

// [start, end) of the IST week (Monday 00:00 → next Monday 00:00) containing `now`
export const istWeekRange = (now: Date = new Date()): { start: Date; end: Date } => {
  const today = todayIst(now);
  const weekday = istWeekday(today);
  const daysSinceMonday = (weekday + 6) % 7;
  const { start: todayStart } = istDayRange(today);
  const start = new Date(todayStart.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  return { start, end: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) };
};

export const addDaysIst = (date: string, days: number): string => {
  const [y, mo, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
};
