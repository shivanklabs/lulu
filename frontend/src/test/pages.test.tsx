import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { json, mockApi, renderApp, storeSession } from './helpers';
import { specialtiesOf } from '../features/doctors/doctor-data';
import type { PublicDoctor } from '../lib/types';

const doctor = (id: string, fullName: string, specialization: string, extra: Partial<PublicDoctor> = {}): PublicDoctor => ({
  _id: id,
  fullName,
  specialization,
  licenseNumber: `REG-${id}`,
  medicalCouncil: 'Delhi Medical Council',
  experienceYears: 5,
  consultationFee: 500,
  ...extra,
});

const DOCTORS = [doctor('d1', 'Asha Verma', 'Dermatology'), doctor('d2', 'Ravi Rao', 'Cardiology', { experienceYears: 20 }), doctor('d3', 'Meera Iyer', 'cardiology')];

describe('specialtiesOf', () => {
  it('groups case-insensitively and sorts by doctor count', () => {
    expect(specialtiesOf(DOCTORS).map((s) => [s.name, s.doctorCount])).toEqual([
      ['Cardiology', 2],
      ['Dermatology', 1],
    ]);
  });
});

describe('routing and pages', () => {
  it('renders the 404 page for unknown routes', () => {
    mockApi({});
    renderApp('/no-such-page');
    expect(screen.getByRole('heading', { name: /couldn’t find that page/i })).toBeInTheDocument();
  });

  it('redirects protected routes to login when signed out', () => {
    mockApi({});
    renderApp('/patient');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Please sign in to continue.')).toBeInTheDocument();
  });

  it('blocks a signed-in user from another role’s dashboard', async () => {
    storeSession('DOCTOR');
    mockApi({ 'GET /auth/me': () => json(200, { success: true, data: { user: { id: 'u1', email: 't@example.com', role: 'DOCTOR' }, profile: null } }) });
    renderApp('/hospital');
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  });

  it('lists and filters doctors from the API', async () => {
    mockApi({ 'GET /doctors': () => json(200, { success: true, data: DOCTORS }) });
    renderApp('/doctors?specialty=Cardiology');
    // Specialty matching is case-insensitive, so "cardiology" is included
    expect(await screen.findByText('2 doctors found', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Dr. Ravi Rao')).toBeInTheDocument();
    expect(screen.getByText('Dr. Meera Iyer')).toBeInTheDocument();
    expect(screen.queryByText('Dr. Asha Verma')).not.toBeInTheDocument();
  });

  it('shows a retryable error when the doctor list fails', async () => {
    let attempts = 0;
    mockApi({
      'GET /doctors': () => {
        attempts += 1;
        return attempts === 1
          ? json(500, { success: false, error: { code: 'INTERNAL', message: 'Database down' } })
          : json(200, { success: true, data: DOCTORS });
      },
    });
    renderApp('/specialties');
    expect(await screen.findByText('Database down')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Dermatology')).toBeInTheDocument();
  });

  it('validates the login form before calling the API', async () => {
    const fetchSpy = mockApi({});
    renderApp('/login');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the backend error on failed login and does not store a session', async () => {
    mockApi({ 'POST /auth/login': () => json(401, { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }) });
    renderApp('/login');
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(window.localStorage.getItem('medibridge.session')).toBeNull();
  });

  it('logs in and lands on the role dashboard with live data', async () => {
    mockApi({
      'POST /auth/login': () =>
        json(200, { success: true, data: { user: { id: 'u1', name: 'Pat Kumar', email: 'p@x.co', role: 'PATIENT' }, accessToken: 'a', refreshToken: 'r' } }),
      'GET /patient/summary': () => json(200, { success: true, data: { upcoming: 2, pending: 1, completed: 4 } }),
      'GET /patient/appointments': () => json(200, { success: true, data: { items: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 1 } } }),
    });
    renderApp('/login');
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'p@x.co' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Hello, Pat' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument());
    expect(screen.getByText('No upcoming appointments')).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem('medibridge.session') ?? '{}');
    expect(stored.user.role).toBe('PATIENT');
    expect(JSON.stringify(stored)).not.toContain('secret');
  });

  it('register enforces the backend password rules on the client', async () => {
    mockApi({});
    renderApp('/register');
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'onlyletters' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Password must contain a number')).toBeInTheDocument();
  });

  it('forgot password does not pretend to send an email', () => {
    mockApi({});
    renderApp('/forgot-password');
    expect(screen.getByText('Password reset is not available online yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
  });
});
