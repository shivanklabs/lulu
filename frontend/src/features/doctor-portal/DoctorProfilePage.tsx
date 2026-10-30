import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { MODE_LABEL } from '../../lib/format';
import type { ConsultationMode, DoctorProfile } from '../../lib/types';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { PageHeader } from '../../components/dashboard/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { ErrorMessage, LoadError, SuccessMessage } from '../../components/ui/Feedback';
import { Spinner } from '../../components/ui/Spinner';
import { VerificationBadge } from '../../components/ui/Badges';
import { compact, validatePhone } from '../auth/validation';

interface Form {
  phone: string;
  qualifications: string;
  experienceYears: string;
  consultationFee: string;
  consultationModes: ConsultationMode[];
}

const toForm = (p: DoctorProfile): Form => ({
  phone: p.phone,
  qualifications: p.qualifications.join(', '),
  experienceYears: String(p.experienceYears),
  consultationFee: String(p.consultationFee),
  consultationModes: p.consultationModes,
});

const parseQualifications = (text: string) =>
  text
    .split(',')
    .map((q) => q.trim())
    .filter(Boolean);

export const DoctorProfilePage = () => {
  useDocumentTitle('My profile');
  const profile = useApi(api.doctor.profile, 'doctor-profile');
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    const quals = parseQualifications(form.qualifications);
    const years = Number(form.experienceYears);
    const fee = Number(form.consultationFee);
    const found = compact({
      phone: form.phone ? validatePhone(form.phone) : 'Phone is required',
      qualifications: quals.length > 10 ? 'Up to 10 qualifications' : quals.some((q) => q.length < 2 || q.length > 80) ? 'Each qualification must be 2–80 characters' : undefined,
      experienceYears: !Number.isInteger(years) || years < 0 || years > 70 ? 'Enter whole years between 0 and 70' : undefined,
      consultationFee: !Number.isFinite(fee) || fee < 0 || fee > 100000 ? 'Enter a fee between 0 and 100000' : undefined,
      consultationModes: form.consultationModes.length === 0 ? 'Choose at least one mode' : undefined,
    });
    setErrors(found);
    setFormError(null);
    setSaved(false);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const updated = await api.doctor.updateProfile({
        phone: form.phone.trim(),
        qualifications: quals,
        experienceYears: years,
        consultationFee: fee,
        consultationModes: form.consultationModes,
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

  const toggleMode = (m: ConsultationMode) => {
    if (!form) return;
    set('consultationModes', form.consultationModes.includes(m) ? form.consultationModes.filter((x) => x !== m) : [...form.consultationModes, m]);
  };

  return (
    <>
      <PageHeader title="My profile" description="Name, registration and verification are managed by your hospital administrator." />
      {profile.loading && <Spinner label="Loading profile…" block />}
      {profile.error && <LoadError error={profile.error} onRetry={profile.reload} />}
      {profile.data && form && (
        <div className="profile-layout">
          <form className="card stack" onSubmit={submit} noValidate>
            {saved && <SuccessMessage>Profile saved.</SuccessMessage>}
            {formError && <ErrorMessage>{formError}</ErrorMessage>}
            <Input label="Phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} required maxLength={20} />
            <Input label="Qualifications" value={form.qualifications} onChange={(e) => set('qualifications', e.target.value)} error={errors.qualifications} hint="Separate with commas, e.g. MBBS, MD (Medicine)" />
            <div className="form-grid-2">
              <Input label="Experience (years)" type="number" min={0} max={70} step={1} value={form.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} error={errors.experienceYears} required />
              <Input label="Consultation fee (₹)" type="number" min={0} max={100000} value={form.consultationFee} onChange={(e) => set('consultationFee', e.target.value)} error={errors.consultationFee} required />
            </div>
            <fieldset className="fieldset">
              <legend className="field-label">Consultation modes</legend>
              <div className="radio-row">
                {(['IN_PERSON', 'VIDEO'] as const).map((m) => (
                  <label key={m} className={`radio-card${form.consultationModes.includes(m) ? ' radio-card-selected' : ''}`}>
                    <input type="checkbox" checked={form.consultationModes.includes(m)} onChange={() => toggleMode(m)} />
                    {MODE_LABEL[m]}
                  </label>
                ))}
              </div>
              {errors.consultationModes && (
                <p className="field-error" role="alert">
                  {errors.consultationModes}
                </p>
              )}
            </fieldset>
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
            <h2 className="card-title">Registration</h2>
            <VerificationBadge status={profile.data.verificationStatus} />
            {profile.data.verificationNotes && <p className="small muted">Note from hospital: {profile.data.verificationNotes}</p>}
            <dl className="detail-list single">
              <div>
                <dt>Name</dt>
                <dd>{profile.data.name}</dd>
              </div>
              <div>
                <dt>Specialization</dt>
                <dd>{profile.data.specialization}</dd>
              </div>
              <div>
                <dt>Registration number</dt>
                <dd>{profile.data.registrationNumber}</dd>
              </div>
              <div>
                <dt>Medical council</dt>
                <dd>{profile.data.medicalCouncil}</dd>
              </div>
              <div>
                <dt>Hospital</dt>
                <dd>{profile.data.hospital?.name ?? '—'}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{profile.data.department?.name ?? '—'}</dd>
              </div>
            </dl>
          </aside>
        </div>
      )}
    </>
  );
};
