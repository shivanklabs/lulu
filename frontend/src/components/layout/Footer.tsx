import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { PUBLIC_LINKS } from './nav-links';

export const Footer = () => (
  <footer className="footer">
    <div className="container footer-grid">
      <div className="footer-brand">
        <Logo />
        <p className="muted">
          Find verified doctors, request appointments and manage your care in one place.
        </p>
      </div>
      <nav aria-label="Footer">
        <h2 className="footer-heading">Explore</h2>
        <ul className="footer-list">
          {PUBLIC_LINKS.map((l) => (
            <li key={l.to}>
              <Link to={l.to}>{l.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <div>
        <h2 className="footer-heading">Account</h2>
        <ul className="footer-list">
          <li>
            <Link to="/login">Sign in</Link>
          </li>
          <li>
            <Link to="/register">Create a patient account</Link>
          </li>
          <li>
            <Link to="/forgot-password">Forgot password</Link>
          </li>
        </ul>
      </div>
      <div>
        <h2 className="footer-heading">Emergency</h2>
        <p className="muted">
          MediBridge is not an emergency service. In a medical emergency call <a href="tel:112">112</a> immediately.
        </p>
      </div>
    </div>
    <div className="container footer-bottom">
      <p className="muted small">© {new Date().getFullYear()} MediBridge. Information on this site is not a substitute for professional medical advice.</p>
    </div>
  </footer>
);
