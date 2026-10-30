import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { todayIst } from '../../lib/format';
import type { Gender, PatientProfile } from '../../lib/types';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { PageHeader } from '../../components/dashboard/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { ErrorMessage, LoadError, SuccessMessage } from '../../components/ui/Feedback';
import { Spinner } from '../../components/ui/Spinner';
import { compact, validateName, validatePhone } from '../auth/validation';

interface Form {
  name: string;
  phone: string;
  dateOfBirth: string;
  gender: Gender;
}

const toForm = (p: PatientProfile): Form => ({ name: p.name, phone: p.phone, dateOfBirth: p.dateOfBirth ?? '', gender: p.gender });

export const PatientProfilePage = () => {
  useDocumentTitle('My profile');
  const profile = useApi(api.patient.profile, 'patient-profile');
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile.data) setForm(toForm(profile.data));
  }, [profile.data]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || saving) return;
    const found = compact({
      name: validateName(form.name),
      phone: validatePhone(form.phone),
      dateOfBirth: form.dateOfBirth && form.dateOfBirth > todayIst() ? 'Date of birth cannot be in the future' : undefined,
    });
    setErrors(found);
    setFormError(null);
    setSaved(false);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const updated = await api.patient.updateProfile({
        name: form.name.trim(),
        phone: form.phone.trim(),
        gender: form.gender,
        dateOfBirth: form.dateOfBirth || null,
      });
      profile.setData(updated);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="My profile" description="Keep your contact details up to date so hospitals can reach you." />
      {profile.loading && <Spinner label="Loading profile…" block />}
      {profile.error && <LoadError error={profile.error} onRetry={profile.reload} />}
      {profile.data && form && (
        <div className="profile-layout">
          <form className="card stack" onSubmit={submit} noValidate>
            {saved && <SuccessMessage>Profile saved.</SuccessMessage>}
            {formError && <ErrorMessage>{formError}</ErrorMessage>}
            <Input label="Full name" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} required maxLength={120} autoComplete="name" />
            <Input label="Mobile number" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} required maxLength={20} autoComplete="tel" />
            <div className="form-grid-2">
              <Input label="Date of birth" type="date" max={todayIst()} value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} error={errors.dateOfBirth} />
              <Select label="Gender" value={form.gender} onChange={(e) => set('gender', e.target.value as Gender)}>
                <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <div className="form-actions">
              <Button variant="ghost" disabled={saving} onClick={() => profile.data && setForm(toForm(profile.data))}>
                Reset
              </Button>
              <Button type="submit" loading={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
          <aside className="card stack">
            <h2 className="card-title">Account</h2>
            <dl className="detail-list single">
              <div>
                <dt>Email</dt>
                <dd>{profile.data.email}</dd>
              </div>
              <div>
                <dt>Patient ID</dt>
                <dd>{profile.data.patientCode ?? 'Not assigned'}</dd>
              </div>
            </dl>
            <p className="muted small">Email cannot be changed here. Your patient ID helps hospital staff find your record.</p>
          </aside>
        </div>
      )}
    </>
  );
};
