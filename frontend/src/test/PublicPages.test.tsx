import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../features/public/HomePage';
import { AboutPage } from '../features/public/AboutPage';
import { ServicesPage } from '../features/public/ServicesPage';
import { ContactPage } from '../features/public/ContactPage';
import { SpecialtiesPage } from '../features/doctors/SpecialtiesPage';
import { NotFoundPage } from '../features/public/NotFoundPage';
import { AuthContext } from '../auth/auth-context';

vi.mock('../lib/api', () => ({
  api: {
    doctors: {
      listPublic: vi.fn().mockResolvedValue([
        {
          id: 'doc_1',
          name: 'Dr. John Doe',
          specialization: 'Cardiology',
          qualifications: ['MBBS', 'MD'],
          experienceYears: 10,
          hospitalName: 'Apollo Hospital',
        },
      ]),
    },
    catalog: {
      publicDoctors: vi.fn().mockResolvedValue([]),
      hospitals: vi.fn().mockResolvedValue([]),
    },
  },
  catalog: {
    publicDoctors: vi.fn().mockResolvedValue([]),
    hospitals: vi.fn().mockResolvedValue([]),
  },
}));

const mockAuthValue = {
  user: null,
  checking: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  acceptInvite: vi.fn(),
  notice: null,
  clearNotice: vi.fn(),
};

describe('Public Pages', () => {
  it('renders HomePage with hero and primary call to action', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={mockAuthValue}>
          <HomePage />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Care from verified doctors/i);
    expect(screen.getByRole('link', { name: /Book an appointment/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Browse doctors/i })).toBeInTheDocument();
  });

  it('renders AboutPage with mission, compliance and key pillars', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={mockAuthValue}>
          <AboutPage />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/About MediBridge/i);
    expect(screen.getByText(/What we stand for/i)).toBeInTheDocument();
    expect(screen.getByText(/Verified clinicians/i)).toBeInTheDocument();
    expect(screen.getByText(/Built for India/i)).toBeInTheDocument();
  });

  it('renders ServicesPage with comprehensive service offerings', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={mockAuthValue}>
          <ServicesPage />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/What you can do on MediBridge/i);
    expect(screen.getByText(/Find verified doctors/i)).toBeInTheDocument();
  });

  it('renders ContactPage with support details and clinical emergency disclaimer', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={mockAuthValue}>
          <ContactPage />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Contact/i);
    expect(screen.getByText(/Medical emergency\?/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Call 112/i })).toBeInTheDocument();
  });

  it('renders SpecialtiesPage with medical departments', async () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={mockAuthValue}>
          <SpecialtiesPage />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Medical specialties/i);
    await waitFor(() => {
      expect(screen.getByText(/Cardiology/i)).toBeInTheDocument();
    });
  });

  it('renders NotFoundPage with return home button', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={mockAuthValue}>
          <NotFoundPage />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/We couldn’t find that page/i);
    expect(screen.getByRole('link', { name: /Go to home/i })).toBeInTheDocument();
  });
});
