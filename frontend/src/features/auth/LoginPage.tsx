import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { DASHBOARD_PATH } from '../../auth/auth-context';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ApiError, errorMessage } from '../../lib/api';
import type { Role } from '../../lib/types';
import { ROLE_LABEL } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { ErrorMessage, InfoMessage } from '../../components/ui/Feedback';
import { AuthCard } from './AuthCard';
import { compact, validateEmail } from './validation';

// Return to the page that sent the user here, but only if their role may open it
const ROLE_PREFIXES: Record<Role, string[]> = {
  PATIENT: ['/patient', '/book'],
  DOCTOR: ['/doctor'],
  HOSPITAL: ['/hospital'],
  ADMIN: ['/admin'],
};
const PROTECTED_PREFIXES = ['/patient', '/book', '/doctor', '/hospital', '/admin'];
const LOGIN_ROLES: Role[] = ['PATIENT', 'DOCTOR', 'HOSPITAL', 'ADMIN'];

const destinationFor = (role: Role, from?: string): string => {
  if (from && from.startsWith('/') && !from.startsWith('//')) {
    const isProtected = PROTECTED_PREFIXES.some((p) => from === p || from.startsWith(`${p}/`) || from.startsWith(`${p}?`));
    const allowed = ROLE_PREFIXES[role].some((p) => from === p || from.startsWith(`${p}/`) || from.startsWith(`${p}?`));
    if (!isProtected || allowed) return from;
  }
  return DASHBOARD_PATH[role];
};

export const LoginPage = () => {
  useDocumentTitle('Sign in');
  const { user, login, notice, clearNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const requestedRole = new URLSearchParams(location.search).get('role') as Role | null;

  const [selectedRole, setSelectedRole] = useState<Role>(
    requestedRole && LOGIN_ROLES.includes(requestedRole) ? requestedRole : 'PATIENT'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user && !submitting) return <Navigate to={destinationFor(user.role, from)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const found = compact({ email: validateEmail(email), password: password ? undefined : 'Password is required' });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    clearNotice();
    try {
      const signedIn = await login(email.trim(), password, selectedRole);
      navigate(destinationFor(signedIn.role, from), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title={`${ROLE_LABEL[selectedRole]} sign in`}
      subtitle="Choose your account type to open the right sign-in portal."
      footer={
        <>
          New patient? <Link to="/register">Create an account</Link>
        </>
      }
    >
      {notice && <InfoMessage>{notice}</InfoMessage>}
      {from && !notice && <InfoMessage>Please sign in to continue.</InfoMessage>}
      <div className="tabs" role="group" aria-label="Sign in as">
        {LOGIN_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            className={`tab${selectedRole === role ? ' tab-active' : ''}`}
            aria-pressed={selectedRole === role}
            onClick={() => {
              setSelectedRole(role);
              setFormError(null);
            }}
          >
            {ROLE_LABEL[role]}
          </button>
        ))}
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        {formError && <ErrorMessage>{formError}</ErrorMessage>}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          required
        />
        <div className="form-row-end">
          <Link to="/forgot-password" className="small">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" block size="lg" loading={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  );
};
