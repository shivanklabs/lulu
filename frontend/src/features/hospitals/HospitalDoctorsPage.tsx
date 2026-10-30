import { useEffect, useState, type FormEvent } from 'react';
import { Copy, UserPlus } from 'lucide-react';
import { api, ApiError, errorMessage, type InviteDoctorInput } from '../../lib/api';
import { doctorName, formatDateTime, MODE_LABEL } from '../../lib/format';
import type { ConsultationMode, HospitalDoctor, InviteResult } from '../../lib/types';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { PageHeader } from '../../components/dashboard/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { ErrorMessage, InfoMessage, LoadError, SuccessMessage } from '../../components/ui/Feedback';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { VerificationBadge } from '../../components/ui/Badges';
import { compact, validateEmail, validateName, validatePhone } from '../auth/validation';

const InviteLink = ({ invite }: { invite: InviteResult }) => {
  const link = `${window.location.origin}${invite.invitePath}`;
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  return (
    <div className="stack">
      <SuccessMessage title="Invitation created">
        Share this one-time link with the doctor. It is shown only once and expires on {formatDateTime(invite.inviteExpiresAt)}.
      </SuccessMessage>
      <label className="field-label" htmlFor="invite-link">
        Invitation link
      </label>
      <input id="invite-link" className="input mono" readOnly value={link} onFocus={(e) => e.target.select()} />
      <div>
        <Button
          variant="secondary"
          onClick={() =>
            navigator.clipboard
              .writeText(link)
              .then(() => setCopied('done'))
              .catch(() => setCopied('failed'))
          }
        >
          <Copy size={16} aria-hidden="true" /> Copy link
        </Button>
        <span className="small muted copy-status" aria-live="polite">
          {copied === 'done' ? ' Copied.' : copied === 'failed' ? ' Copy failed — select the link and copy it manually.' : ''}
        </span>
      </div>
      <p className="muted small">MediBridge does not email invitations yet, so please send this link yourself.</p>
    </div>
  );
};

interface InviteForm {
  fullName: string;
  email: string;
  phone: string;
  specialization: string;
  departmentId: string;
  registrationNumber: string;
  medicalCouncil: string;
  qualifications: string;
  consultationModes: ConsultationMode[];
  consultationFee: string;
  experienceYears: string;
}

const EMPTY_INVITE: InviteForm = {
  fullName: '',
  email: '',
  phone: '',
  specialization: '',
  departmentId: '',
  registrationNumber: '',
  medicalCouncil: '',
  qualifications: '',
  consultationModes: ['IN_PERSON'],
  consultationFee: '',
  experienceYears: '',
};

const InviteDoctorModal = ({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => void }) => {
  const departments = useApi(api.hospital.departments, open ? 'hospital-departments-invite' : null);
  const [form, setForm] = useState<InviteForm>(EMPTY_INVITE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_INVITE);
      setErrors({});
      setFormError(null);
      setResult(null);
    }
  }, [open]);

  const set = <K extends keyof InviteForm>(k: K, v: InviteForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const activeDepartments = departments.data?.filter((d) => d.isActive) ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const quals = form.qualifications.split(',').map((q) => q.trim()).filter(Boolean);
    const fee = Number(form.consultationFee);
    const years = Number(form.experienceYears);
    const found = compact({
      fullName: validateName(form.fullName),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      specialization: form.specialization.trim().length < 2 ? 'Specialization is required' : undefined,
      departmentId: form.departmentId ? undefined : 'Choose a department',
      registrationNumber: /^[A-Za-z0-9/-]{3,40}$/.test(form.registrationNumber.trim()) ? undefined : 'Use 3–40 letters, numbers, "/" or "-"',
      medicalCouncil: form.medicalCouncil.trim().length < 2 ? 'Medical council is required' : undefined,
      qualifications: quals.length === 0 ? 'Add at least one qualification' : undefined,
      consultationModes: form.consultationModes.length === 0 ? 'Choose at least one mode' : undefined,
      consultationFee: form.consultationFee === '' || !Number.isFinite(fee) || fee < 0 || fee > 100000 ? 'Enter a fee between 0 and 100000' : undefined,
      experienceYears: form.experienceYears === '' || !Number.isInteger(years) || years < 0 || years > 70 ? 'Enter whole years between 0 and 70' : undefined,
    });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    const body: InviteDoctorInput = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      specialization: form.specialization.trim(),
      departmentId: form.departmentId,
      registrationNumber: form.registrationNumber.trim(),
      medicalCouncil: form.medicalCouncil.trim(),
      qualifications: quals,
      consultationModes: form.consultationModes,
      consultationFee: fee,
      experienceYears: years,
    };
    setBusy(true);
    try {
      setResult(await api.hospital.inviteDoctor(body));
      onInvited();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={result ? 'Doctor invited' : 'Invite a doctor'} onClose={onClose} busy={busy}>
      {result ? (
        <div className="stack">
          <InviteLink invite={result} />
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {formError && <ErrorMessage>{formError}</ErrorMessage>}
          {departments.error && <LoadError error={departments.error} onRetry={departments.reload} />}
          {departments.data && activeDepartments.length === 0 && (
            <InfoMessage>Add a department first — every doctor must belong to one.</InfoMessage>
          )}
          <Input label="Full name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} error={errors.fullName} required maxLength={120} />
          <div className="form-grid-2">
            <Input label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} required />
            <Input label="Phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} required maxLength={20} />
          </div>
          <div className="form-grid-2">
            <Input label="Specialization" value={form.specialization} onChange={(e) => set('specialization', e.target.value)} error={errors.specialization} required maxLength={80} />
            <Select label="Department" value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)} error={errors.departmentId} required disabled={departments.loading}>
              <option value="">Select department</option>
              {activeDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="form-grid-2">
            <Input label="Registration number" value={form.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value)} error={errors.registrationNumber} required maxLength={40} />
            <Input label="Medical council" placeholder="e.g. Delhi Medical Council" value={form.medicalCouncil} onChange={(e) => set('medicalCouncil', e.target.value)} error={errors.medicalCouncil} required maxLength={120} />
          </div>
          <Input label="Qualifications" hint="Separate with commas, e.g. MBBS, MD" value={form.qualifications} onChange={(e) => set('qualifications', e.target.value)} error={errors.qualifications} required />
          <div className="form-grid-2">
            <Input label="Consultation fee (₹)" type="number" min={0} max={100000} value={form.consultationFee} onChange={(e) => set('consultationFee', e.target.value)} error={errors.consultationFee} required />
            <Input label="Experience (years)" type="number" min={0} max={70} value={form.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} error={errors.experienceYears} required />
          </div>
          <fieldset className="fieldset">
            <legend className="field-label">Consultation modes</legend>
            <div className="radio-row">
              {(['IN_PERSON', 'VIDEO'] as const).map((m) => (
                <label key={m} className={`radio-card${form.consultationModes.includes(m) ? ' radio-card-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.consultationModes.includes(m)}
                    onChange={() =>
                      set('consultationModes', form.consultationModes.includes(m) ? form.consultationModes.filter((x) => x !== m) : [...form.consultationModes, m])
                    }
                  />
                  {MODE_LABEL[m]}
                </label>
              ))}
            </div>
            {errors.consultationModes && <p className="field-error">{errors.consultationModes}</p>}
          </fieldset>
          <div className="form-actions">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create invitation
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

const VerifyDialog = ({ doctor, onClose, onDone }: { doctor: HospitalDoctor | null; onClose: () => void; onDone: (msg: string) => void }) => {
  const [checked, setChecked] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChecked(false);
    setNotes('');
    setError(null);
  }, [doctor]);

  const verify = async () => {
    if (!doctor || !checked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.hospital.setVerification(doctor.id, 'VERIFIED', notes.trim() || undefined);
      onDone(`${doctorName(doctor.name)} is now verified and can be booked by patients.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={doctor !== null}
      title="Verify doctor"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={verify} loading={busy} disabled={!checked}>
            Mark as verified
          </Button>
        </>
      }
    >
      {doctor && (
        <div className="stack">
          <InfoMessage title="Registration check is manual">
            MediBridge does not check registrations automatically. Look up <strong>{doctor.registrationNumber}</strong> on the{' '}
            {doctor.medicalCouncil} / NMC register before verifying.
          </InfoMessage>
          <div className="checkbox-field">
            <input id="verify-check" type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <label htmlFor="verify-check">I have checked this doctor’s registration on the official register.</label>
          </div>
          <Textarea label="Notes (optional)" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      )}
    </Modal>
  );
};

type PendingAction = { doctor: HospitalDoctor; kind: 'reject' | 'deactivate' | 'activate' };

export const HospitalDoctorsPage = () => {
  useDocumentTitle('Doctors');
  const doctors = useApi(api.hospital.doctors, 'hospital-doctors');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [verifying, setVerifying] = useState<HospitalDoctor | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [forceDeactivate, setForceDeactivate] = useState(false);
  const [reissued, setReissued] = useState<InviteResult | null>(null);
  const [reissuing, setReissuing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reissue = async (d: HospitalDoctor) => {
    setReissuing(d.id);
    setActionError(null);
    try {
      setReissued(await api.hospital.reissueInvite(d.id));
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setReissuing(null);
    }
  };

  const runPending = async (notes: string) => {
    if (!pending) return;
    const { doctor, kind } = pending;
    if (kind === 'reject') {
      await api.hospital.setVerification(doctor.id, 'REJECTED', notes || undefined);
      setMessage(`${doctorName(doctor.name)} was rejected and is hidden from patients.`);
    } else {
      try {
        await api.hospital.setActive(doctor.id, kind === 'activate', forceDeactivate);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'AFFECTS_BOOKINGS') {
          setForceDeactivate(true);
          throw new ApiError(err.status, err.code, `${err.message} Press “Deactivate” again to confirm.`);
        }
        throw err;
      }
      setMessage(kind === 'activate' ? `${doctorName(doctor.name)} was reactivated.` : `${doctorName(doctor.name)} was deactivated and can no longer sign in.`);
    }
    doctors.reload();
  };

  const list = doctors.data ?? [];

  return (
    <>
      <PageHeader
        title="Doctors"
        description="Invite doctors, verify their registration and control access."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus size={18} aria-hidden="true" /> Invite doctor
          </Button>
        }
      />
      {message && <SuccessMessage>{message}</SuccessMessage>}
      {actionError && <ErrorMessage>{actionError}</ErrorMessage>}
      {doctors.loading && <Spinner label="Loading doctors…" block />}
      {doctors.error && <LoadError error={doctors.error} onRetry={doctors.reload} />}
      {doctors.data && list.length === 0 && (
        <EmptyState title="No doctors yet" message="Invite your first doctor to start taking bookings." action={{ label: 'Invite doctor', onClick: () => setInviteOpen(true) }} />
      )}
      {list.length > 0 && (
        <ul className="doctor-admin-list">
          {list.map((d) => (
            <li key={d.id} className="card doctor-admin">
              <div className="doctor-admin-main">
                <div className="appointment-top">
                  <p className="card-title">{doctorName(d.name)}</p>
                  <VerificationBadge status={d.verificationStatus} />
                  {!d.isActive && <span className="badge badge-neutral">{d.invitePending ? 'Invite pending' : 'Inactive'}</span>}
                </div>
                <p className="muted">
                  {d.specialization}
                  {d.department?.name ? ` · ${d.department.name}` : ''}
                </p>
                <p className="small muted">
                  Reg. {d.registrationNumber} · {d.medicalCouncil}
                </p>
                <p className="small muted">{[d.email, d.phone].filter(Boolean).join(' · ')}</p>
                {d.verificationNotes && <p className="small">Note: {d.verificationNotes}</p>}
              </div>
              <div className="appointment-actions">
                {d.verificationStatus !== 'VERIFIED' && (
                  <Button size="sm" onClick={() => setVerifying(d)}>
                    Verify
                  </Button>
                )}
                {d.verificationStatus !== 'REJECTED' && (
                  <Button size="sm" variant="secondary" onClick={() => setPending({ doctor: d, kind: 'reject' })}>
                    Reject
                  </Button>
                )}
                {d.invitePending ? (
                  <Button size="sm" variant="secondary" loading={reissuing === d.id} onClick={() => void reissue(d)}>
                    New invite link
                  </Button>
                ) : d.isActive ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setForceDeactivate(false);
                      setPending({ doctor: d, kind: 'deactivate' });
                    }}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setPending({ doctor: d, kind: 'activate' })}>
                    Reactivate
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <InviteDoctorModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={doctors.reload} />
      <VerifyDialog
        doctor={verifying}
        onClose={() => setVerifying(null)}
        onDone={(msg) => {
          setMessage(msg);
          doctors.reload();
        }}
      />
      <Modal open={reissued !== null} title="New invitation link" onClose={() => setReissued(null)}>
        {reissued && <InviteLink invite={reissued} />}
      </Modal>
      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'reject' ? 'Reject this doctor?' : pending?.kind === 'activate' ? 'Reactivate this doctor?' : 'Deactivate this doctor?'}
        confirmLabel={pending?.kind === 'reject' ? 'Reject' : pending?.kind === 'activate' ? 'Reactivate' : 'Deactivate'}
        danger={pending?.kind !== 'activate'}
        message={
          pending && (
            <p>
              {doctorName(pending.doctor.name)} —{' '}
              {pending.kind === 'reject'
                ? 'they will not be listed for patients.'
                : pending.kind === 'activate'
                  ? 'they will be able to sign in again.'
                  : 'they will be signed out and hidden from patients. Existing bookings are not cancelled automatically.'}
            </p>
          )
        }
        reason={pending?.kind === 'reject' ? { label: 'Note for the doctor (optional)', maxLength: 500 } : undefined}
        onClose={() => setPending(null)}
        onConfirm={runPending}
      />
    </>
  );
};
