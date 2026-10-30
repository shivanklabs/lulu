import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldShellProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

const FieldShell = ({ id, label, error, hint, required, children }: FieldShellProps) => (
  <div className={`field${error ? ' field-invalid' : ''}`}>
    <label htmlFor={id} className="field-label">
      {label}
      {required && <span className="field-required" aria-hidden="true"> *</span>}
    </label>
    {children}
    {hint && !error && (
      <p id={`${id}-hint`} className="field-hint">
        {hint}
      </p>
    )}
    {error && (
      <p id={`${id}-error`} className="field-error" role="alert">
        {error}
      </p>
    )}
  </div>
);

const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = ({ label, error, hint, id, required, ...rest }: InputProps) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required}>
      <input
        {...rest}
        id={fieldId}
        required={required}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
      />
    </FieldShell>
  );
};

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export const Select = ({ label, error, hint, id, required, children, ...rest }: SelectProps) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required}>
      <select
        {...rest}
        id={fieldId}
        required={required}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
      >
        {children}
      </select>
    </FieldShell>
  );
};

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Textarea = ({ label, error, hint, id, required, ...rest }: TextareaProps) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required}>
      <textarea
        {...rest}
        id={fieldId}
        required={required}
        className="input textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
      />
    </FieldShell>
  );
};
