import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '../lib/types';
import { ROLE_LABEL } from '../lib/format';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { DASHBOARD_PATH } from './auth-context';
import { useAuth } from './useAuth';

interface Props {
  roles: Role[];
  children: ReactNode;
}

// UI guard only. Every API call is authorised again on the server.
export const ProtectedRoute = ({ roles, children }: Props) => {
  const { user, checking } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (checking) {
    return <Spinner label="Checking your session…" block />;
  }
  if (!roles.includes(user.role)) {
    return (
      <div className="container section">
        <EmptyState
          title="You don't have access to this page"
          message={`This area is for ${roles.map((r) => ROLE_LABEL[r].toLowerCase()).join(' or ')} accounts. You are signed in as a ${ROLE_LABEL[user.role].toLowerCase()}.`}
          action={{ label: 'Go to my dashboard', to: DASHBOARD_PATH[user.role] }}
        />
      </div>
    );
  }
  return <>{children}</>;
};
