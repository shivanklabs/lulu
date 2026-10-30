import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CalendarCheck2, CalendarDays, Clock3, Plus, Stethoscope } from 'lucide-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { doctorName, formatDate, formatTime, MODE_LABEL, STATUS_LABEL } from '../../lib/format';
import type { AppointmentStatus, Department, HospitalProfile } from '../../lib/types';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { PageHeader, StatCard } from '../../components/dashboard/DashboardLayout';
import { Button, LinkButton } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { ErrorMessage, LoadError, SuccessMessage } from '../../components/ui/Feedback';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { StatusBadge, VerificationBadge } from '../../components/ui/Badges';
import { Modal } from '../../components/ui/Modal';
import { compact, validateEmail, validatePhone } from '../auth/validation';

export const HospitalOverviewPage = () => {
  useDocumentTitle('Hospital dashboard');
  const stats = useApi(api.hospital.stats, 'hospital-stats');
  const doctors = useApi(api.hospital.doctors, 'hospital-doctors-overview');
  const queue = doctors.data?.filter((d) => d.verificationStatus === 'PENDING' && !d.invitePending) ?? [];

  return (
    <>
      <PageHeader title="Hospital overview" description="Live numbers for your hospital." />
      {stats.error && <LoadError error={stats.error} onRetry={stats.reload} />}
      <div className="grid grid-3 stats">
        <StatCard label="Doctors" value={stats.data?.totalDoctors ?? '–'} icon={Stethoscope} />
        <StatCard label="Verified doctors" value={stats.data?.verifiedDoctors ?? '–'} icon={BadgeCheck} />
        <StatCard label="Appointments today" value={stats.data?.todayAppointments ?? '–'} icon={CalendarDays} />
        <StatCard label="Pending requests" value={stats.data?.pendingAppointments ?? '–'} icon={Clock3} />
        <StatCard label="Completed this week" value={stats.data?.completedThisWeek ?? '–'} icon={CalendarCheck2} />
      </div>
      <div className="section-head compact">
        <h2 className="section-title">Waiting for verification</h2>
        <LinkButton to="/hospital/doctors" variant="ghost" size="sm">
          Manage doctors
        </LinkButton>
      </div>
      {doctors.loading && <Spinner label="Loading doctors…" block />}
      {doctors.error && <LoadError error={doctors.error} onRetry={doctors.reload} />}
      {doctors.data && queue.length === 0 && <EmptyState title="No doctors waiting for verification" />}
      {queue.length > 0 && (
        <ul className="plain-list card">
          {queue.map((d) => (
            <li key={d.id} className="queue-row">
              <span>
                <strong>{doctorName(d.name)}</strong> <span className="muted">· {d.specialization}</span>
              </span>
              <VerificationBadge status={d.verificationStatus} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

export const HospitalDepartmentsPage = () => {
  useDocumentTitle('Departments');
  const departments = useApi(api.hospital.departments, 'hospital-departments');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Department | null>(null);
  const [newName, setNewName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (adding) return;
    if (name.trim().length < 2) {
      setError('Department name must be at least 2 characters.');
      return;
    }
    setAdding(true);
    setError(null);
    setMessage(null);
    try {
      departments.setData(await api.hospital.addDepartment(name.trim()));
      setMessage(`Department “${name.trim()}” added.`);
      setName('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (d: Department) => {
    setBusyId(d.id);
    setError(null);
    setMessage(null);
    try {
      departments.setData(await api.hospital.updateDepartment(d.id, { isActive: !d.isActive }));
      setMessage(`“${d.name}” is now ${d.isActive ? 'inactive' : 'active'}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (!renaming || busyId) return;
    if (newName.trim().length < 2) {
      setRenameError('Department name must be at least 2 characters.');
      return;
    }
    setBusyId(renaming.id);
    setRenameError(null);
    try {
      departments.setData(await api.hospital.updateDepartment(renaming.id, { name: newName.trim() }));
      setMessage(`Department renamed to “${newName.trim()}”.`);
      setRenaming(null);
    } catch (err) {
      setRenameError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader title="Departments" description="Patients choose a department when booking. Inactive departments are hidden." />
      <form className="card inline-form" onSubmit={add} noValidate>
        <Input label="New department" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Cardiology" />
        <Button type="submit" loading={adding}>
          <Plus size={16} aria-hidden="true" /> Add
        </Button>
      </form>
      {message && <SuccessMessage>{message}</SuccessMessage>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {departments.loading && <Spinner label="Loading departments…" block />}
      {departments.error && <LoadError error={departments.error} onRetry={departments.reload} />}
      {departments.data && departments.data.length === 0 && <EmptyState title="No departments yet" message="Add your first department above." />}
      {departments.data && departments.data.length > 0 && (
        <ul className="plain-list card">
          {departments.data.map((d) => (
            <li key={d.id} className="queue-row">
              <span>
                <strong>{d.name}</strong>{' '}
                <span className="muted small">
                  · {d.doctorCount} {d.doctorCount === 1 ? 'doctor' : 'doctors'} · {d.isActive ? 'Active' : 'Inactive'}
                </span>
              </span>
              <span className="inline-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRenaming(d);
                    setNewName(d.name);
                    setRenameError(null);
                  }}
                >
                  Rename
                </Button>
                <Button size="sm" variant="secondary" loading={busyId === d.id && !renaming} onClick={() => void toggle(d)}>
                  {d.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Modal open={renaming !== null} title="Rename department" onClose={() => setRenaming(null)} busy={busyId !== null}>
        <form className="stack" onSubmit={rename} noValidate>
          <Input label="Department name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} required />
          {renameError && <ErrorMessage>{renameError}</ErrorMessage>}
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setRenaming(null)} disabled={busyId !== null}>
              Cancel
            </Button>
            <Button type="submit" loading={busyId !== null}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

const STATUSES: AppointmentStatus[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

export const HospitalAppointmentsPage = () => {
  useDocumentTitle('Appointments');
  const doctors = useApi(api.hospital.doctors, 'hospital-doctors-filter');
  const [date, setDate] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [status, setStatus] = useState<AppointmentStatus | ''>('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useApi(
    () => api.hospital.appointments({ date: date || undefined, doctorId: doctorId || undefined, status: status || undefined, q: q || undefined, page }),
    `hospital-apts:${date}:${doctorId}:${status}:${q}:${page}`
  );

  const applySearch = (e: FormEvent) => {
    e.preventDefault();
    const v = qInput.trim();
    setQ(v.length >= 2 ? v : '');
    setPage(1);
  };

  const clear = () => {
    setDate('');
    setDoctorId('');
    setStatus('');
    setQ('');
    setQInput('');
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Appointments" description="All appointments at your hospital. Visit reasons and patient contact details are visible only to the treating doctor." />
      <form className="card filters filters-4" onSubmit={applySearch} noValidate>
        <Input label="Date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} />
        <Select label="Doctor" value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setPage(1); }}>
          <option value="">All doctors</option>
          {doctors.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {doctorName(d.name)}
            </option>
          ))}
        </Select>
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value as AppointmentStatus | ''); setPage(1); }}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Input label="Search name" hint="At least 2 letters, then press Enter" value={qInput} onChange={(e) => setQInput(e.target.value)} maxLength={60} />
        <div className="filters-actions">
          <Button type="submit" size="sm">
            Search
          </Button>
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear filters
          </Button>
        </div>
      </form>
      {list.loading && <Spinner label="Loading appointments…" block />}
      {list.error && <LoadError error={list.error} onRetry={list.reload} />}
      {list.data && list.data.items.length === 0 && <EmptyState title="No appointments match these filters" />}
      {list.data && list.data.items.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Time</th>
                  <th scope="col">Patient</th>
                  <th scope="col">Doctor</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDate(a.date)}</td>
                    <td>{formatTime(a.startTime)}</td>
                    <td>{a.patient?.name ?? '—'}</td>
                    <td>{a.doctor ? doctorName(a.doctor.name) : '—'}</td>
                    <td>{MODE_LABEL[a.mode]}</td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">{list.data.pagination.total} appointments</p>
          <Pagination page={list.data.pagination.page} totalPages={list.data.pagination.totalPages} onChange={setPage} />
        </>
      )}
    </>
  );
};

type ProfileForm = Pick<HospitalProfile, 'name' | 'address' | 'phone' | 'email'>;

export const HospitalProfilePage = () => {
  useDocumentTitle('Hospital profile');
  const profile = useApi(api.hospital.profile, 'hospital-profile');
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile.data) setForm({ name: profile.data.name, address: profile.data.address, phone: profile.data.phone, email: profile.data.email });
  }, [profile.data]);

  const set = <K extends keyof ProfileForm>(k: K, v: string) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setSaved(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || saving) return;
    const found = compact({
      name: form.name.trim().length < 2 ? 'Name is too short' : undefined,
      address: form.address.trim().length < 5 ? 'Address is too short' : undefined,
      phone: validatePhone(form.phone),
      email: validateEmail(form.email),
    });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      profile.setData(await api.hospital.updateProfile({ name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim(), email: form.email.trim() }));
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
      <PageHeader title="Hospital profile" description="These contact details are shown to patients." />
      {profile.loading && <Spinner label="Loading profile…" block />}
      {profile.error && <LoadError error={profile.error} onRetry={profile.reload} />}
      {profile.data && form && (
        <div className="profile-layout">
          <form className="card stack" onSubmit={submit} noValidate>
            {saved && <SuccessMessage>Hospital profile saved.</SuccessMessage>}
            {formError && <ErrorMessage>{formError}</ErrorMessage>}
            <Input label="Hospital name" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} required maxLength={160} />
            <Input label="Address" value={form.address} onChange={(e) => set('address', e.target.value)} error={errors.address} required maxLength={300} />
            <div className="form-grid-2">
              <Input label="Phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} required maxLength={20} />
              <Input label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} required maxLength={160} />
            </div>
            <div className="form-actions">
              <Button type="submit" loading={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
          <aside className="card stack">
            <h2 className="card-title">Status</h2>
            <p>{profile.data.isVerified ? 'Verified — visible to patients for booking.' : 'Not verified — patients cannot book this hospital yet.'}</p>
            <p className="muted small">
              {profile.data.departments.filter((d) => d.isActive).length} active departments. <Link to="/hospital/departments">Manage departments</Link>
            </p>
          </aside>
        </div>
      )}
    </>
  );
};
