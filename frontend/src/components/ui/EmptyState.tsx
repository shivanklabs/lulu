import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { Button, LinkButton } from './Button';

interface Props {
  title: string;
  message?: ReactNode;
  icon?: ReactNode;
  action?: { label: string; to: string } | { label: string; onClick: () => void };
}

export const EmptyState = ({ title, message, icon, action }: Props) => (
  <div className="empty-state">
    <div className="empty-icon" aria-hidden="true">
      {icon ?? <Inbox size={28} />}
    </div>
    <h3 className="empty-title">{title}</h3>
    {message && <p className="empty-message">{message}</p>}
    {action &&
      ('to' in action ? (
        <LinkButton to={action.to} variant="secondary">
          {action.label}
        </LinkButton>
      ) : (
        <Button variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      ))}
  </div>
);
