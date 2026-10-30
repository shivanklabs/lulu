import { Route, Routes } from 'react-router-dom';
import { Building2, CalendarClock, CalendarDays, CalendarPlus, ClipboardList, LayoutDashboard, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PublicLayout, ScrollToTop } from './components/layout/PublicLayout';
import { DashboardLayout, type SidebarItem } from './components/dashboard/DashboardLayout';
import { HomePage } from './features/public/HomePage';
import { AboutPage } from './features/public/AboutPage';
import { ServicesPage } from './features/public/ServicesPage';
import { ContactPage } from './features/public/ContactPage';
import { NotFoundPage } from './features/public/NotFoundPage';
import { DoctorsPage } from './features/doctors/DoctorsPage';
import { DoctorDetailsPage } from './features/doctors/DoctorDetailsPage';
import { SpecialtiesPage } from './features/doctors/SpecialtiesPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { AcceptInvitePage } from './features/auth/AcceptInvitePage';
import { BookAppointmentPage } from './features/appointments/BookAppointmentPage';
import { PatientAppointmentsPage, PatientOverviewPage } from './features/patients/PatientPages';
import { PatientProfilePage } from './features/patients/PatientProfilePage';
import { DoctorAppointmentsPage, DoctorOverviewPage } from './features/doctor-portal/DoctorAppointments';
import { DoctorAvailabilityPage } from './features/doctor-portal/DoctorAvailabilityPage';
import { DoctorProfilePage } from './features/doctor-portal/DoctorProfilePage';
import { HospitalAppointmentsPage, HospitalDepartmentsPage, HospitalOverviewPage, HospitalProfilePage } from './features/hospitals/HospitalPages';
import { HospitalDoctorsPage } from './features/hospitals/HospitalDoctorsPage';
import { AdminPage } from './features/admin/AdminPage';

const PATIENT_NAV: SidebarItem[] = [
  { to: '/patient', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/patient/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/book', label: 'Book appointment', icon: CalendarPlus },
  { to: '/patient/profile', label: 'Profile', icon: UserRound },
];

const DOCTOR_NAV: SidebarItem[] = [
  { to: '/doctor', label: 'Today', icon: LayoutDashboard, end: true },
  { to: '/doctor/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/doctor/availability', label: 'Availability', icon: CalendarClock },
  { to: '/doctor/profile', label: 'Profile', icon: UserRound },
];

const HOSPITAL_NAV: SidebarItem[] = [
  { to: '/hospital', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/hospital/doctors', label: 'Doctors', icon: Stethoscope },
  { to: '/hospital/departments', label: 'Departments', icon: ClipboardList },
  { to: '/hospital/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/hospital/profile', label: 'Hospital profile', icon: Building2 },
];

const ADMIN_NAV: SidebarItem[] = [{ to: '/admin', label: 'Overview', icon: ShieldCheck, end: true }];

export const App = () => (
  <>
    <ScrollToTop />
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="doctors" element={<DoctorsPage />} />
        <Route path="doctors/:id" element={<DoctorDetailsPage />} />
        <Route path="specialties" element={<SpecialtiesPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="accept-invite" element={<AcceptInvitePage />} />
        <Route
          path="book"
          element={
            <ProtectedRoute roles={['PATIENT']}>
              <BookAppointmentPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="patient"
        element={
          <ProtectedRoute roles={['PATIENT']}>
            <DashboardLayout items={PATIENT_NAV} home="/patient" />
          </ProtectedRoute>
        }
      >
        <Route index element={<PatientOverviewPage />} />
        <Route path="appointments" element={<PatientAppointmentsPage />} />
        <Route path="profile" element={<PatientProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="doctor"
        element={
          <ProtectedRoute roles={['DOCTOR']}>
            <DashboardLayout items={DOCTOR_NAV} home="/doctor" />
          </ProtectedRoute>
        }
      >
        <Route index element={<DoctorOverviewPage />} />
        <Route path="appointments" element={<DoctorAppointmentsPage />} />
        <Route path="availability" element={<DoctorAvailabilityPage />} />
        <Route path="profile" element={<DoctorProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="hospital"
        element={
          <ProtectedRoute roles={['HOSPITAL']}>
            <DashboardLayout items={HOSPITAL_NAV} home="/hospital" />
          </ProtectedRoute>
        }
      >
        <Route index element={<HospitalOverviewPage />} />
        <Route path="doctors" element={<HospitalDoctorsPage />} />
        <Route path="departments" element={<HospitalDepartmentsPage />} />
        <Route path="appointments" element={<HospitalAppointmentsPage />} />
        <Route path="profile" element={<HospitalProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="admin"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <DashboardLayout items={ADMIN_NAV} home="/admin" />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  </>
);
