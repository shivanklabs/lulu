import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, CalendarCheck2, Stethoscope } from 'lucide-react';
import { api } from '../../lib/api';
import { doctorName, formatDate, formatFee, formatTime, MODE_LABEL } from '../../lib/format';
import type { CatalogDoctor, CatalogHospital, PatientAppointment } from '../../lib/types';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Button, LinkButton } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { InfoMessage, LoadError, SuccessMessage } from '../../components/ui/Feedback';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusBadge } from '../../components/ui/Badges';
import { AppointmentForm } from './AppointmentForm';

interface Selection {
  hospital: CatalogHospital;
  doctor: CatalogDoctor;
}

// /book?doctorId=… comes from a public doctor profile. The catalog is organised by hospital,
// so the doctor is located by checking each verified hospital's doctor list.
const findBookableDoctor = async (doctorId: string): Promise<Selection | null> => {
  const hospitals = await api.catalog.hospitals();
  for (const hospital of hospitals) {
    const doctors = await api.catalog.doctors(hospital.id);
    const doctor = doctors.find((d) => d.id === doctorId);
    if (doctor) return { hospital, doctor };
  }
  return null;
};

const BookingConfirmed = ({ appointment, onBookAnother }: { appointment: PatientAppointment; onBookAnother: () => void }) => (
  <div className="card stack">
    <SuccessMessage title="Appointment requested">
      Your request has been sent to the doctor. You will see it change to “Confirmed” in your dashboard once they accept.
    </SuccessMessage>
    <dl className="detail-list">
      <div>
        <dt>Doctor</dt>
        <dd>{appointment.doctor ? doctorName(appointment.doctor.name) : '—'}</dd>
      </div>
      <div>
        <dt>Hospital</dt>
        <dd>{appointment.hospital?.name ?? '—'}</dd>
      </div>
      <div>
        <dt>When</dt>
        <dd>
          {formatDate(appointment.date)}, {formatTime(appointment.startTime)} – {formatTime(appointment.endTime)}
        </dd>
      </div>
      <div>
        <dt>Type</dt>
        <dd>{MODE_LABEL[appointment.mode]}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>
          <StatusBadge status={appointment.status} />
        </dd>
      </div>
    </dl>
    <div className="inline-actions">
      <LinkButton to="/patient">Go to my appointments</LinkButton>
      <Button variant="secondary" onClick={onBookAnother}>
        Book another
      </Button>
    </div>
  </div>
);

export const BookAppointmentPage = () => {
  useDocumentTitle('Book an appointment');
  const [params, setParams] = useSearchParams();
  const doctorIdParam = params.get('doctorId');

  const [hospitalId, setHospitalId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [booked, setBooked] = useState<PatientAppointment | null>(null);

  const preselect = useApi(() => findBookableDoctor(doctorIdParam ?? ''), doctorIdParam ? `find:${doctorIdParam}` : null);
  useEffect(() => {
    if (preselect.data) setSelection(preselect.data);
  }, [preselect.data]);

  const hospitals = useApi(api.catalog.hospitals, 'catalog-hospitals');
  const departments = useApi(() => api.catalog.departments(hospitalId), hospitalId ? `departments:${hospitalId}` : null);
  const doctors = useApi(
    () => api.catalog.doctors(hospitalId, departmentId || undefined),
    hospitalId ? `doctors:${hospitalId}:${departmentId}` : null
  );
  const hospital = hospitals.data?.find((h) => h.id === hospitalId) ?? null;

  const reset = () => {
    setSelection(null);
    setBooked(null);
    if (doctorIdParam) setParams(new URLSearchParams(), { replace: true });
  };

  if (booked) {
    return (
      <section className="section">
        <div className="container narrow">
          <BookingConfirmed appointment={booked} onBookAnother={reset} />
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container narrow">
        <h1 className="page-title">Book an appointment</h1>
        <p className="page-description">Requests are confirmed by the doctor. Not for emergencies — call 112.</p>

        {doctorIdParam && preselect.loading && <Spinner label="Finding this doctor’s schedule…" block />}
        {doctorIdParam && preselect.error && <LoadError error={preselect.error} onRetry={preselect.reload} />}
        {doctorIdParam && preselect.data === null && !preselect.loading && !preselect.error && (
          <InfoMessage title="This doctor can’t be booked online right now">
            They are not linked to a hospital that takes online bookings. Choose another doctor below.
          </InfoMessage>
        )}

        {selection ? (
          <div className="stack">
            <button type="button" className="back-link link-button" onClick={reset}>
              <ArrowLeft size={16} aria-hidden="true" /> Choose a different doctor
            </button>
            <AppointmentForm doctor={selection.doctor} hospitalName={selection.hospital.name} onBooked={setBooked} />
          </div>
        ) : (
          !(doctorIdParam && preselect.loading) && (
            <div className="stack-lg">
              <div className="card stack">
                <h2 className="card-title">
                  <Building2 size={18} aria-hidden="true" /> Hospital and department
                </h2>
                {hospitals.loading && <Spinner label="Loading hospitals…" />}
                {hospitals.error && <LoadError error={hospitals.error} onRetry={hospitals.reload} />}
                {hospitals.data && hospitals.data.length === 0 && (
                  <EmptyState title="No hospitals are taking bookings yet" message="Please check back later." />
                )}
                {hospitals.data && hospitals.data.length > 0 && (
                  <div className="form-grid-2">
                    <Select
                      label="Hospital"
                      value={hospitalId}
                      onChange={(e) => {
                        setHospitalId(e.target.value);
                        setDepartmentId('');
                      }}
                      required
                    >
                      <option value="">Select a hospital</option>
                      {hospitals.data.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </Select>
                    <Select
                      label="Department"
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      disabled={!hospitalId || departments.loading}
                      error={departments.error?.message}
                    >
                      <option value="">All departments</option>
                      {departments.data?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                {hospital && <p className="muted small">{hospital.address}</p>}
              </div>

              {hospitalId && (
                <div className="stack">
                  <h2 className="card-title">
                    <Stethoscope size={18} aria-hidden="true" /> Choose a doctor
                  </h2>
                  {doctors.loading && <Spinner label="Loading doctors…" />}
                  {doctors.error && <LoadError error={doctors.error} onRetry={doctors.reload} />}
                  {doctors.data && doctors.data.length === 0 && (
                    <EmptyState title="No doctors available here" message="Try another department or hospital." />
                  )}
                  {doctors.data && doctors.data.length > 0 && hospital && (
                    <ul className="choice-list">
                      {doctors.data.map((d) => (
                        <li key={d.id} className="card choice">
                          <div>
                            <p className="card-title">{doctorName(d.name)}</p>
                            <p className="muted">
                              {d.specialization}
                              {d.department && d.department !== d.specialization ? ` · ${d.department}` : ''} · {d.experienceYears} yrs
                            </p>
                            <p className="muted small">
                              {d.consultationModes.map((m) => MODE_LABEL[m]).join(' / ')} · {formatFee(d.consultationFee)}
                            </p>
                          </div>
                          <Button size="sm" onClick={() => setSelection({ hospital, doctor: d })}>
                            <CalendarCheck2 size={16} aria-hidden="true" /> Select
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )
        )}
        <p className="muted small section-note">
          Looking for someone specific? <Link to="/doctors">Browse all doctors</Link>.
        </p>
      </div>
    </section>
  );
};
