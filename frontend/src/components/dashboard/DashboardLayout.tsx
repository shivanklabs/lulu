import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { ROLE_LABEL } from '../../lib/format';
import { Logo } from '../layout/Logo';

export interface SidebarItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

interface Props {
  items: SidebarItem[];
  home: string;
}

const Sidebar = ({ items, onSignOut }: { items: SidebarItem[]; onSignOut: () => void }) => (
  <>
    <nav className="sidebar-nav" aria-label="Dashboard">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="sidebar-link">
          <Icon size={18} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
    <div className="sidebar-footer">
      <NavLink to="/" className="sidebar-link">
        Back to website
      </NavLink>
      <button type="button" className="sidebar-link sidebar-button" onClick={onSignOut}>
        <LogOut size={18} aria-hidden="true" /> Sign out
      </button>
    </div>
  </>
);

export const DashboardLayout = ({ items, home }: Props) => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

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
    navigate('/login', { replace: true });
  };

  return (
    <div className="dash-shell">
      <a href="#dash-main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Dashboard navigation">
        <div className="sidebar-logo">
          <Logo to={home} />
        </div>
        <Sidebar items={items} onSignOut={signOut} />
      </aside>

      {open && (
        <div className="drawer-backdrop" onClick={() => setOpen(false)}>
          <aside id="dash-drawer" className="drawer" aria-label="Dashboard navigation" onClick={(e) => e.stopPropagation()}>
            <div className="sidebar-logo">
              <Logo to={home} />
              <button type="button" className="icon-btn" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X size={22} />
              </button>
            </div>
            <Sidebar items={items} onSignOut={signOut} />
          </aside>
        </div>
      )}

      <div className="dash-main-col">
        <header className="dash-header">
          <button
            type="button"
            className="icon-btn dash-menu-btn"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="dash-drawer"
            onClick={() => setOpen(true)}
          >
            <Menu size={22} />
          </button>
          <div className="dash-user">
            <span className="dash-user-name">{user?.name || user?.email}</span>
            {user && <span className="dash-user-role">{ROLE_LABEL[user.role]}</span>}
          </div>
        </header>
        <main id="dash-main" className="dash-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export const PageHeader = ({ title, description, actions }: PageHeaderProps) => (
  <div className="page-header">
    <div>
      <h1 className="page-title">{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>
);

export const StatCard = ({ label, value, icon: Icon }: { label: string; value: number | string; icon: LucideIcon }) => (
  <div className="stat-card">
    <span className="stat-icon" aria-hidden="true">
      <Icon size={20} />
    </span>
    <div>
      <p className="stat-value">{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  </div>
);
