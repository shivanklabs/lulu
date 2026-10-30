import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Briefcase, IndianRupee, Landmark, UserSearch } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useAuth } from '../../auth/useAuth';
import { loadPublicDoctors } from './doctor-data';
import { doctorName, formatFee } from '../../lib/format';
import { LinkButton } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { InfoMessage, LoadError } from '../../components/ui/Feedback';
import { EmptyState } from '../../components/ui/EmptyState';
import { Avatar, DoctorCard } from '../../components/cards/Cards';

export const DoctorDetailsPage = () => {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const doctors = useApi(loadPublicDoctors, 'public-doctors');
  const doctor = doctors.data?.find((d) => d._id === id) ?? null;
  useDocumentTitle(doctor ? doctorName(doctor.fullName) : 'Doctor profile');

  const related = doctor && doctors.data
    ? doctors.data.filter((d) => d._id !== doctor._id && d.specialization === doctor.specialization).slice(0, 3)
    : [];

  return (
    <section className="section">
      <div className="container">
        <Link to="/doctors" className="back-link">
          <ArrowLeft size={16} aria-hidden="true" /> All doctors
        </Link>

        {doctors.loading && <Spinner label="Loading doctor profile…" block />}
        {doctors.error && <LoadError error={doctors.error} onRetry={doctors.reload} />}

        {doctors.data && !doctor && (
          <EmptyState
            icon={<UserSearch size={28} />}
            title="Doctor not found"
            message="This doctor is not listed. They may no longer be verified or available on MediBridge."
            action={{ label: 'Browse doctors', to: '/doctors' }}
          />
        )}

        {doctor && (
          <div className="detail-layout">
            <article className="card detail-main">
              <div className="detail-head">
                <Avatar name={doctor.fullName} size="lg" />
                <div>
                  <h1 className="detail-title">{doctorName(doctor.fullName)}</h1>
                  <p className="doctor-specialty">{doctor.specialization}</p>
                  <span className="badge badge-success">
                    <BadgeCheck size={14} aria-hidden="true" /> Verified doctor
                  </span>
                </div>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>
                    <Briefcase size={16} aria-hidden="true" /> Experience
                  </dt>
                  <dd>
                    {doctor.experienceYears} {doctor.experienceYears === 1 ? 'year' : 'years'}
                  </dd>
                </div>
                <div>
                  <dt>
                    <IndianRupee size={16} aria-hidden="true" /> Consultation fee
                  </dt>
                  <dd>{formatFee(doctor.consultationFee)}</dd>
                </div>
                <div>
                  <dt>
                    <Landmark size={16} aria-hidden="true" /> Medical council
                  </dt>
                  <dd>{doctor.medicalCouncil}</dd>
                </div>
                <div>
                  <dt>
                    <BadgeCheck size={16} aria-hidden="true" /> Registration number
                  </dt>
                  <dd>{doctor.licenseNumber}</dd>
                </div>
              </dl>
            </article>

            <aside className="card detail-aside">
              <h2 className="card-title">Book a consultation</h2>
              <p className="muted">
                Choose a date and an open time slot. The doctor confirms your request from their dashboard.
              </p>
              {user && user.role !== 'PATIENT' ? (
                <InfoMessage>Appointments can only be booked from a patient account.</InfoMessage>
              ) : (
                <LinkButton to={`/book?doctorId=${doctor._id}`} block size="lg">
                  {user ? 'Choose a time slot' : 'Sign in to book'}
                </LinkButton>
              )}
              <p className="muted small">The fee is set by the doctor. MediBridge does not take online payments.</p>
            </aside>
          </div>
        )}

        {related.length > 0 && (
          <div className="related">
            <h2 className="section-title">Other {doctor?.specialization} doctors</h2>
            <div className="grid grid-3">
              {related.map((d) => (
                <DoctorCard key={d._id} doctor={d} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
