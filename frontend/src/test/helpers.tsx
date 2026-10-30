import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { App } from '../App';

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Routes fetch calls by "METHOD /path" (path relative to the API prefix, query string ignored)
export const mockApi = (routes: Record<string, (init?: RequestInit) => Response>) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = routes[key];
    if (!handler) return json(404, { success: false, error: { code: 'NOT_FOUND', message: `No mock for ${key}` } });
    return handler(init);
  });

export const renderApp = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );

export const renderWithProviders = (ui: ReactElement, path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );

export const storeSession = (role: 'PATIENT' | 'DOCTOR' | 'HOSPITAL' | 'ADMIN', accessToken = 'access', refreshToken = 'refresh') =>
  window.localStorage.setItem(
    'medibridge.session',
    JSON.stringify({ user: { id: 'u1', name: 'Test User', email: 't@example.com', role }, accessToken, refreshToken })
  );
