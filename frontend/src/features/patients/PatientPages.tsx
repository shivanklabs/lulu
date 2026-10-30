import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CalendarCheck2, CalendarPlus, CheckCircle2, Clock3, Hospital, MapPin, Stethoscope, Video } from 'lucide-react';
import { api } from '../../lib/api';
import { doctorName, formatDate, formatTime, MODE_LABEL } from '../../lib/format';
import type { PatientAppointment } from '../../lib/types';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useAuth } from '../../auth/useAuth';
import { PageHeader, StatCard } from '../../components/dashboard/DashboardLayout';
import { Button, LinkButton } from '../../components/ui/Button';
import { LoadError, SuccessMessage } from '../../components/ui/Feedback';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { StatusBadge } from '../../components/ui/Badges';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const AppointmentItem = ({ apt, onCancel }: { apt: PatientAppointment; onCancel?: (apt: PatientAppointment) => void }) => (
  <li className="card appointment">
    <div className="appointment-when">
      <span className="appointment-date">{formatDate(apt.date)}</span>
      <span className="appointment-time">
        {formatTime(apt.startTime)} – {formatTime(apt.endTime)}
      </span>
    </div>
    <div className="appointment-body">
      <div className="appointment-top">
        <p className="card-title">{apt.doctor ? doctorName(apt.doctor.name) : 'Doctor unavailable'}</p>
        <StatusBadge status={apt.status} />
      </div>
      <p className="icon-line muted">
        <Stethoscope size={16} aria-hidden="true" /> {apt.doctor?.specialization ?? '—'}
      </p>
      <p className="icon-line muted">
        <Hospital size={16} aria-hidden="true" /> {apt.hospital?.name ?? '—'}
      </p>
      {apt.hospital?.address && (
        <p className="icon-line muted small">
          <MapPin size={16} aria-hidden="true" /> {apt.hospital.address}
        </p>
      )}
      <p className="icon-line muted small">
        {apt.mode === 'VIDEO' ? <Video size={16} aria-hidden="true" /> : <CalendarCheck2 size={16} aria-hidden="true" />} {MODE_LABEL[apt.mode]}
      </p>
      {apt.reason && <p className="small">Reason: {apt.reason}</p>}
      {apt.status === 'CANCELLED' && apt.cancellationReason && <p className="small muted">Cancellation note: {apt.cancellationReason}</p>}
    </div>
    {onCancel && apt.allowedActions.includes('cancel') && (
      <div className="appointment-actions">
        <Button variant="secondary" size="sm" onClick={() => onCancel(apt)}>
          Cancel
        </Button>
      </div>
    )}
  </li>
);

const useCancel = (onDone: () => void) => {
  const [target, setTarget] = useState<PatientAppointment | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const dialog = (
    <ConfirmDialog
      open={target !== null}
      title="Cancel this appointment?"
      danger
      confirmLabel="Cancel appointment"
      message={
        target && (
          <p>
            {target.doctor ? doctorName(target.doctor.name) : 'Appointment'} on {formatDate(target.date)} at {formatTime(target.startTime)}. The
            time slot will be released for other patients.
          </p>
        )
      }
      reason={{ label: 'Reason (optional)', maxLength: 200 }}
      onClose={() => setTarget(null)}
      onConfirm={async (reason) => {
        if (!target) return;
        const updated = await api.patient.cancel(target.id, reason || undefined);
        setDone(`Your appointment on ${formatDate(updated.date)} at ${formatTime(updated.startTime)} was cancelled.`);
        onDone();
      }}
    />
  );
  return { open: setTarget, dialog, done, clearDone: () => setDone(null) };
};

export const PatientOverviewPage = () => {
  useDocumentTitle('My dashboard');
  const { user } = useAuth();
  const location = useLocation();
  const welcome = (location.state as { welcome?: boolean } | null)?.welcome;
  const summary = useApi(api.patient.summary, 'patient-summary');
  const upcoming = useApi(() => api.patient.appointments('upcoming', 1, 5), 'patient-upcoming-preview');
  const cancel = useCancel(() => {
    summary.reload();
    upcoming.reload();
  });

  return (
    <>
      <PageHeader
        title={`Hello${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        description="Your appointments at a glance."
        actions={
          <LinkButton to="/book">
            <CalendarPlus size={18} aria-hidden="true" /> Book appointment
          </LinkButton>
        }
      />
      {welcome && <SuccessMessage title="Account created">Welcome to MediBridge. You can now book your first appointment.</SuccessMessage>}
      {cancel.done && <SuccessMessage>{cancel.done}</SuccessMessage>}

      {summary.error && <LoadError error={summary.error} onRetry={summary.reload} />}
      <div className="grid grid-3 stats">
        <StatCard label="Confirmed upcoming" value={summary.data?.upcoming ?? '–'} icon={CalendarCheck2} />
        <StatCard label="Awaiting confirmation" value={summary.data?.pending ?? '–'} icon={Clock3} />
        <StatCard label="Completed visits" value={summary.data?.completed ?? '–'} icon={CheckCircle2} />
      </div>

      <div className="section-head compact">
        <h2 className="section-title">Upcoming appointments</h2>
        <LinkButton to="/patient/appointments" variant="ghost" size="sm">
          View all
        </LinkButton>
      </div>
      {upcoming.loading && <Spinner label="Loading appointments…" block />}
      {upcoming.error && <LoadError error={upcoming.error} onRetry={upcoming.reload} />}
      {upcoming.data && upcoming.data.items.length === 0 && (
        <EmptyState title="No upcoming appointments" message="When you book a consultation it will appear here." action={{ label: 'Book an appointment', to: '/book' }} />
      )}
      {upcoming.data && upcoming.data.items.length > 0 && (
        <ul className="appointment-list">
          {upcoming.data.items.map((a) => (
            <AppointmentItem key={a.id} apt={a} onCancel={cancel.open} />
          ))}
        </ul>
      )}
      {cancel.dialog}
    </>
  );
};

export const PatientAppointmentsPage = () => {
  useDocumentTitle('My appointments');
  const [scope, setScope] = useState<'upcoming' | 'history'>('upcoming');
  const [page, setPage] = useState(1);
  const list = useApi(() => api.patient.appointments(scope, page, 10), `patient-apts:${scope}:${page}`);
  const cancel = useCancel(() => list.reload());

  const switchScope = (next: 'upcoming' | 'history') => {
    setScope(next);
    setPage(1);
    cancel.clearDone();
  };

  return (
    <>
      <PageHeader
        title="My appointments"
        actions={
          <LinkButton to="/book">
            <CalendarPlus size={18} aria-hidden="true" /> Book appointment
          </LinkButton>
        }
      />
      <div className="tabs" role="tablist" aria-label="Appointment lists">
        {(['upcoming', 'history'] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={scope === s} className={`tab${scope === s ? ' tab-active' : ''}`} onClick={() => switchScope(s)}>
            {s === 'upcoming' ? 'Upcoming' : 'Past & cancelled'}
          </button>
        ))}
      </div>
      {cancel.done && <SuccessMessage>{cancel.done}</SuccessMessage>}
      {list.loading && <Spinner label="Loading appointments…" block />}
      {list.error && <LoadError error={list.error} onRetry={list.reload} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          title={scope === 'upcoming' ? 'No upcoming appointments' : 'No past appointments yet'}
          action={scope === 'upcoming' ? { label: 'Book an appointment', to: '/book' } : undefined}
        />
      )}
      {list.data && list.data.items.length > 0 && (
        <>
          <ul className="appointment-list">
            {list.data.items.map((a) => (
              <AppointmentItem key={a.id} apt={a} onCancel={scope === 'upcoming' ? cancel.open : undefined} />
            ))}
          </ul>
          <Pagination page={list.data.pagination.page} totalPages={list.data.pagination.totalPages} onChange={setPage} disabled={list.loading} />
        </>
      )}
      {cancel.dialog}
    </>
  );
};
