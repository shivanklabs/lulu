import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { AuthProvider } from '../auth/AuthProvider';

vi.mock('../lib/api', () => ({
  auth: {
    login: vi.fn(),
    register: vi.fn(),
    me: vi.fn().mockResolvedValue(null),
    refresh: vi.fn(),
  },
  catalog: {
    publicDoctors: vi.fn().mockResolvedValue([]),
    hospitals: vi.fn().mockResolvedValue([]),
  },
  onSessionProblem: vi.fn(() => () => {}),
  errorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : 'Error occurred')),
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
    fieldErrors() { return {}; }
  },
}));

describe('Auth Flow Components', () => {
  it('validates email and password on login submission', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    const submitBtn = screen.getByRole('button', { name: /Sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Password is required/i)).toBeInTheDocument();
    });
  });

  it('renders registration form with required privacy policy checkbox', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Create your patient account/i);
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mobile number/i)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Create account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Name is too short/i)).toBeInTheDocument();
      expect(screen.getByText(/Please accept to continue/i)).toBeInTheDocument();
    });
  });
});
