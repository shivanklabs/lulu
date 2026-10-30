import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { loadPublicDoctors, specialtiesOf } from './doctor-data';
import { SearchBar } from '../../components/ui/SearchBar';
import { Select } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { LoadError } from '../../components/ui/Feedback';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { DoctorCard } from '../../components/cards/Cards';
import type { PublicDoctor } from '../../lib/types';

const PAGE_SIZE = 9;

type SortKey = 'name' | 'experience' | 'fee-asc' | 'fee-desc';

const SORTERS: Record<SortKey, (a: PublicDoctor, b: PublicDoctor) => number> = {
  name: (a, b) => a.fullName.localeCompare(b.fullName),
  experience: (a, b) => b.experienceYears - a.experienceYears,
  'fee-asc': (a, b) => a.consultationFee - b.consultationFee,
  'fee-desc': (a, b) => b.consultationFee - a.consultationFee,
};

const isSortKey = (v: string | null): v is SortKey => v !== null && v in SORTERS;

export const DoctorsPage = () => {
  useDocumentTitle('Find a doctor');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const specialty = params.get('specialty') ?? '';
  const sortParam = params.get('sort');
  const sort: SortKey = isSortKey(sortParam) ? sortParam : 'name';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const doctors = useApi(loadPublicDoctors, 'public-doctors');
  const specialties = useMemo(() => (doctors.data ? specialtiesOf(doctors.data) : []), [doctors.data]);

  const filtered = useMemo(() => {
    if (!doctors.data) return [];
    const needle = q.toLowerCase();
    return doctors.data
      .filter((d) => !specialty || d.specialization.toLowerCase() === specialty.toLowerCase())
      .filter((d) => !needle || d.fullName.toLowerCase().includes(needle) || d.specialization.toLowerCase().includes(needle))
      .sort(SORTERS[sort]);
  }, [doctors.data, q, specialty, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <h1 className="page-hero-title">Find a doctor</h1>
          <p className="page-hero-text">All doctors listed here have been verified by their hospital.</p>
          <SearchBar initialValue={q} placeholder="Doctor name or specialty" onSearch={(value) => update({ q: value })} />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="filters">
            <Select label="Specialty" value={specialty} onChange={(e) => update({ specialty: e.target.value })} disabled={!doctors.data}>
              <option value="">All specialties</option>
              {specialties.map((s) => (
                <option key={s.slug} value={s.name}>
                  {s.name} ({s.doctorCount})
                </option>
              ))}
            </Select>
            <Select label="Sort by" value={sort} onChange={(e) => update({ sort: e.target.value === 'name' ? '' : e.target.value })}>
              <option value="name">Name (A–Z)</option>
              <option value="experience">Most experienced</option>
              <option value="fee-asc">Fee: low to high</option>
              <option value="fee-desc">Fee: high to low</option>
            </Select>
          </div>

          {doctors.loading && <Spinner label="Loading doctors…" block />}
          {doctors.error && <LoadError error={doctors.error} onRetry={doctors.reload} />}

          {doctors.data && (
            <>
              <p className="results-count" aria-live="polite">
                {filtered.length} {filtered.length === 1 ? 'doctor' : 'doctors'} found
                {q && <> for “{q}”</>}
                {specialty && <> in {specialty}</>}
              </p>
              {visible.length === 0 ? (
                <EmptyState
                  icon={<SearchX size={28} />}
                  title={doctors.data.length === 0 ? 'No doctors listed yet' : 'No doctors match your search'}
                  message={
                    doctors.data.length === 0
                      ? 'Verified doctors will appear here as hospitals add them.'
                      : 'Try a different name or specialty, or clear the filters.'
                  }
                  action={doctors.data.length > 0 ? { label: 'Clear filters', onClick: () => setParams(new URLSearchParams()) } : undefined}
                />
              ) : (
                <div className="grid grid-3">
                  {visible.map((d) => (
                    <DoctorCard key={d._id} doctor={d} />
                  ))}
                </div>
              )}
              <Pagination page={currentPage} totalPages={totalPages} onChange={(p) => update({ page: String(p) })} />
            </>
          )}
        </div>
      </section>
    </>
  );
};
