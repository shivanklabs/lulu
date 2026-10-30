import type { ReactNode } from 'react';

export const AuthCard = ({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) => (
  <section className="auth-page">
    <div className="card auth-card">
      <h1 className="auth-title">{title}</h1>
      {subtitle && <p className="auth-subtitle">{subtitle}</p>}
      {children}
      {footer && <div className="auth-footer">{footer}</div>}
    </div>
  </section>
);
