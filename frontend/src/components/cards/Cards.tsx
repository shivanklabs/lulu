import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Briefcase, Stethoscope, type LucideIcon } from 'lucide-react';
import type { PublicDoctor } from '../../lib/types';
import { doctorName, formatFee, initials } from '../../lib/format';
import type { Specialty } from '../../features/doctors/doctor-data';

export const Avatar = ({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) => (
  <span className={`avatar avatar-${size}`} aria-hidden="true">
    {initials(name) || '?'}
  </span>
);

export const DoctorCard = ({ doctor }: { doctor: PublicDoctor }) => (
  <article className="card doctor-card">
    <div className="doctor-card-head">
      <Avatar name={doctor.fullName} />
      <div className="doctor-card-id">
        <h3 className="card-title">
          <Link to={`/doctors/${doctor._id}`} className="stretched-link">
            {doctorName(doctor.fullName)}
          </Link>
        </h3>
        <p className="doctor-specialty">{doctor.specialization}</p>
      </div>
    </div>
    <ul className="doctor-facts">
      <li>
        <Briefcase size={16} aria-hidden="true" /> {doctor.experienceYears} {doctor.experienceYears === 1 ? 'year' : 'years'} experience
      </li>
      <li>
        <BadgeCheck size={16} aria-hidden="true" /> Verified doctor
      </li>
    </ul>
    <div className="doctor-card-foot">
      <span>
        <span className="muted small">Consultation fee</span>
        <strong className="fee">{formatFee(doctor.consultationFee)}</strong>
      </span>
      <span className="card-link" aria-hidden="true">
        View profile <ArrowRight size={16} />
      </span>
    </div>
  </article>
);

export const SpecialtyCard = ({ specialty }: { specialty: Specialty }) => (
  <article className="card specialty-card">
    <span className="card-icon" aria-hidden="true">
      <Stethoscope size={22} />
    </span>
    <h3 className="card-title">
      <Link to={`/doctors?specialty=${encodeURIComponent(specialty.name)}`} className="stretched-link">
        {specialty.name}
      </Link>
    </h3>
    <p className="muted small">
      {specialty.doctorCount} verified {specialty.doctorCount === 1 ? 'doctor' : 'doctors'}
    </p>
  </article>
);

interface ServiceCardProps {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  link: { to: string; label: string };
}

export const ServiceCard = ({ icon: Icon, title, children, link }: ServiceCardProps) => (
  <article className="card service-card">
    <span className="card-icon" aria-hidden="true">
      <Icon size={22} />
    </span>
    <h3 className="card-title">{title}</h3>
    <p className="muted">{children}</p>
    <Link to={link.to} className="card-link">
      {link.label} <ArrowRight size={16} aria-hidden="true" />
    </Link>
  </article>
);
