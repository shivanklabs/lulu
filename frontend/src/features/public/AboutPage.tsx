import { BadgeCheck, Lock, Scale, ShieldCheck } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { LinkButton } from '../../components/ui/Button';

const PRINCIPLES = [
  {
    icon: BadgeCheck,
    title: 'Verified clinicians',
    text: 'Doctors are invited by their hospital, and appear to patients only after the hospital has checked their medical registration.',
  },
  {
    icon: Lock,
    title: 'Consent-based access',
    text: 'A doctor gets access to your health information for a consultation you booked and they confirmed — not to your whole history by default.',
  },
  {
    icon: ShieldCheck,
    title: 'Protected records',
    text: 'Sensitive medical fields are encrypted at rest, and access to health information is recorded in an audit log.',
  },
  {
    icon: Scale,
    title: 'Built for India',
    text: 'Designed around the Digital Personal Data Protection Act, 2023 and the NMC Telemedicine Practice Guidelines.',
  },
];

export const AboutPage = () => {
  useDocumentTitle('About us');
  return (
    <>
      <section className="page-hero">
        <div className="container narrow">
          <h1 className="page-hero-title">About MediBridge</h1>
          <p className="page-hero-text">
            MediBridge is a healthcare coordination platform that connects patients with hospital doctors. Our goal is
            simple: make it easy to reach the right doctor while keeping your health information private.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title text-center">What we stand for</h2>
          <div className="grid grid-2">
            {PRINCIPLES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="card">
                <span className="card-icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <h3 className="card-title">{title}</h3>
                <p className="muted">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-tint">
        <div className="container narrow text-center">
          <h2 className="section-title">Not for emergencies</h2>
          <p className="section-text">
            MediBridge is for planned consultations. If you or someone near you needs urgent help, call{' '}
            <a href="tel:112">112</a> or go to the nearest emergency department.
          </p>
          <div className="hero-actions center">
            <LinkButton to="/doctors">Find a doctor</LinkButton>
            <LinkButton to="/contact" variant="secondary">
              Contact
            </LinkButton>
          </div>
        </div>
      </section>
    </>
  );
};
