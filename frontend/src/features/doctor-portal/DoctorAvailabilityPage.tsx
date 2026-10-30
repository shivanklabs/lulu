import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { formatDate, formatTime, todayIst, WEEKDAYS } from '../../lib/format';
import type { AffectedBooking, DoctorSchedule, WeeklyRule } from '../../lib/types';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { PageHeader } from '../../components/dashboard/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { ErrorMessage, LoadError, SuccessMessage } from '../../components/ui/Feedback';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';

const SLOT_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120];

const affectedOf = (err: unknown): AffectedBooking[] | null => {
  if (!(err instanceof ApiError) || err.code !== 'AFFECTS_BOOKINGS') return null;
  const list = err.details?.affected;
  return Array.isArray(list) ? (list as AffectedBooking[]) : [];
};

const validateRules = (rules: WeeklyRule[]): string | null => {
  for (const r of rules) {
    if (!r.startTime || !r.endTime) return `${WEEKDAYS[r.weekday]}: enter a start and end time.`;
    if (r.startTime >= r.endTime) return `${WEEKDAYS[r.weekday]}: end time must be after start time.`;
  }
  return null;
};

const AffectedDialog = ({ affected, busy, message, onConfirm, onClose }: { affected: AffectedBooking[] | null; busy: boolean; message: string; onConfirm: () => void; onClose: () => void }) => (
  <Modal
    open={affected !== null}
    title="Existing bookings are affected"
    onClose={onClose}
    busy={busy}
    footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Go back
        </Button>
        <Button onClick={onConfirm} loading={busy}>
          Save anyway
        </Button>
      </>
    }
  >
    <p>{message}</p>
    <ul className="plain-list">
      {(affected ?? []).map((a) => (
        <li key={a.appointmentId}>
          {formatDate(a.date)} at {formatTime(a.startTime)} ({a.status.toLowerCase()})
        </li>
      ))}
    </ul>
    <p className="muted small">These bookings will not be cancelled automatically. Please cancel or keep them from your appointment list.</p>
  </Modal>
);

const WeeklyEditor = ({ schedule, onSaved }: { schedule: DoctorSchedule; onSaved: (s: DoctorSchedule) => void }) => {
  const [rules, setRules] = useState<WeeklyRule[]>(schedule.weekly);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [affected, setAffected] = useState<AffectedBooking[] | null>(null);

  useEffect(() => setRules(schedule.weekly), [schedule.weekly]);

  const update = (i: number, patch: Partial<WeeklyRule>) => {
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaved(false);
  };

  const save = async (confirm: boolean) => {
    const problem = validateRules(rules);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api.doctor.saveWeekly(rules, confirm);
      onSaved(result.schedule);
      setAffected(null);
      setSaved(true);
    } catch (err) {
      const list = affectedOf(err);
      if (list) setAffected(list);
      else setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!saving) void save(false);
  };

  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <h2 className="card-title">Weekly consultation hours</h2>
      <p className="muted small">Times are in India Standard Time. Patients can book any open slot inside these hours.</p>
      {saved && <SuccessMessage>Weekly schedule saved.</SuccessMessage>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {rules.length === 0 && <p className="muted">No consultation hours yet. Add a time window to start receiving bookings.</p>}
      <ul className="rule-list">
        {rules.map((r, i) => (
          <li key={r.id ?? `new-${i}`} className="rule-row">
            <Select label="Day" value={r.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, idx) => (
                <option key={d} value={idx}>
                  {d}
                </option>
              ))}
            </Select>
            <Input label="From" type="time" value={r.startTime} onChange={(e) => update(i, { startTime: e.target.value })} required />
            <Input label="To" type="time" value={r.endTime} onChange={(e) => update(i, { endTime: e.target.value })} required />
            <Select label="Slot length" value={r.slotMinutes} onChange={(e) => update(i, { slotMinutes: Number(e.target.value) })}>
              {SLOT_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
            <button
              type="button"
              className="icon-btn rule-remove"
              aria-label={`Remove ${WEEKDAYS[r.weekday]} ${r.startTime}–${r.endTime}`}
              onClick={() => {
                setRules((rs) => rs.filter((_, idx) => idx !== i));
                setSaved(false);
              }}
            >
              <Trash2 size={18} />
            </button>
          </li>
        ))}
      </ul>
      <div className="form-actions spread">
        <Button
          variant="secondary"
          onClick={() => {
            setRules((rs) => [...rs, { weekday: 1, startTime: '09:00', endTime: '13:00', slotMinutes: 15 }]);
            setSaved(false);
          }}
          disabled={rules.length >= 42}
        >
          <Plus size={16} aria-hidden="true" /> Add time window
        </Button>
        <Button type="submit" loading={saving}>
          Save schedule
        </Button>
      </div>
      <AffectedDialog
        affected={affected}
        busy={saving}
        message="Some booked appointments fall outside the new hours."
        onConfirm={() => void save(true)}
        onClose={() => setAffected(null)}
      />
    </form>
  );
};

const LeaveEditor = ({ schedule, onSaved }: { schedule: DoctorSchedule; onSaved: (s: DoctorSchedule) => void }) => {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [affected, setAffected] = useState<AffectedBooking[] | null>(null);

  const add = async (confirm: boolean) => {
    if (!date || date < todayIst()) {
      setError('Choose today or a future date.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.doctor.addLeave(date, confirm);
      onSaved(result.schedule);
      setNotice(`Leave added for ${formatDate(date)}.`);
      setDate('');
      setAffected(null);
    } catch (err) {
      const list = affectedOf(err);
      if (list) setAffected(list);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setRemoving(id);
    setError(null);
    setNotice(null);
    try {
      onSaved(await api.doctor.removeLeave(id));
      setNotice('Leave removed.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="card stack">
      <h2 className="card-title">Leave days</h2>
      <p className="muted small">No new bookings can be made on a leave day.</p>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void add(false);
        }}
        noValidate
      >
        <Input label="Date" type="date" min={todayIst()} value={date} onChange={(e) => setDate(e.target.value)} required />
        <Button type="submit" loading={busy} disabled={!date}>
          Add leave
        </Button>
      </form>
      {schedule.leaves.length === 0 ? (
        <EmptyState title="No upcoming leave" />
      ) : (
        <ul className="plain-list leave-list">
          {schedule.leaves.map((l) => (
            <li key={l.id}>
              <span>{formatDate(l.date)}</span>
              <Button variant="ghost" size="sm" loading={removing === l.id} onClick={() => void remove(l.id)} aria-label={`Remove leave on ${formatDate(l.date)}`}>
                <Trash2 size={16} aria-hidden="true" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <AffectedDialog
        affected={affected}
        busy={busy}
        message="You already have bookings on this date."
        onConfirm={() => void add(true)}
        onClose={() => setAffected(null)}
      />
    </div>
  );
};

export const DoctorAvailabilityPage = () => {
  useDocumentTitle('Availability');
  const schedule = useApi(api.doctor.schedule, 'doctor-schedule');

  return (
    <>
      <PageHeader title="Availability" description="Set the hours patients can book and mark days you are away." />
      {schedule.loading && <Spinner label="Loading schedule…" block />}
      {schedule.error && <LoadError error={schedule.error} onRetry={schedule.reload} />}
      {schedule.data && (
        <div className="stack-lg">
          <WeeklyEditor schedule={schedule.data} onSaved={schedule.setData} />
          <LeaveEditor schedule={schedule.data} onSaved={schedule.setData} />
        </div>
      )}
    </>
  );
};
