import { Building2, CalendarClock, CalendarPlus, ClipboardList, Search, UserCog } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ServiceCard } from '../../components/cards/Cards';

// Each card describes a feature that exists in the platform and links to where it is used
export const ServicesPage = () => {
  useDocumentTitle('Healthcare services');
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <h1 className="page-hero-title">What you can do on MediBridge</h1>
          <p className="page-hero-text">Tools for patients, doctors and hospitals — all connected to the same secure records.</p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">For patients</h2>
          <div className="grid grid-3">
            <ServiceCard icon={Search} title="Find verified doctors" link={{ to: '/doctors', label: 'Find a doctor' }}>
              Search doctors by name or specialty. Only doctors verified by their hospital are listed.
            </ServiceCard>
            <ServiceCard icon={CalendarPlus} title="Online appointment requests" link={{ to: '/book', label: 'Book an appointment' }}>
              Choose a hospital, department and doctor, then pick an open slot for an in-person or video consultation.
            </ServiceCard>
            <ServiceCard icon={ClipboardList} title="Manage your bookings" link={{ to: '/patient', label: 'Open patient dashboard' }}>
              See upcoming and past appointments, follow confirmation status and cancel when allowed.
            </ServiceCard>
          </div>
        </div>
      </section>

      <section className="section section-tint">
        <div className="container">
          <h2 className="section-title">For doctors and hospitals</h2>
          <div className="grid grid-3">
            <ServiceCard icon={CalendarClock} title="Schedules and leave" link={{ to: '/doctor/availability', label: 'Doctor availability' }}>
              Doctors publish weekly consultation hours and leave days. Patients can only book open slots.
            </ServiceCard>
            <ServiceCard icon={UserCog} title="Appointment workflow" link={{ to: '/doctor', label: 'Doctor dashboard' }}>
              Confirm or decline requests, then mark visits completed or missed after the appointment time.
            </ServiceCard>
            <ServiceCard icon={Building2} title="Hospital administration" link={{ to: '/hospital', label: 'Hospital dashboard' }}>
              Invite doctors, verify their registration, manage departments and review appointments.
            </ServiceCard>
          </div>
          <p className="muted small section-note">
            Doctor and hospital accounts are created by invitation from a hospital administrator, not by public sign-up.
          </p>
        </div>
      </section>
    </>
  );
};
