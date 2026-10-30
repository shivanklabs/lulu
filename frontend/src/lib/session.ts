import type { SessionUser } from './types';

// Persisted session. Passwords are never stored; only the tokens issued by the backend.
export interface StoredSession {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

const KEY = 'medibridge.session';

const isStoredSession = (value: unknown): value is StoredSession => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<StoredSession>;
  return (
    typeof v.accessToken === 'string' &&
    typeof v.refreshToken === 'string' &&
    !!v.user &&
    typeof v.user.id === 'string' &&
    typeof v.user.role === 'string'
  );
};

export const readSession = (): StoredSession | null => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredSession(parsed) ? parsed : null;
  } catch {
    // Storage blocked or corrupted value: behave as signed out
    return null;
  }
};

export const writeSession = (session: StoredSession | null): void => {
  try {
    if (session) window.localStorage.setItem(KEY, JSON.stringify(session));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the session simply will not survive a reload
  }
};
