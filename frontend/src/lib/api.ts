import { config } from '../config/env';
import { readSession, writeSession } from './session';
import type {
  AdminOverview,
  AffectedBooking,
  AppointmentAction,
  AppointmentStatus,
  AuditLogEntry,
  AuthPayload,
  CatalogDoctor,
  CatalogHospital,
  ConsultationMode,
  Department,
  DoctorAppointment,
  DoctorProfile,
  DoctorSchedule,
  DoctorSummary,
  Gender,
  HospitalAppointment,
  HospitalDoctor,
  HospitalProfile,
  HospitalStats,
  InviteResult,
  Paged,
  PatientAppointment,
  PatientProfile,
  PatientSummary,
  PublicDoctor,
  SessionUser,
  Slot,
  WeeklyRule,
} from './types';

// Error shape of the backend: { success: false, error: { code, message, details, requestId } }
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | null;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> | null = null, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  // First message per field for VALIDATION_ERROR responses (zod flatten().fieldErrors)
  fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_ERROR' || !this.details) return {};
    const out: Record<string, string> = {};
    for (const [field, messages] of Object.entries(this.details)) {
      if (Array.isArray(messages) && typeof messages[0] === 'string') out[field] = messages[0];
    }
    return out;
  }
}

export const errorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    const fields = Object.values(err.fieldErrors());
    if (err.code === 'VALIDATION_ERROR' && fields.length > 0) return fields[0];
    return err.message;
  }
  return 'Something went wrong. Please try again.';
};

type SessionListener = (reason: 'expired' | 'forbidden') => void;
const sessionListeners = new Set<SessionListener>();
export const onSessionProblem = (listener: SessionListener): (() => void) => {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
};

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string; details?: Record<string, unknown> | null; requestId?: string };
}

const rawFetch = async <T>(path: string, init: RequestInit, token?: string): Promise<{ status: number; body: Envelope<T> | null }> => {
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string>) };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the MediBridge server. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  return { status: res.status, body };
};

// Concurrent 401s share one refresh call
let refreshInFlight: Promise<boolean> | null = null;

const refreshAccessToken = (): Promise<boolean> => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const session = readSession();
    if (!session) return false;
    try {
      const { status, body } = await rawFetch<{ accessToken: string }>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (status === 200 && body?.success && body.data?.accessToken) {
        writeSession({ ...session, accessToken: body.data.accessToken });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};

const request = async <T>(path: string, init: RequestInit = {}, retried = false): Promise<T> => {
  const session = readSession();
  const { status, body } = await rawFetch<T>(path, init, session?.accessToken);

  if (body?.success && status < 400) return body.data as T;

  const err = body?.error;
  const code = err?.code ?? (status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'REQUEST_FAILED');

  if (status === 401 && session) {
    // Expired access token: refresh once and retry, otherwise the session is over
    if (!retried && code === 'TOKEN_EXPIRED' && (await refreshAccessToken())) {
      return request<T>(path, init, true);
    }
    writeSession(null);
    sessionListeners.forEach((l) => l('expired'));
  } else if (status === 403 && code === 'ACCOUNT_INACTIVE' && session) {
    writeSession(null);
    sessionListeners.forEach((l) => l('forbidden'));
  }

  throw new ApiError(
    status,
    code,
    err?.message ?? (status >= 500 ? 'The server had a problem. Please try again shortly.' : `Request failed (${status})`),
    err?.details ?? null,
    err?.requestId
  );
};

type Query = Record<string, string | number | undefined>;

const get = <T>(path: string, query?: Query): Promise<T> => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return request<T>(qs ? `${path}?${qs}` : path);
};

const send = <T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown, headers?: Record<string, string>) =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers });

export const newIdempotencyKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const DOCTOR_ACTION_PATH: Record<AppointmentAction, string> = {
  cancel: 'cancel',
  confirm: 'confirm',
  decline: 'decline',
  complete: 'complete',
  no_show: 'no-show',
};

export interface RegisterInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  dateOfBirth?: string;
  gender?: Gender;
  privacyPolicyAccepted: boolean;
}

export interface InviteDoctorInput {
  fullName: string;
  email: string;
  phone: string;
  specialization: string;
  departmentId: string;
  registrationNumber: string;
  medicalCouncil: string;
  qualifications: string[];
  consultationModes: ConsultationMode[];
  consultationFee: number;
  experienceYears: number;
}

export const api = {
  auth: {
    login: (email: string, password: string, role?: SessionUser['role']) =>
      send<AuthPayload>('POST', '/auth/login', { email, password, ...(role ? { role } : {}) }),
    register: (input: RegisterInput) => send<AuthPayload>('POST', '/auth/register', input),
    acceptInvite: (token: string, password: string) => send<AuthPayload>('POST', '/auth/accept-invite', { token, password }),
    me: () => get<{ user: SessionUser; profile: unknown }>('/auth/me'),
  },

  doctors: {
    listPublic: () => get<PublicDoctor[]>('/doctors'),
  },

  catalog: {
    hospitals: () => get<CatalogHospital[]>('/catalog/hospitals'),
    departments: (hospitalId: string) => get<Array<{ id: string; name: string }>>(`/catalog/hospitals/${hospitalId}/departments`),
    doctors: (hospitalId: string, departmentId?: string) => get<CatalogDoctor[]>('/catalog/doctors', { hospitalId, departmentId }),
    slots: (doctorId: string, date: string) => get<Slot[]>(`/catalog/doctors/${doctorId}/slots`, { date }),
  },

  patient: {
    summary: () => get<PatientSummary>('/patient/summary'),
    appointments: (scope: 'upcoming' | 'history', page = 1, limit = 10) =>
      get<Paged<PatientAppointment>>('/patient/appointments', { scope, page, limit }),
    book: (
      input: { doctorId: string; date: string; startTime: string; mode: ConsultationMode; reason?: string },
      idempotencyKey: string
    ) => send<PatientAppointment>('POST', '/patient/appointments', input, { 'Idempotency-Key': idempotencyKey }),
    cancel: (id: string, reason?: string) =>
      send<PatientAppointment>('POST', `/patient/appointments/${id}/cancel`, reason ? { reason } : {}),
    profile: () => get<PatientProfile>('/patient/profile'),
    updateProfile: (input: { name?: string; phone?: string; gender?: Gender; dateOfBirth?: string | null }) =>
      send<PatientProfile>('PATCH', '/patient/profile', input),
  },

  doctor: {
    summary: () => get<DoctorSummary>('/doctor/summary'),
    appointments: (scope: 'today' | 'upcoming' | 'pending' | 'history', page = 1, limit = 10) =>
      get<Paged<DoctorAppointment>>('/doctor/appointments', { scope, page, limit }),
    act: (id: string, action: AppointmentAction, reason?: string) =>
      send<DoctorAppointment>('POST', `/doctor/appointments/${id}/${DOCTOR_ACTION_PATH[action]}`, reason ? { reason } : {}),
    schedule: () => get<DoctorSchedule>('/doctor/availability'),
    saveWeekly: (rules: WeeklyRule[], confirm: boolean) =>
      send<{ schedule: DoctorSchedule; affected: AffectedBooking[] }>('PUT', '/doctor/availability/weekly', {
        rules: rules.map(({ weekday, startTime, endTime, slotMinutes }) => ({ weekday, startTime, endTime, slotMinutes })),
        confirm,
      }),
    addLeave: (date: string, confirm: boolean) =>
      send<{ schedule: DoctorSchedule; affected: AffectedBooking[] }>('POST', '/doctor/availability/leave', { date, confirm }),
    removeLeave: (id: string) => send<DoctorSchedule>('DELETE', `/doctor/availability/leave/${id}`),
    profile: () => get<DoctorProfile>('/doctor/profile'),
    updateProfile: (
      input: Partial<Pick<DoctorProfile, 'phone' | 'qualifications' | 'experienceYears' | 'consultationFee' | 'consultationModes'>>
    ) => send<DoctorProfile>('PATCH', '/doctor/profile', input),
  },

  hospital: {
    stats: () => get<HospitalStats>('/hospital/stats'),
    doctors: () => get<HospitalDoctor[]>('/hospital/doctors'),
    inviteDoctor: (input: InviteDoctorInput) => send<InviteResult>('POST', '/hospital/doctors', input),
    reissueInvite: (doctorId: string) => send<InviteResult>('POST', `/hospital/doctors/${doctorId}/invite`),
    setVerification: (doctorId: string, status: 'PENDING' | 'VERIFIED' | 'REJECTED', notes?: string) =>
      send<{ id: string; verificationStatus: string }>('PATCH', `/hospital/doctors/${doctorId}/verification`, {
        status,
        ...(notes ? { notes } : {}),
      }),
    setActive: (doctorId: string, isActive: boolean, confirm: boolean) =>
      send<{ id: string; isActive: boolean }>('PATCH', `/hospital/doctors/${doctorId}/active`, { isActive, confirm }),
    departments: () => get<Department[]>('/hospital/departments'),
    addDepartment: (name: string) => send<Department[]>('POST', '/hospital/departments', { name }),
    updateDepartment: (id: string, input: { name?: string; isActive?: boolean }) =>
      send<Department[]>('PATCH', `/hospital/departments/${id}`, input),
    appointments: (filters: { date?: string; doctorId?: string; status?: AppointmentStatus; q?: string; page: number }) =>
      get<Paged<HospitalAppointment>>('/hospital/appointments', { ...filters, limit: 10 }),
    profile: () => get<HospitalProfile>('/hospital/profile'),
    updateProfile: (input: Partial<Pick<HospitalProfile, 'name' | 'address' | 'phone' | 'email'>>) =>
      send<HospitalProfile>('PATCH', '/hospital/profile', input),
  },

  admin: {
    overview: () => get<AdminOverview>('/admin/overview'),
    auditLogs: (limit = 25, skip = 0) => get<AuditLogEntry[]>('/admin/audit-logs', { limit, skip }),
  },
};
