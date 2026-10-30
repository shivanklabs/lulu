interface Props {
  label?: string;
  block?: boolean;
}

export const Spinner = ({ label = 'Loading…', block }: Props) => (
  <div className={block ? 'spinner-block' : 'spinner-inline'} role="status" aria-live="polite">
    <span className="spinner" aria-hidden="true" />
    <span className="spinner-label">{label}</span>
  </div>
);
