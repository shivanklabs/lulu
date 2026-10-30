import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

export const Pagination = ({ page, totalPages, onChange, disabled }: Props) => {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(page - 1)}
        disabled={disabled || page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={16} aria-hidden="true" /> Previous
      </button>
      <span className="pagination-status" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= totalPages}
        aria-label="Next page"
      >
        Next <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
};
