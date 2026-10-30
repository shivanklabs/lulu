import { useState } from 'react';
import { CalendarClock, CalendarDays, Clock3, Phone } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, formatTime, MODE_LABEL } from '../../lib/format';
import type { AppointmentAction, DoctorAppointment } from '../../lib/types';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { PageHeader, StatCard } from '../../components/dashboard/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { InfoMessage, LoadError, SuccessMessage } from '../../components/ui/Feedback';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { StatusBadge } from '../../components/ui/Badges';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

type Scope = 'today' | 'pending' | 'upcoming' | 'history';

const ACTION_COPY: Record<AppointmentAction, { label: string; title: string; done: string; danger?: boolean; needsReason?: boolean; variant: 'primary' | 'secondary' | 'danger' }> = {
  confirm: { label: 'Confirm', title: 'Confirm this appointment?', done: 'Appointment confirmed.', variant: 'primary' },
  decline: { label: 'Decline', title: 'Decline this request?', done: 'Request declined.', danger: true, needsReason: true, variant: 'secondary' },
  cancel: { label: 'Cancel', title: 'Cancel this appointment?', done: 'Appointment cancelled.', danger: true, needsReason: true, variant: 'secondary' },
  complete: { label: 'Mark completed', title: 'Mark as completed?', done: 'Marked as completed.', variant: 'primary' },
  no_show: { label: 'Mark missed', title: 'Mark as missed?', done: 'Marked as missed.', danger: true, variant: 'secondary' },
};

const ACTION_ORDER: AppointmentAction[] = ['confirm', 'complete', 'decline', 'no_show', 'cancel'];

const useDoctorAction = (onDone: () => void) => {
  const [pending, setPending] = useState<{ apt: DoctorAppointment; action: AppointmentAction } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const copy = pending ? ACTION_COPY[pending.action] : null;

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={copy?.title ?? ''}
      confirmLabel={copy?.label ?? 'Confirm'}
      danger={copy?.danger}
      message={
        pending && (
          <p>
            {pending.apt.patient?.name ?? 'Patient'} · {formatDate(pending.apt.date)} at {formatTime(pending.apt.startTime)}
            {pending.action === 'confirm' && '. Confirming gives you access to this patient’s records for the consultation period.'}
          </p>
        )
      }
      reason={copy?.needsReason ? { label: 'Reason for the patient', required: true, minLength: 3, maxLength: 200 } : undefined}
      onClose={() => setPending(null)}
      onConfirm={async (reason) => {
        if (!pending) return;
        await api.doctor.act(pending.apt.id, pending.action, reason || undefined);
        setDone(ACTION_COPY[pending.action].done);
        onDone();
      }}
    />
  );
  return { start: (apt: DoctorAppointment, action: AppointmentAction) => { setDone(null); setPending({ apt, action }); }, dialog, done };
};

const DoctorAppointmentItem = ({ apt, onAction }: { apt: DoctorAppointment; onAction: (apt: DoctorAppointment, a: AppointmentAction) => void }) => (
  <li className="card appointment">
    <div className="appointment-when">
      <span className="appointment-date">{formatDate(apt.date)}</span>
      <span className="appointment-time">
        {formatTime(apt.startTime)} – {formatTime(apt.endTime)}
      </span>
    </div>
    <div className="appointment-body">
      <div className="appointment-top">
        <p className="card-title">{apt.patient?.name ?? 'Patient'}</p>
        <StatusBadge status={apt.status} />
      </div>
      <p className="muted small">{MODE_LABEL[apt.mode]} consultation</p>
      {apt.patient?.phone && (
        <p className="icon-line small">
          <Phone size={16} aria-hidden="true" /> <a href={`tel:${apt.patient.phone.replace(/[^+\d]/g, '')}`}>{apt.patient.phone}</a>
        </p>
      )}
      {apt.reason && <p className="small">Reason: {apt.reason}</p>}
      {apt.status === 'CANCELLED' && apt.cancellationReason && <p className="small muted">Note: {apt.cancellationReason}</p>}
    </div>
    {apt.allowedActions.length > 0 && (
      <div className="appointment-actions">
        {ACTION_ORDER.filter((a) => apt.allowedActions.includes(a)).map((a) => (
          <Button key={a} size="sm" variant={ACTION_COPY[a].variant} onClick={() => onAction(apt, a)}>
            {ACTION_COPY[a].label}
          </Button>
        ))}
      </div>
    )}
  </li>
);

const AppointmentList = ({ scope, page, onPage, onAction, reloadKey }: { scope: Scope; page: number; onPage?: (p: number) => void; onAction: (apt: DoctorAppointment, a: AppointmentAction) => void; reloadKey: number }) => {
  const list = useApi(() => api.doctor.appointments(scope, page, 10), `doctor-apts:${scope}:${page}:${reloadKey}`);
  if (list.loading) return <Spinner label="Loading appointments…" block />;
  if (list.error) return <LoadError error={list.error} onRetry={list.reload} />;
  if (!list.data || list.data.items.length === 0) {
    const titles: Record<Scope, string> = {
      today: 'No appointments today',
      pending: 'No requests waiting for you',
      upcoming: 'No confirmed upcoming appointments',
      history: 'No past appointments yet',
    };
    return <EmptyState title={titles[scope]} />;
  }
  return (
    <>
      <ul className="appointment-list">
        {list.data.items.map((a) => (
          <DoctorAppointmentItem key={a.id} apt={a} onAction={onAction} />
        ))}
      </ul>
      {onPage && <Pagination page={list.data.pagination.page} totalPages={list.data.pagination.totalPages} onChange={onPage} />}
    </>
  );
};

const VerificationNotice = () => {
  const profile = useApi(api.doctor.profile, 'doctor-profile-status');
  if (!profile.data || profile.data.verificationStatus === 'VERIFIED') return null;
  return (
    <InfoMessage title="Your account is not verified yet">
      Patients cannot book you, and you cannot change appointments or your schedule, until your hospital administrator
      verifies your registration.
    </InfoMessage>
  );
};

export const DoctorOverviewPage = () => {
  useDocumentTitle('Doctor dashboard');
  const [reloadKey, setReloadKey] = useState(0);
  const summary = useApi(api.doctor.summary, `doctor-summary:${reloadKey}`);
  const action = useDoctorAction(() => setReloadKey((k) => k + 1));

  return (
    <>
      <PageHeader title="Today" description="Your schedule and requests waiting for a decision." />
      <VerificationNotice />
      {action.done && <SuccessMessage>{action.done}</SuccessMessage>}
      {summary.error && <LoadError error={summary.error} onRetry={summary.reload} />}
      <div className="grid grid-3 stats">
        <StatCard label="Appointments today" value={summary.data?.today ?? '–'} icon={CalendarDays} />
        <StatCard label="Requests to review" value={summary.data?.pending ?? '–'} icon={Clock3} />
        <StatCard label="Confirmed upcoming" value={summary.data?.upcoming ?? '–'} icon={CalendarClock} />
      </div>
      <h2 className="section-title">Requests to review</h2>
      <AppointmentList scope="pending" page={1} onAction={action.start} reloadKey={reloadKey} />
      <h2 className="section-title">Today’s appointments</h2>
      <AppointmentList scope="today" page={1} onAction={action.start} reloadKey={reloadKey} />
      {action.dialog}
    </>
  );
};

const TABS: Array<{ scope: Scope; label: string }> = [
  { scope: 'pending', label: 'Requests' },
  { scope: 'today', label: 'Today' },
  { scope: 'upcoming', label: 'Upcoming' },
  { scope: 'history', label: 'Past' },
];

export const DoctorAppointmentsPage = () => {
  useDocumentTitle('Appointments');
  const [scope, setScope] = useState<Scope>('pending');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const action = useDoctorAction(() => setReloadKey((k) => k + 1));

  return (
    <>
      <PageHeader title="Appointments" />
      <VerificationNotice />
      <div className="tabs" role="tablist" aria-label="Appointment lists">
        {TABS.map((t) => (
          <button
            key={t.scope}
            type="button"
            role="tab"
            aria-selected={scope === t.scope}
            className={`tab${scope === t.scope ? ' tab-active' : ''}`}
            onClick={() => {
              setScope(t.scope);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {action.done && <SuccessMessage>{action.done}</SuccessMessage>}
      <AppointmentList scope={scope} page={page} onPage={setPage} onAction={action.start} reloadKey={reloadKey} />
      {action.dialog}
    </>
  );
};
