import { useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarX2 } from 'lucide-react';
import { api, ApiError, errorMessage, newIdempotencyKey } from '../../lib/api';
import { addDays, doctorName, formatDate, formatFee, formatTime, MODE_LABEL, todayIst } from '../../lib/format';
import type { CatalogDoctor, ConsultationMode, PatientAppointment, Slot } from '../../lib/types';
import { useApi } from '../../hooks/useApi';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Field';
import { ErrorMessage, LoadError } from '../../components/ui/Feedback';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';

// Matches BOOKING_WINDOW_DAYS in backend/src/modules/appointments/availability.service.ts
const BOOKING_WINDOW_DAYS = 60;
const SLOT_GONE = new Set(['SLOT_UNAVAILABLE', 'SLOT_TAKEN']);

interface Props {
  doctor: CatalogDoctor;
  hospitalName: string;
  onBooked: (appointment: PatientAppointment) => void;
}

export const AppointmentForm = ({ doctor, hospitalName, onBooked }: Props) => {
  const today = todayIst();
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [mode, setMode] = useState<ConsultationMode>(doctor.consultationModes[0] ?? 'IN_PERSON');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | undefined>();
  // One key per distinct booking attempt so a retried request can never create a second booking
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today && date <= addDays(today, BOOKING_WINDOW_DAYS);
  const slots = useApi(() => api.catalog.slots(doctor.id, date), validDate ? `slots:${doctor.id}:${date}` : null);

  const changeDate = (value: string) => {
    setDate(value);
    setSlot(null);
    setError(null);
    setDateError(
      value && (value < today || value > addDays(today, BOOKING_WINDOW_DAYS))
        ? `Choose a date between today and ${formatDate(addDays(today, BOOKING_WINDOW_DAYS))}`
        : undefined
    );
  };

  const reasonTooLong = reason.trim().length > 200;
  const summary = useMemo(
    () => (slot ? `${formatDate(date)}, ${formatTime(slot.startTime)} – ${formatTime(slot.endTime)}` : null),
    [date, slot]
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !slot || reasonTooLong) return;
    const body = { doctorId: doctor.id, date, startTime: slot.startTime, mode, reason: reason.trim() || undefined };
    const signature = JSON.stringify(body);
    if (!attempt.current || attempt.current.signature !== signature) {
      attempt.current = { signature, key: newIdempotencyKey() };
    }

    setSubmitting(true);
    setError(null);
    try {
      const appointment = await api.patient.book(body, attempt.current.key);
      onBooked(appointment);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && SLOT_GONE.has(err.code)) {
        setSlot(null);
        attempt.current = null;
        slots.reload();
      }
      setSubmitting(false);
    }
  };

  return (
    <form className="stack-lg" onSubmit={submit} noValidate>
      <div className="card selected-doctor">
        <div>
          <p className="muted small">You are booking with</p>
          <p className="card-title">{doctorName(doctor.name)}</p>
          <p className="muted">
            {doctor.specialization}
            {doctor.department && doctor.department !== doctor.specialization ? ` · ${doctor.department}` : ''} · {hospitalName}
          </p>
        </div>
        <strong className="fee">{formatFee(doctor.consultationFee)}</strong>
      </div>

      <fieldset className="fieldset">
        <legend className="legend">1. Choose a date</legend>
        <Input
          label="Appointment date"
          type="date"
          min={today}
          max={addDays(today, BOOKING_WINDOW_DAYS)}
          value={date}
          onChange={(e) => changeDate(e.target.value)}
          error={dateError}
          hint={`You can book up to ${BOOKING_WINDOW_DAYS} days ahead. Times are in India Standard Time.`}
          required
        />
      </fieldset>

      <fieldset className="fieldset">
        <legend className="legend">2. Pick a time</legend>
        {!validDate && <p className="muted">Choose a valid date to see open times.</p>}
        {slots.loading && <Spinner label="Checking open times…" />}
        {slots.error && <LoadError error={slots.error} onRetry={slots.reload} />}
        {validDate && slots.data && slots.data.length === 0 && (
          <EmptyState
            icon={<CalendarX2 size={28} />}
            title="No open times on this date"
            message="The doctor is not available or fully booked. Try another date."
            action={{ label: 'Try the next day', onClick: () => changeDate(addDays(date, 1)) }}
          />
        )}
        {slots.data && slots.data.length > 0 && (
          <div className="slot-grid" role="radiogroup" aria-label="Available times">
            {slots.data.map((s) => {
              const selected = slot?.startTime === s.startTime;
              return (
                <button
                  key={s.startTime}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`slot${selected ? ' slot-selected' : ''}`}
                  onClick={() => {
                    setSlot(s);
                    setError(null);
                  }}
                >
                  {formatTime(s.startTime)}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      <fieldset className="fieldset">
        <legend className="legend">3. Consultation details</legend>
        <div className="radio-row" role="radiogroup" aria-label="Consultation type">
          {doctor.consultationModes.map((m) => (
            <label key={m} className={`radio-card${mode === m ? ' radio-card-selected' : ''}`}>
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              {MODE_LABEL[m]}
            </label>
          ))}
        </div>
        <Textarea
          label="Reason for visit"
          rows={3}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint={`Optional. Shared only with your doctor. ${reason.trim().length}/200`}
          error={reasonTooLong ? 'Keep the reason under 200 characters' : undefined}
        />
      </fieldset>

      {error && <ErrorMessage title="Booking not completed">{error}</ErrorMessage>}

      <div className="booking-summary">
        <p>{summary ? <strong>{summary}</strong> : <span className="muted">Select a time to continue.</span>}</p>
        <Button type="submit" size="lg" loading={submitting} disabled={!slot || reasonTooLong}>
          {submitting ? 'Sending request…' : 'Request appointment'}
        </Button>
      </div>
    </form>
  );
};
