import { Building2, MapPin, Phone, PhoneCall } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { api } from '../../lib/api';
import { LinkButton } from '../../components/ui/Button';
import { InfoMessage, LoadError } from '../../components/ui/Feedback';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';

// The backend has no contact-form endpoint, so this page lists real hospital contact
// details (GET /catalog/hospitals, available to signed-in patients) instead of a form.
export const ContactPage = () => {
  useDocumentTitle('Contact');
  const { user } = useAuth();
  const isPatient = user?.role === 'PATIENT';
  const hospitals = useApi(api.catalog.hospitals, isPatient ? 'catalog-hospitals' : null);

  return (
    <>
      <section className="page-hero">
        <div className="container narrow">
          <h1 className="page-hero-title">Contact</h1>
          <p className="page-hero-text">
            For questions about an appointment, contact the hospital you booked with. Their details are below.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container contact-layout">
          <article className="card emergency-card">
            <span className="card-icon card-icon-danger" aria-hidden="true">
              <PhoneCall size={22} />
            </span>
            <h2 className="card-title">Medical emergency?</h2>
            <p>MediBridge is not an emergency service. Call the national emergency number immediately.</p>
            <a href="tel:112" className="btn btn-danger btn-lg">
              Call 112
            </a>
          </article>

          <div>
            <h2 className="section-title">Hospitals on MediBridge</h2>
            {!user && (
              <InfoMessage title="Sign in to see hospital contacts">
                Hospital phone numbers and addresses are shown to signed-in patients.
                <div className="inline-actions">
                  <LinkButton to="/login" size="sm" state={{ from: '/contact' }}>
                    Sign in
                  </LinkButton>
                  <LinkButton to="/register" size="sm" variant="secondary">
                    Create account
                  </LinkButton>
                </div>
              </InfoMessage>
            )}
            {user && !isPatient && (
              <InfoMessage>
                Hospital contact details are listed for patient accounts. Staff should use their hospital’s internal
                channels.
              </InfoMessage>
            )}
            {hospitals.loading && <Spinner label="Loading hospitals…" block />}
            {hospitals.error && <LoadError error={hospitals.error} onRetry={hospitals.reload} />}
            {hospitals.data && hospitals.data.length === 0 && (
              <EmptyState icon={<Building2 size={28} />} title="No hospitals listed yet" />
            )}
            {hospitals.data && hospitals.data.length > 0 && (
              <ul className="hospital-list">
                {hospitals.data.map((h) => (
                  <li key={h.id} className="card hospital-item">
                    <h3 className="card-title">{h.name}</h3>
                    <p className="icon-line">
                      <MapPin size={16} aria-hidden="true" /> {h.address}
                    </p>
                    <p className="icon-line">
                      <Phone size={16} aria-hidden="true" /> <a href={`tel:${h.phone.replace(/[^+\d]/g, '')}`}>{h.phone}</a>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </>
  );
};
