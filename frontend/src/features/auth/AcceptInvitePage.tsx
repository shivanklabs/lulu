import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { DASHBOARD_PATH } from '../../auth/auth-context';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ApiError, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { ErrorMessage } from '../../components/ui/Feedback';
import { AuthCard } from './AuthCard';
import { compact, PASSWORD_HINT, validatePassword } from './validation';

// Doctors open the one-time link created by their hospital admin and choose a password
export const AcceptInvitePage = () => {
  useDocumentTitle('Accept invitation');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const tokenLooksValid = /^[a-f0-9]{64}$/.test(token);
  const { acceptInvite, logout, user } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const found = compact({
      password: validatePassword(password),
      confirm: confirm !== password ? 'Passwords do not match' : undefined,
    });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      // A different account may be signed in on this browser
      if (user) logout();
      const doctor = await acceptInvite(token, password);
      navigate(DASHBOARD_PATH[doctor.role], { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  };

  if (!tokenLooksValid) {
    return (
      <AuthCard title="Invitation link not valid" footer={<Link to="/login">Go to sign in</Link>}>
        <ErrorMessage>
          This invitation link is incomplete or damaged. Please open the full link you received, or ask your hospital
          administrator for a new one.
        </ErrorMessage>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set up your doctor account" subtitle="Choose a password to activate the account your hospital created for you.">
      <form className="stack" onSubmit={submit} noValidate>
        {formError && <ErrorMessage>{formError}</ErrorMessage>}
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={PASSWORD_HINT}
          required
          maxLength={128}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
          required
          maxLength={128}
        />
        <Button type="submit" block size="lg" loading={submitting}>
          {submitting ? 'Activating…' : 'Activate account'}
        </Button>
      </form>
    </AuthCard>
  );
};
