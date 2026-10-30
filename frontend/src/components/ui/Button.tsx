import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  children: ReactNode;
}

const classes = (variant: Variant, size: Size, block?: boolean, extra?: string) =>
  ['btn', `btn-${variant}`, `btn-${size}`, block ? 'btn-block' : '', extra ?? ''].filter(Boolean).join(' ');

interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  loading?: boolean;
}

export const Button = ({ variant = 'primary', size = 'md', block, loading, disabled, children, className, type = 'button', ...rest }: ButtonProps) => (
  <button
    {...rest}
    type={type}
    className={classes(variant, size, block, className)}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
  >
    {loading && <span className="btn-spinner" aria-hidden="true" />}
    {children}
  </button>
);

interface LinkButtonProps extends CommonProps {
  to: string;
  className?: string;
  state?: unknown;
}

export const LinkButton = ({ variant = 'primary', size = 'md', block, children, to, className, state }: LinkButtonProps) => (
  <Link to={to} state={state} className={classes(variant, size, block, className)}>
    {children}
  </Link>
);
