// Response shapes of the existing MediBridge REST API (backend/src/modules/**).

export type Role = 'PATIENT' | 'DOCTOR' | 'HOSPITAL' | 'ADMIN';

export interface SessionUser {
  id: string;
  name?: string;
  email: string;
  role: Role;
  hospitalId?: string;
}

export interface AuthPayload {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type ConsultationMode = 'IN_PERSON' | 'VIDEO';
export type AppointmentAction = 'cancel' | 'confirm' | 'decline' | 'complete' | 'no_show';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

interface AppointmentBase {
  id: string;
  status: AppointmentStatus;
  date: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  mode: ConsultationMode;
  cancellationReason?: string;
}

export interface PatientAppointment extends AppointmentBase {
  reason?: string;
  doctor: { id: string; name: string; specialization: string } | null;
  hospital: { id: string; name: string; address?: string } | null;
  allowedActions: AppointmentAction[];
}

export interface DoctorAppointment extends AppointmentBase {
  reason?: string;
  patient: { name: string; phone?: string } | null;
  allowedActions: AppointmentAction[];
}

export interface HospitalAppointment extends AppointmentBase {
  doctor: { id: string; name: string; specialization: string } | null;
  patient: { name: string } | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  items: T[];
  pagination: Pagination;
}

// GET /doctors (public): verified doctors only
export interface PublicDoctor {
  _id: string;
  fullName: string;
  specialization: string;
  licenseNumber: string;
  medicalCouncil: string;
  experienceYears: number;
  consultationFee: number;
}

export interface PatientSummary {
  upcoming: number;
  pending: number;
  completed: number;
}

export interface PatientProfile {
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string | null;
  gender: Gender;
  patientCode: string | null;
}

export interface DoctorSummary {
  today: number;
  pending: number;
  upcoming: number;
}

export interface DoctorProfile {
  name: string;
  phone: string;
  specialization: string;
  qualifications: string[];
  experienceYears: number;
  consultationFee: number;
  consultationModes: ConsultationMode[];
  registrationNumber: string;
  medicalCouncil: string;
  verificationStatus: VerificationStatus;
  verificationNotes: string | null;
  hospital: { name: string } | null;
  department: { name: string } | null;
}

export interface WeeklyRule {
  id?: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
}

export interface DoctorSchedule {
  weekly: WeeklyRule[];
  leaves: Array<{ id: string; date: string }>;
}

export interface AffectedBooking {
  appointmentId: string;
  date: string;
  startTime: string;
  status: AppointmentStatus;
}

export interface HospitalStats {
  totalDoctors: number;
  verifiedDoctors: number;
  todayAppointments: number;
  pendingAppointments: number;
  completedThisWeek: number;
}

export interface HospitalDoctor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  specialization: string;
  qualifications: string[];
  registrationNumber: string;
  medicalCouncil: string;
  department: { id: string; name?: string } | null;
  consultationModes: ConsultationMode[];
  verificationStatus: VerificationStatus;
  verificationNotes?: string;
  isActive: boolean;
  invitePending: boolean;
}

export interface InviteResult {
  doctorId?: string;
  inviteToken: string;
  invitePath: string;
  inviteExpiresAt: string;
}

export interface Department {
  id: string;
  name: string;
  isActive: boolean;
  doctorCount: number;
}

export interface HospitalProfile {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  isVerified: boolean;
  departments: Array<{ id: string; name: string; isActive: boolean }>;
}

export interface CatalogHospital {
  id: string;
  name: string;
  address: string;
  phone: string;
  departmentCount: number;
}

export interface CatalogDoctor {
  id: string;
  name: string;
  specialization: string;
  qualifications: string[];
  experienceYears: number;
  consultationFee: number;
  consultationModes: ConsultationMode[];
  department?: string;
}

export interface Slot {
  startTime: string;
  endTime: string;
  startsAt: string;
}

export interface AdminOverview {
  totalUsers: number;
  totalPatients: number;
  totalDoctors: number;
  pendingDoctors: number;
  totalAppointments: number;
  totalAuditLogs: number;
}

export interface AuditLogEntry {
  _id: string;
  actorId: string;
  actorRole: string;
  action: string;
  resourceType: string;
  outcome: string;
  timestamp: string;
}
