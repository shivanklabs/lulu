import { BadgeCheck, CalendarCheck2, CircleSlash, Clock3, UserX, XCircle } from 'lucide-react';
import type { AppointmentStatus, VerificationStatus } from '../../lib/types';
import { STATUS_LABEL, VERIFICATION_LABEL } from '../../lib/format';

const STATUS_TONE: Record<AppointmentStatus, string> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  SCHEDULED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'danger',
};

const STATUS_ICON: Record<AppointmentStatus, typeof Clock3> = {
  PENDING: Clock3,
  CONFIRMED: CalendarCheck2,
  SCHEDULED: CalendarCheck2,
  COMPLETED: BadgeCheck,
  CANCELLED: XCircle,
  NO_SHOW: UserX,
};

// Status is always shown as icon + text, never colour alone
export const StatusBadge = ({ status }: { status: AppointmentStatus }) => {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`badge badge-${STATUS_TONE[status]}`}>
      <Icon size={14} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
};

const VERIFY_TONE: Record<VerificationStatus, string> = {
  PENDING: 'warning',
  VERIFIED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'neutral',
};

export const VerificationBadge = ({ status }: { status: VerificationStatus }) => (
  <span className={`badge badge-${VERIFY_TONE[status]}`}>
    {status === 'VERIFIED' ? <BadgeCheck size={14} aria-hidden="true" /> : status === 'PENDING' ? <Clock3 size={14} aria-hidden="true" /> : <CircleSlash size={14} aria-hidden="true" />}
    {VERIFICATION_LABEL[status]}
  </span>
);

export const Tag = ({ children }: { children: string }) => <span className="tag">{children}</span>;
