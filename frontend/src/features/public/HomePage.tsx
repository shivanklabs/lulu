import { useNavigate } from 'react-router-dom';
import { CalendarCheck2, ClipboardList, Search, ShieldCheck } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { loadPublicDoctors, specialtiesOf } from '../doctors/doctor-data';
import { SearchBar } from '../../components/ui/SearchBar';
import { LinkButton } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { LoadError } from '../../components/ui/Feedback';
import { EmptyState } from '../../components/ui/EmptyState';
import { DoctorCard, SpecialtyCard } from '../../components/cards/Cards';

const STEPS = [
  { icon: Search, title: 'Find a verified doctor', text: 'Browse doctors whose registration has been checked by their hospital.' },
  { icon: CalendarCheck2, title: 'Request a time slot', text: 'Pick an open slot from the doctor’s real schedule and send your request.' },
  { icon: ClipboardList, title: 'Track it in your dashboard', text: 'See when the doctor confirms, and cancel online if your plans change.' },
];

export const HomePage = () => {
  useDocumentTitle('');
  const navigate = useNavigate();
  const doctors = useApi(loadPublicDoctors, 'public-doctors');
  const specialties = doctors.data ? specialtiesOf(doctors.data).slice(0, 8) : [];
  const featured = doctors.data ? [...doctors.data].sort((a, b) => b.experienceYears - a.experienceYears).slice(0, 3) : [];

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">
              <ShieldCheck size={16} aria-hidden="true" /> Verified doctors · Secure records
            </p>
            <h1 className="hero-title">Care from verified doctors, booked in minutes</h1>
            <p className="hero-text">
              MediBridge connects patients with hospital doctors. Find the right specialist, request an appointment and
              follow its status from one simple dashboard.
            </p>
            <SearchBar
              placeholder="Search by doctor name or specialty"
              onSearch={(q) => navigate(q ? `/doctors?q=${encodeURIComponent(q)}` : '/doctors')}
            />
            <div className="hero-actions">
              <LinkButton to="/book" size="lg">
                Book an appointment
              </LinkButton>
              <LinkButton to="/doctors" variant="secondary" size="lg">
                Browse doctors
              </LinkButton>
            </div>
          </div>
          <div className="hero-panel" aria-hidden="true">
            <div className="hero-panel-card">
              <CalendarCheck2 size={28} />
              <div>
                <strong>Real-time availability</strong>
                <p className="muted small">Slots come straight from each doctor’s published schedule.</p>
              </div>
            </div>
            <div className="hero-panel-card">
              <ShieldCheck size={28} />
              <div>
                <strong>Privacy first</strong>
                <p className="muted small">Doctors see your details only for consultations you book.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <h2 className="section-title">Browse by specialty</h2>
              <p className="section-text">Specialties offered by verified doctors on MediBridge.</p>
            </div>
            <LinkButton to="/specialties" variant="ghost">
              All specialties
            </LinkButton>
          </div>
          {doctors.loading && <Spinner label="Loading specialties…" block />}
          {doctors.error && <LoadError error={doctors.error} onRetry={doctors.reload} />}
          {doctors.data && specialties.length === 0 && (
            <EmptyState title="No specialties listed yet" message="Specialties appear here once verified doctors join MediBridge." />
          )}
          {specialties.length > 0 && (
            <div className="grid grid-4">
              {specialties.map((s) => (
                <SpecialtyCard key={s.slug} specialty={s} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section section-tint">
        <div className="container">
          <div className="section-head">
            <div>
              <h2 className="section-title">Experienced doctors</h2>
              <p className="section-text">A few of the verified doctors you can book today.</p>
            </div>
            <LinkButton to="/doctors" variant="ghost">
              View all doctors
            </LinkButton>
          </div>
          {doctors.loading && <Spinner label="Loading doctors…" block />}
          {doctors.error && <LoadError error={doctors.error} onRetry={doctors.reload} />}
          {doctors.data && featured.length === 0 && (
            <EmptyState title="No doctors listed yet" message="Verified doctors will appear here as hospitals add them." />
          )}
          {featured.length > 0 && (
            <div className="grid grid-3">
              {featured.map((d) => (
                <DoctorCard key={d._id} doctor={d} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title text-center">How MediBridge works</h2>
          <ol className="steps">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="card step">
                <span className="step-number">{i + 1}</span>
                <span className="card-icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <h3 className="card-title">{title}</h3>
                <p className="muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta-band">
            <div>
              <h2 className="section-title">New to MediBridge?</h2>
              <p className="section-text">Create a free patient account to request appointments and manage your bookings.</p>
            </div>
            <LinkButton to="/register" size="lg">
              Create patient account
            </LinkButton>
          </div>
        </div>
      </section>
    </>
  );
};
