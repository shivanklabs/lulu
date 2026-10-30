import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { DASHBOARD_PATH } from '../../auth/auth-context';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ApiError, errorMessage } from '../../lib/api';
import type { Gender } from '../../lib/types';
import { todayIst } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { ErrorMessage } from '../../components/ui/Feedback';
import { AuthCard } from './AuthCard';
import { compact, PASSWORD_HINT, validateEmail, validateName, validatePassword, validatePhone } from './validation';

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: Gender | '';
  password: string;
  confirmPassword: string;
  privacyPolicyAccepted: boolean;
}

const EMPTY: FormState = {
  fullName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  password: '',
  confirmPassword: '',
  privacyPolicyAccepted: false,
};

export const RegisterPage = () => {
  useDocumentTitle('Create account');
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user && !submitting) return <Navigate to={DASHBOARD_PATH[user.role]} replace />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const validate = () =>
    compact({
      fullName: validateName(form.fullName),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      dateOfBirth: form.dateOfBirth && form.dateOfBirth > todayIst() ? 'Date of birth cannot be in the future' : undefined,
      password: validatePassword(form.password),
      confirmPassword: form.confirmPassword !== form.password ? 'Passwords do not match' : undefined,
      privacyPolicyAccepted: form.privacyPolicyAccepted ? undefined : 'Please accept to continue',
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        privacyPolicyAccepted: form.privacyPolicyAccepted,
      });
      navigate('/patient', { replace: true, state: { welcome: true } });
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fieldErrors();
        if (err.code === 'EMAIL_EXISTS') fields.email = err.message;
        setErrors(fields);
      }
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Create your patient account"
      subtitle="Doctors and hospital staff receive an invitation from their hospital instead."
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form className="stack" onSubmit={submit} noValidate>
        {formError && <ErrorMessage>{formError}</ErrorMessage>}
        <Input label="Full name" autoComplete="name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} error={errors.fullName} required maxLength={120} />
        <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} required maxLength={160} />
        <Input
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          error={errors.phone}
          required
          maxLength={20}
        />
        <div className="form-grid-2">
          <Input
            label="Date of birth"
            type="date"
            max={todayIst()}
            value={form.dateOfBirth}
            onChange={(e) => set('dateOfBirth', e.target.value)}
            error={errors.dateOfBirth}
            hint="Optional"
          />
          <Select label="Gender" value={form.gender} onChange={(e) => set('gender', e.target.value as Gender | '')} hint="Optional">
            <option value="">Prefer not to say</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
          </Select>
        </div>
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
          error={errors.password}
          hint={PASSWORD_HINT}
          required
          maxLength={128}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(e) => set('confirmPassword', e.target.value)}
          error={errors.confirmPassword}
          required
          maxLength={128}
        />
        <div className={`checkbox-field${errors.privacyPolicyAccepted ? ' field-invalid' : ''}`}>
          <input
            id="privacy"
            type="checkbox"
            checked={form.privacyPolicyAccepted}
            onChange={(e) => set('privacyPolicyAccepted', e.target.checked)}
            aria-describedby={errors.privacyPolicyAccepted ? 'privacy-error' : undefined}
          />
          <label htmlFor="privacy">
            I agree that MediBridge may process my personal and health data to provide appointment services, as
            described under the Digital Personal Data Protection Act, 2023.
          </label>
        </div>
        {errors.privacyPolicyAccepted && (
          <p id="privacy-error" className="field-error" role="alert">
            {errors.privacyPolicyAccepted}
          </p>
        )}
        <Button type="submit" block size="lg" loading={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
};
