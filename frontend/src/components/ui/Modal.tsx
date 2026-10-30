import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  // Prevents closing (Esc / backdrop / X) while a request is in flight
  busy?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal = ({ open, title, onClose, children, footer, busy }: ModalProps) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    document.body.classList.add('no-scroll');

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) closeRef.current();
      if (e.key === 'Tab' && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};
