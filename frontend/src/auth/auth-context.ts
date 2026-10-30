import { createContext } from 'react';
import type { RegisterInput } from '../lib/api';
import type { Role, SessionUser } from '../lib/types';

export interface AuthContextValue {
  user: SessionUser | null;
  // True while a stored session is being re-validated with the server on page load
  checking: boolean;
  // Set when the server ended the session (expired / deactivated); shown on the login page
  notice: string | null;
  login: (email: string, password: string, role?: Role) => Promise<SessionUser>;
  register: (input: RegisterInput) => Promise<SessionUser>;
  acceptInvite: (token: string, password: string) => Promise<SessionUser>;
  logout: () => void;
  clearNotice: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const DASHBOARD_PATH: Record<Role, string> = {
  PATIENT: '/patient',
  DOCTOR: '/doctor',
  HOSPITAL: '/hospital',
  ADMIN: '/admin',
};
