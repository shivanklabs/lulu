import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';

export const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

export const PublicLayout = () => (
  <div className="app-shell">
    <a href="#main" className="skip-link">
      Skip to content
    </a>
    <Navbar />
    <main id="main" className="app-main" tabIndex={-1}>
      <Outlet />
    </main>
    <Footer />
  </div>
);
