import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { DASHBOARD_PATH } from '../../auth/auth-context';
import { Logo } from './Logo';
import { PUBLIC_LINKS } from './nav-links';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Close the mobile menu after navigating
  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const signOut = () => {
    logout();
    navigate('/', { replace: true });
  };

  const accountLinks = user ? (
    <>
      {user.role === 'PATIENT' && (
        <Link to="/book" className="btn btn-secondary btn-sm">
          Book appointment
        </Link>
      )}
      <Link to={DASHBOARD_PATH[user.role]} className="btn btn-primary btn-sm">
        My dashboard
      </Link>
      <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
        <LogOut size={16} aria-hidden="true" /> Sign out
      </button>
    </>
  ) : (
    <>
      <Link to="/login" className="btn btn-ghost btn-sm">
        Sign in
      </Link>
      <Link to="/register" className="btn btn-primary btn-sm">
        Create account
      </Link>
    </>
  );

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Logo />
        <nav className="nav-links" aria-label="Main">
          {PUBLIC_LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className="nav-link">
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-actions">{accountLinks}</div>
        <button
          type="button"
          className="icon-btn nav-toggle"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="mobile-menu">
          <nav aria-label="Mobile">
            {PUBLIC_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className="mobile-link">
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="mobile-actions">{accountLinks}</div>
        </div>
      )}
    </header>
  );
};
