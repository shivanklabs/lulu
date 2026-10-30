# MediBridge — REST API Specification
## Standardized Healthcare Services API v1

---

## 1. Global API Conventions

- **Base URL**: `http://localhost:5000/api/v1`
- **Payload Format**: `application/json` (UTF-8)
- **Authentication**: Bearer JWT in the `Authorization` header (`Authorization: Bearer <accessToken>`)
- **Concurrency & Idempotency**: Required `Idempotency-Key: <unique-uuid>` header on booking and critical payment/hold endpoints.
- **Envelope Contracts**:
  - **Success**: `{ "success": true, "data": <payload> }`
  - **Failure**: `{ "success": false, "error": { "code": string, "message": string, "details": object|null, "requestId": string } }`

---

## 2. Health & System Telemetry

### `GET /health`
Returns the real-time operational status of the backend and database connection.
- **Auth**: None
- **Response (200 OK / 503 Service Unavailable)**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": "connected",
    "uptimeSeconds": 3600,
    "timestamp": "2026-10-30T10:00:00.000Z"
  }
}
```

---

## 3. Authentication & Account Management

### `POST /auth/register`
Self-service patient registration. Strictly restricted to the `PATIENT` role.
- **Auth**: None (Rate limited: 30 requests / 15 min)
- **Request Body**:
```json
{
  "fullName": "Aarav Sharma",
  "email": "aarav.sharma@example.com",
  "phone": "+91 98765 43210",
  "password": "SecurePassword123!",
  "dateOfBirth": "1995-05-15",
  "gender": "MALE",
  "privacyPolicyAccepted": true
}
```
- **Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "6722a1...",
      "name": "Aarav Sharma",
      "email": "aarav.sharma@example.com",
      "role": "PATIENT"
    },
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi..."
  }
}
```

### `POST /auth/login`
Unified role-based authentication. Inactive accounts receive `403 ACCOUNT_INACTIVE`.
- **Auth**: None (Rate limited)
- **Request Body**:
```json
{
  "email": "aarav.sharma@example.com",
  "password": "SecurePassword123!"
}
```
- **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "6722a1...",
      "name": "Aarav Sharma",
      "email": "aarav.sharma@example.com",
      "role": "PATIENT"
    },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

### `POST /auth/refresh`
Rotates access token using a valid, non-expired refresh token.
- **Request Body**: `{ "refreshToken": "eyJhbGci..." }`
- **Response (200 OK)**: `{ "success": true, "data": { "accessToken": "eyJhbGci..." } }`

### `GET /auth/me`
Restores the active session and resolves the authenticated actor's domain profile.
- **Auth**: Required (`PATIENT`, `DOCTOR`, `HOSPITAL`, or `ADMIN`)
- **Response (200 OK)**: Returns user record and associated profile document (Patient, Doctor, or Hospital).

### `POST /auth/accept-invite`
Clinician onboarding: sets initial password and activates an invited doctor account.
- **Request Body**: `{ "token": "a4f8b...", "password": "NewDoctorPassword123!" }`
- **Response (200 OK)**: Returns authenticated tokens and activated doctor user profile.

---

## 4. Healthcare Catalog & Public Directory

### `GET /doctors`
Lists all public, hospital-verified doctors (`verificationStatus: 'VERIFIED'`).
- **Query Params**: `?q=cardiologist&page=1&limit=20`

### `GET /catalog/hospitals`
Lists verified hospitals with active departments for booking workflows.
- **Auth**: `PATIENT` role

### `GET /catalog/doctors/:id/slots`
Calculates open consultation slots for a verified doctor on a specific date.
- **Query Params**: `?date=YYYY-MM-DD` (Within 60-day window)
- **Slot Calculation Logic**: Weekly availability window $-$ Approved leave $-$ Existing active bookings $-$ Past times.

---

## 5. Patient Appointment Scheduling

### `GET /patient/summary`
Returns active appointment metrics for the logged-in patient.
- **Auth**: `PATIENT`
- **Response (200 OK)**: `{ "success": true, "data": { "upcomingCount": 2, "pastCount": 5 } }`

### `POST /patient/appointments`
Submits a consultation request using atomic double-booking prevention.
- **Auth**: `PATIENT` (Rate limited: 20 requests / 15 min)
- **Headers**: `Idempotency-Key: <uuid>`
- **Request Body**:
```json
{
  "hospitalId": "6722a0...",
  "departmentId": "6722a1...",
  "doctorId": "6722a2...",
  "date": "2026-11-05",
  "startTime": "10:30",
  "mode": "IN_PERSON",
  "reason": "Routine hypertension follow-up"
}
```
- **Response (201 Created)**: Returns appointment record with status `PENDING`.
- **Conflict (409 Conflict)**: Returned if the slot was simultaneously acquired by another patient.

### `POST /patient/appointments/:id/cancel`
Cancels an appointment owned by the patient.
- **Policy**: Allowed for `PENDING` bookings or `CONFIRMED` bookings at least 2 hours before start time (`PATIENT_CANCEL_CUTOFF_HOURS`).

---

## 6. Doctor Clinical Portal

### `GET /doctor/summary` & `GET /doctor/appointments`
Returns daily appointments roster categorized by scope (`today`, `upcoming`, `pending`, `history`).
- **Auth**: `DOCTOR` (Doctor must be verified)

### `POST /doctor/appointments/:id/confirm`
Clinician accepts an appointment request, transitioning status to `CONFIRMED` and establishing an encounter consent grant.

### `POST /doctor/appointments/:id/decline`
Clinician declines an appointment with a mandatory reason text string. Status transitions to `CANCELLED` and releases the slot.

### `POST /doctor/appointments/:id/complete`
Marks an in-person or teleconsultation visit `COMPLETED`. Allowed only after consultation start time.

### `PUT /doctor/availability/weekly`
Publishes recurring weekly consultation windows and slot duration (e.g. 15, 30, 45, 60 minutes).
- **Validation**: If updating rules conflicts with booked appointments, returns `409 AFFECTS_BOOKINGS` with affected booking details unless `confirm: true` is passed.

---

## 7. Hospital Facility Administration

### `GET /hospital/stats`
Returns aggregated hospital metrics (total verified doctors, active departments, appointments count).
- **Auth**: `HOSPITAL`

### `POST /hospital/doctors`
Invites a Registered Medical Practitioner (RMP) to join the hospital roster.
- **Request Body**:
```json
{
  "fullName": "Dr. Sunita Rao",
  "email": "dr.sunita@hospital.org",
  "phone": "+91 98111 22233",
  "specialization": "Neurology",
  "departmentId": "6722b...",
  "registrationNumber": "NMC-DL-2018-9941",
  "consultationFee": 1000
}
```
- **Response (201 Created)**: Returns one-time invite token for doctor registration.

### `PATCH /hospital/doctors/:id/verification`
Updates clinician verification status (`VERIFIED` or `REJECTED`).
- **Requirement**: Hospital admin manually confirms credentials against state medical registers before granting `VERIFIED` status.

---

## 8. Clinical Records & PHI Security

### `POST /medical-records`
Creates a clinical health record. Sensitive fields are encrypted with AES-256-GCM before writing to MongoDB.
- **Auth**: `DOCTOR`

### `GET /medical-records/:id`
Retrieves a medical record. Access is granted only if the doctor has an active consultation encounter or active category consent grant. Unauthorized requests receive `403 Forbidden`.

### `GET /medical-records/:id/files/:fileId`
**Authenticated Streaming Proxy**: Streams encrypted medical files, lab scans, or DICOM images directly through Node.js streaming chunks. Enforces immediate consent revocation.

---

## 9. AI Chatbot & Agent Subsystem

### `POST /chatbot/message`
Conversational clinical triage assistance. Purely informational with ZERO database mutation rights.
- **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "reply": "Based on your symptoms of mild headache, ensure adequate hydration and rest...",
    "disclaimer": "MediBridge AI Assistant provides informational guidance only and is not a substitute for professional medical judgment. In emergencies, call 112.",
    "provider": "gemini",
    "model": "gemini-3.8-flash"
  }
}
```

### `POST /ai-agent/turn`
Generates a staged action proposal (e.g. booking or cancellation) protected by a 5-minute single-use HMAC-SHA256 token.

### `POST /ai-agent/confirm`
Commits a staged AI agent action after explicit user confirmation. Replays receive `409 REPLAY_ATTACK_DETECTED`.
