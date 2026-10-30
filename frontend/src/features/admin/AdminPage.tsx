import { useState } from 'react';
import { CalendarDays, ClipboardList, Clock3, ShieldCheck, Stethoscope, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { PageHeader, StatCard } from '../../components/dashboard/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { LoadError } from '../../components/ui/Feedback';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';

const PAGE = 25;

// Platform compliance admin: system totals and the append-only audit log
export const AdminPage = () => {
  useDocumentTitle('Platform admin');
  const overview = useApi(api.admin.overview, 'admin-overview');
  const [skip, setSkip] = useState(0);
  const logs = useApi(() => api.admin.auditLogs(PAGE, skip), `admin-logs:${skip}`);

  return (
    <>
      <PageHeader title="Platform overview" description="System-wide totals and the compliance audit trail." />
      {overview.error && <LoadError error={overview.error} onRetry={overview.reload} />}
      <div className="grid grid-3 stats">
        <StatCard label="Users" value={overview.data?.totalUsers ?? '–'} icon={Users} />
        <StatCard label="Patients" value={overview.data?.totalPatients ?? '–'} icon={Users} />
        <StatCard label="Doctors" value={overview.data?.totalDoctors ?? '–'} icon={Stethoscope} />
        <StatCard label="Doctors pending verification" value={overview.data?.pendingDoctors ?? '–'} icon={Clock3} />
        <StatCard label="Appointments" value={overview.data?.totalAppointments ?? '–'} icon={CalendarDays} />
        <StatCard label="Audit events" value={overview.data?.totalAuditLogs ?? '–'} icon={ShieldCheck} />
      </div>

      <h2 className="section-title">
        <ClipboardList size={20} aria-hidden="true" /> Audit log
      </h2>
      {logs.loading && <Spinner label="Loading audit log…" block />}
      {logs.error && <LoadError error={logs.error} onRetry={logs.reload} />}
      {logs.data && logs.data.length === 0 && <EmptyState title="No audit events" />}
      {logs.data && logs.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Role</th>
                <th scope="col">Action</th>
                <th scope="col">Resource</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {logs.data.map((l) => (
                <tr key={l._id}>
                  <td>{formatDateTime(l.timestamp)}</td>
                  <td>{l.actorRole}</td>
                  <td className="mono">{l.action}</td>
                  <td>{l.resourceType}</td>
                  <td>{l.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="pagination" aria-label="Audit log pages">
        <Button variant="secondary" size="sm" disabled={skip === 0 || logs.loading} onClick={() => setSkip((s) => Math.max(0, s - PAGE))}>
          Newer
        </Button>
        <Button variant="secondary" size="sm" disabled={!logs.data || logs.data.length < PAGE || logs.loading} onClick={() => setSkip((s) => s + PAGE)}>
          Older
        </Button>
      </nav>
    </>
  );
};
