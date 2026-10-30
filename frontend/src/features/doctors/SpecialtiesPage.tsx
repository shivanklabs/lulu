import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { loadPublicDoctors, specialtiesOf } from './doctor-data';
import { Spinner } from '../../components/ui/Spinner';
import { LoadError } from '../../components/ui/Feedback';
import { EmptyState } from '../../components/ui/EmptyState';
import { SpecialtyCard } from '../../components/cards/Cards';
import { SearchBar } from '../../components/ui/SearchBar';

export const SpecialtiesPage = () => {
  useDocumentTitle('Medical specialties');
  const doctors = useApi(loadPublicDoctors, 'public-doctors');
  const [filter, setFilter] = useState('');
  const specialties = useMemo(() => (doctors.data ? specialtiesOf(doctors.data) : []), [doctors.data]);
  const visible = specialties.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <h1 className="page-hero-title">Medical specialties</h1>
          <p className="page-hero-text">
            Every specialty below is offered by at least one verified doctor. Choose one to see its doctors.
          </p>
          <SearchBar
            label="Filter specialties"
            placeholder="Filter specialties"
            buttonLabel="Filter"
            initialValue={filter}
            onSearch={setFilter}
          />
        </div>
      </section>
      <section className="section">
        <div className="container">
          {doctors.loading && <Spinner label="Loading specialties…" block />}
          {doctors.error && <LoadError error={doctors.error} onRetry={doctors.reload} />}
          {doctors.data && visible.length === 0 && (
            <EmptyState
              title={specialties.length === 0 ? 'No specialties listed yet' : 'No specialty matches that filter'}
              message={
                specialties.length === 0
                  ? 'Specialties appear here once verified doctors join MediBridge.'
                  : 'Try a shorter word, for example “cardio”.'
              }
              action={specialties.length > 0 ? { label: 'Show all specialties', onClick: () => setFilter('') } : undefined}
            />
          )}
          {visible.length > 0 && (
            <div className="grid grid-4">
              {visible.map((s) => (
                <SpecialtyCard key={s.slug} specialty={s} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
};
