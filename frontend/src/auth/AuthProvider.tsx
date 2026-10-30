import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, onSessionProblem, type RegisterInput } from '../lib/api';
import { readSession, writeSession } from '../lib/session';
import type { AuthPayload, SessionUser } from '../lib/types';
import { AuthContext, type AuthContextValue } from './auth-context';

const store = (payload: AuthPayload): SessionUser => {
  writeSession({ user: payload.user, accessToken: payload.accessToken, refreshToken: payload.refreshToken });
  return payload.user;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<SessionUser | null>(() => readSession()?.user ?? null);
  const [checking, setChecking] = useState<boolean>(() => readSession() !== null);
  const [notice, setNotice] = useState<string | null>(null);

  // Re-validate a stored session once on load (the account may have been deactivated or changed)
  useEffect(() => {
    if (!readSession()) return;
    let active = true;
    api.auth
      .me()
      .then(({ user: fresh }) => {
        if (!active) return;
        const current = readSession();
        if (current) writeSession({ ...current, user: fresh });
        setUser(fresh);
      })
      .catch((err: unknown) => {
        // 401/403 are handled by onSessionProblem; a network failure keeps the stored session
        if (active && err instanceof ApiError && err.status === 404) {
          writeSession(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      onSessionProblem((reason) => {
        setUser(null);
        setNotice(
          reason === 'expired'
            ? 'Your session has expired. Please sign in again.'
            : 'This account has been deactivated. Contact your hospital administrator.'
        );
      }),
    []
  );

  const login = useCallback(async (email: string, password: string, role?: SessionUser['role']) => {
    const u = store(await api.auth.login(email, password, role));
    setNotice(null);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const u = store(await api.auth.register(input));
    setNotice(null);
    setUser(u);
    return u;
  }, []);

  const acceptInvite = useCallback(async (token: string, password: string) => {
    const u = store(await api.auth.acceptInvite(token, password));
    setNotice(null);
    setUser(u);
    return u;
  }, []);

  // The backend issues stateless JWTs and has no logout endpoint, so sign-out discards them locally
  const logout = useCallback(() => {
    writeSession(null);
    setUser(null);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, checking, notice, login, register, acceptInvite, logout, clearNotice }),
    [user, checking, notice, login, register, acceptInvite, logout, clearNotice]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
