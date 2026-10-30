import { Compass } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { LinkButton } from '../../components/ui/Button';

export const NotFoundPage = () => {
  useDocumentTitle('Page not found');
  return (
    <section className="section">
      <div className="container narrow text-center not-found">
        <span className="card-icon card-icon-lg" aria-hidden="true">
          <Compass size={32} />
        </span>
        <p className="eyebrow center">Error 404</p>
        <h1 className="page-hero-title">We couldn’t find that page</h1>
        <p className="section-text">The link may be broken or the page may have moved.</p>
        <div className="hero-actions center">
          <LinkButton to="/">Go to home</LinkButton>
          <LinkButton to="/doctors" variant="secondary">
            Find a doctor
          </LinkButton>
        </div>
      </div>
    </section>
  );
};
