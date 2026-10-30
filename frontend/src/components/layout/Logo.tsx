import { Link } from 'react-router-dom';

export const Logo = ({ to = '/' }: { to?: string }) => (
  <Link to={to} className="logo" aria-label="MediBridge home">
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="#fff" />
    </svg>
    <span className="logo-text">MediBridge</span>
  </Link>
);
