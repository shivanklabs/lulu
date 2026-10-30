import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { ErrorMessage } from './Feedback';
import { Textarea } from './Field';
import { Modal } from './Modal';
import { errorMessage } from '../../lib/api';

interface Props {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  // Optional free-text reason sent with the action
  reason?: { label: string; required?: boolean; minLength?: number; maxLength?: number; hint?: string };
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

// Runs onConfirm and stays open with the server's error message if it fails
export const ConfirmDialog = ({ open, title, message, confirmLabel, danger, reason, onConfirm, onClose }: Props) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const trimmed = text.trim();
  const reasonInvalid =
    !!reason && ((reason.required && trimmed.length === 0) || (trimmed.length > 0 && trimmed.length < (reason.minLength ?? 0)));

  const submit = async () => {
    if (busy || reasonInvalid) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(trimmed);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Keep as is
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={submit} loading={busy} disabled={reasonInvalid}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div>{message}</div>
        {reason && (
          <Textarea
            label={reason.label}
            required={reason.required}
            value={text}
            maxLength={reason.maxLength ?? 200}
            rows={3}
            hint={reason.hint ?? `${trimmed.length}/${reason.maxLength ?? 200} characters`}
            error={trimmed.length > 0 && trimmed.length < (reason.minLength ?? 0) ? `Please write at least ${reason.minLength} characters` : undefined}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </div>
    </Modal>
  );
};
