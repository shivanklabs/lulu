import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { Button } from './Button';

interface MessageProps {
  title?: string;
  children: ReactNode;
}

export const ErrorMessage = ({ title, children }: MessageProps) => (
  <div className="alert alert-error" role="alert">
    <AlertCircle size={20} aria-hidden="true" />
    <div>
      {title && <strong className="alert-title">{title}</strong>}
      <div>{children}</div>
    </div>
  </div>
);

export const SuccessMessage = ({ title, children }: MessageProps) => (
  <div className="alert alert-success" role="status">
    <CheckCircle2 size={20} aria-hidden="true" />
    <div>
      {title && <strong className="alert-title">{title}</strong>}
      <div>{children}</div>
    </div>
  </div>
);

export const InfoMessage = ({ title, children }: MessageProps) => (
  <div className="alert alert-info" role="note">
    <Info size={20} aria-hidden="true" />
    <div>
      {title && <strong className="alert-title">{title}</strong>}
      <div>{children}</div>
    </div>
  </div>
);

const friendly = (error: ApiError): string => {
  if (error.code === 'NETWORK_ERROR') return error.message;
  if (error.status === 429) return error.message || 'Too many requests. Please wait a few minutes and try again.';
  if (error.status === 403) return error.message || 'You do not have permission to view this.';
  return error.message;
};

// Load-failure block with a retry action
export const LoadError = ({ error, onRetry }: { error: ApiError; onRetry?: () => void }) => (
  <div className="alert alert-error load-error" role="alert">
    <AlertCircle size={20} aria-hidden="true" />
    <div className="load-error-body">
      <strong className="alert-title">Could not load this section</strong>
      <div>{friendly(error)}</div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  </div>
);
