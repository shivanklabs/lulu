import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { AuthContext } from '../auth/auth-context';
import { LayoutDashboard, CalendarDays } from 'lucide-react';
import type { SessionUser } from '../lib/types';

const mockPatient: SessionUser = {
  id: 'usr_pat_1',
  email: 'patient@example.com',
  name: 'Test Patient',
  role: 'PATIENT',
};

const mockDoctor: SessionUser = {
  id: 'usr_doc_1',
  email: 'doctor@example.com',
  name: 'Dr. John Doe',
  role: 'DOCTOR',
};

const items = [
  { to: '/patient', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/patient/appointments', label: 'Appointments', icon: CalendarDays },
];

describe('Dashboard and Protected Routing', () => {
  it('renders DashboardLayout with user details and navigation items', () => {
    render(
      <MemoryRouter initialEntries={['/patient']}>
        <AuthContext.Provider
          value={{
            user: mockPatient,
            checking: false,
            login: vi.fn(),
            register: vi.fn(),
            logout: vi.fn(),
            acceptInvite: vi.fn(),
            notice: null,
            clearNotice: vi.fn(),
          }}
        >
          <DashboardLayout items={items} home="/patient" />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(screen.getByText('Test Patient')).toBeInTheDocument();
    expect(screen.getByText('Patient')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Appointments')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign out/i })).toBeInTheDocument();
  });

  it('blocks unauthorized access when role does not match in ProtectedRoute', () => {
    render(
      <MemoryRouter initialEntries={['/doctor/appointments']}>
        <AuthContext.Provider
          value={{
            user: mockPatient, // Patient trying to access doctor route
            checking: false,
            login: vi.fn(),
            register: vi.fn(),
            logout: vi.fn(),
            acceptInvite: vi.fn(),
            notice: null,
            clearNotice: vi.fn(),
          }}
        >
          <Routes>
            <Route
              path="/doctor/appointments"
              element={
                <ProtectedRoute roles={['DOCTOR']}>
                  <div>Doctor Only Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(screen.getByText(/You don't have access to this page/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Go to my dashboard/i })).toBeInTheDocument();
  });

  it('allows access when role matches in ProtectedRoute', () => {
    render(
      <MemoryRouter initialEntries={['/doctor/appointments']}>
        <AuthContext.Provider
          value={{
            user: mockDoctor,
            checking: false,
            login: vi.fn(),
            register: vi.fn(),
            logout: vi.fn(),
            acceptInvite: vi.fn(),
            notice: null,
            clearNotice: vi.fn(),
          }}
        >
          <Routes>
            <Route
              path="/doctor/appointments"
              element={
                <ProtectedRoute roles={['DOCTOR']}>
                  <div>Doctor Only Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(screen.getByText('Doctor Only Content')).toBeInTheDocument();
  });
});
