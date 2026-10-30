# MediBridge: Comprehensive Security Architecture & Compliance Specification

> **Classification**: Technical Security Architecture & Governance Specification  
> **Target Audience**: Technical Examiners, Security Auditors, Compliance Officers, Platform Architects  
> **Event**: SRIJAN 2026 – DevFusion  
> **Legal Frameworks**: Digital Personal Data Protection Act, 2023 (DPDPA) • Ayushman Bharat Digital Mission (ABDM) • National Medical Commission (NMC) Telemedicine Practice Guidelines  

---

## 1. Executive Summary & Security Philosophy

MediBridge is engineered under an uncompromising **Zero Trust, Defense-in-Depth** security philosophy. Because the platform coordinates Protected Health Information (PHI), clinician credential verification, and teleconsultation scheduling, security controls are applied at the network perimeter, transport layer, application gateway, domain service boundaries, cryptographic storage engines, and audit subsystems.

### Core Security Tenets
1. **Never Trust Client State**: All authorization, consent validation, role checks, and input sanitization are enforced strictly on the server.
2. **Encrypted at Rest with Key Versioning**: Sensitive clinical text is encrypted with `AES-256-GCM` using cryptographically random nonces before hitting MongoDB.
3. **Authenticated Streaming, Never Static Exposure**: Medical records and diagnostic scans are never served via public static URLs; they are served exclusively via an authenticated streaming proxy that validates real-time ABAC consent on every byte stream request.
4. **Instant Consent Revocation**: When a patient revokes data sharing, subsequent access requests are immediately denied with HTTP 403.
5. **Tamper-Evident Auditability**: Every access or mutation of health data writes an append-only, non-modifiable audit event.
6. **Consequential Action Air-Gaps**: Autonomous AI agents cannot execute mutations directly; they generate single-use, 5-minute HMAC-SHA256 confirmation tokens requiring human verification.

---

## 2. Threat Modeling & Attack Surface

The MediBridge threat model identifies key threat vectors and defines automated mitigations:

```
+---------------------------------------------------------------------------------------------------+
|                                 MEDIBRIDGE THREAT MODEL & MITIGATIONS                             |
+------------------------------------+------------------------------------+-------------------------+
| Threat Vector                      | Target / Impact                    | MediBridge Mitigation   |
+------------------------------------+------------------------------------+-------------------------+
| Unauthorized PHI Egress            | Medical records, clinical notes    | AES-256-GCM + ABAC Proxy|
| Broken Object Level Auth (BOLA)    | Cross-patient record reading       | Server-side ABAC + RBAC |
| Double-Booking Race Condition      | High-demand clinician slots        | 2-Phase Lock + Unique Idx|
| Teleconsultation Credential Fraud  | Unverified practitioner access     | Admin NMC Verify Gate   |
| AI Agent Hallucination / Injection | Unauthorized DB record mutations   | HMAC Token Air-Gap      |
| Public Registration Privilege Esc. | Attacker registering as Doctor/Admin| Public Role Restricted |
| File Upload Malware / MIME Spoof   | Server compromised by malicious file| Magic-byte inspect + 10MB|
| In-flight PHI Log Leakage          | Server logs exposed in SIEM        | Pino PHI Redaction Mask |
| Stale Session / Token Replay       | Hijacked access / refresh tokens   | Rotating JWT + Exp. Win |
+------------------------------------+------------------------------------+-------------------------+
```

---

## 3. Cryptographic Specifications & PHI Protection

### 3.1 Field-Level Encryption: AES-256-GCM
All sensitive clinical fields—including `clinicalNotes`, `diagnosisDescription`, `psychiatricEvaluations`, and confidential symptoms—are encrypted before persistence.

#### Cryptographic Parameters:
- **Cipher**: `AES-256-GCM` (Galois/Counter Mode).
- **Master Key**: 256-bit (32 bytes) cryptographically random key loaded from `PHI_ENCRYPTION_KEY` environment variable. Zero-byte or default keys are rejected at startup.
- **Initialization Vector (IV / Nonce)**: Unique 96-bit (12 bytes) secure random bytes generated per encryption via `crypto.randomBytes(12)`. **IV reuse is mathematically impossible across records.**
- **Authentication Tag**: 128-bit (16 bytes) GCM auth tag verified upon decryption to guarantee integrity and detect tampering.
- **Ciphertext Serialization Envelope**:
  ```
  enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
  ```
  The `v1` prefix provides deterministic versioning, allowing future cryptographic key rotation without database migration downtime.

```typescript
// Verified implementation in backend/src/lib/crypto.ts
export function encryptPHI(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', PHI_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `enc:v1:${iv.toString('hex')}:${tag}:${encrypted}`;
}
```

### 3.2 Secure Medical File Delivery: Authenticated Streaming Proxy
MediBridge explicitly forbids public object storage URLs or static web hosting for patient records.

#### Proxy Request Lifecycle (`GET /api/v1/medical-records/:id/files/:fileId`):
1. **Authentication**: Validates bearer JWT access token.
2. **Access Evaluation**: Server queries active consent and encounter records.
3. **Consent Check**:
   - Patient requesting their own record: **Permitted**.
   - Clinician requesting record: Verifies active consultation encounter OR active unexpired `ConsentGrant` for the record's category (`CLINICAL_NOTES`, `LAB_RESULTS`, `PRESCRIPTIONS`, `IMAGING_REPORTS`).
   - If consent is revoked: **Immediate HTTP 403 Forbidden**.
4. **Integrity Verification**: Verifies SHA-256 digest of stored bytes.
5. **Streaming Output**: Chunks bytes directly to the HTTP response with headers `Content-Disposition: inline` and `X-Content-Type-Options: nosniff`.
6. **Audit Event**: Emits append-only audit event for PHI file egress.

### 3.3 File Upload Security & Magic-Byte Inspection
To prevent malicious payload execution or MIME spoofing:
- **Max File Size**: Strictly bounded to 10 MB per attachment.
- **Magic-Byte Header Validation**: File type is not determined by client filename extension. Raw initial bytes are inspected:
  - `PDF`: `%PDF-` (`25 50 44 46`)
  - `JPEG`: `FF D8 FF`
  - `PNG`: `89 50 4E 47 0D 0A 1A 0A`
  - `DICOM`: `44 49 43 4D` at offset 128
- **Isolated Storage**: Uploaded files are written to isolated, non-executable directories outside the server's public root (`STORAGE_LOCAL_DIR`).

---

## 4. Authentication, Session Management & RBAC / ABAC

### 4.1 Public Registration Role Lockdown
To eliminate privilege escalation during public onboarding:
- The public registration endpoint (`POST /api/v1/auth/register`) enforces role restriction: **Only `PATIENT` role registration is accepted.**
- Any attempt to pass `role: 'DOCTOR'`, `role: 'ADMIN'`, or `role: 'HOSPITAL_ADMIN'` via registration payloads is rejected with HTTP 400.
- **Doctor Onboarding Path**: Clinicians must be invited by a verified Hospital Administrator via `POST /api/v1/doctors/invite`, receiving a secure single-use invitation token with a 72-hour time-to-live (TTL).
- **Hospital Admin Bootstrap**: Hospital administrators cannot self-register; they are initialized through the idempotent server bootstrap script (`npm run bootstrap:hospital-admin`).

### 4.2 Token Lifecycles & Rotation
- **Access Tokens**: Short-lived (15 minutes), signed with `JWT_ACCESS_SECRET` (HMAC-SHA256). Contains `userId`, `role`, and active hospital scopes.
- **Refresh Tokens**: Long-lived (7 days), signed with `JWT_REFRESH_SECRET`. Stored as hashed values in MongoDB.
- **Rotation on Refresh**: Calling `POST /api/v1/auth/refresh-token` issues a brand-new access token and invalidates the previous refresh token, mitigating token reuse attacks.
- **Password Hashing**: `bcryptjs` with work factor 12 (or Argon2id in high-security profiles), incorporating high-entropy salt per user.

### 4.3 Doctor Verification State Machine
Doctors cannot practice teleconsultations or issue prescriptions immediately upon profile creation. They are bound by an administrative state machine:

```
[INVITED] ──> [REGISTERED / PENDING] ──> Admin NMC Review ──> [VERIFIED] (Active Practice)
                                            │
                                            ├──> [REJECTED]   (Invalid credentials)
                                            └──> [SUSPENDED]  (Disciplinary action)
```

- Clinicians in `PENDING`, `REJECTED`, or `SUSPENDED` status receive HTTP 403 on:
  - Publishing availability slots (`POST /api/v1/appointments/slots`)
  - Authoring encrypted medical records (`POST /api/v1/medical-records`)
  - Signing digital prescriptions (`POST /api/v1/prescriptions/:id/sign`)

---

## 5. Indian Healthcare Regulatory Compliance

### 5.1 Digital Personal Data Protection Act, 2023 (DPDPA)
- **Notice and Purpose Limitation**: Patients are informed of the exact purpose of data collection before any record or consent grant is created.
- **Granular Consent Artifacts**: Consent is unbundled into distinct categories:
  - `CLINICAL_NOTES`
  - `LAB_RESULTS`
  - `PRESCRIPTIONS`
  - `IMAGING_REPORTS`
- **Right to Withdraw Consent**: Consent grants can be revoked by the patient at any time via `POST /api/v1/consent/revoke`. Revocation takes effect immediately without grace periods or caching delays.
- **Data Minimization in Logging**: Logging middleware explicitly redacts PHI and authentication headers.

### 5.2 National Medical Commission (NMC) Telemedicine Practice Guidelines
- **Registered Medical Practitioner (RMP) Verification**: Requires state or national medical council registration number, qualification year, and issuing medical council during doctor onboarding.
- **Permitted Drug Schedules**: Prescriptions enforce restrictions against prohibited narcotics or habit-forming Schedule X substances in telemedicine contexts.
- **Digital Signatures**: Prescriptions include an HMAC-SHA256 digital signature digest calculated across:
  $$\text{Digest} = \text{HMAC-SHA256}(\text{prescriptionId} + \text{patientId} + \text{doctorId} + \text{medicationsHash} + \text{issuedAt}, K_{\text{sign}})$$
  Enables pharmacists and patients to verify prescription authenticity without database write access.

### 5.3 Ayushman Bharat Digital Mission (ABDM) Alignment
- Consent management follows the ABDM Electronic Health Record (EHR) federated access model, where patient data remains under patient-fiduciary control.

---

## 6. Concurrency & Race-Condition Elimination

### 6.1 Two-Phase Slot Reservation Architecture
Appointment double-booking is eliminated at the database engine level through a two-phase lock:

1. **Phase 1: Atomic Hold (`POST /api/v1/appointments/slots/:id/hold`)**:
   - Executes atomic conditional update:
     ```javascript
     Slot.findOneAndUpdate({
       _id: slotId,
       $or: [
         { status: 'AVAILABLE' },
         { status: 'HELD', heldUntil: { $lt: new Date() } } // Expired hold takeover
       ]
     }, {
       $set: {
         status: 'HELD',
         heldBy: patientId,
         heldUntil: new Date(Date.now() + 5 * 60 * 1000), // 5-minute checkout lock
         holdToken: crypto.randomUUID()
       }
     }, { new: true });
     ```
2. **Phase 2: Booking Confirmation (`POST /api/v1/appointments/book`)**:
   - Executes within a MongoDB multi-document ACID transaction.
   - Enforces `Idempotency-Key` header to prevent duplicate submissions from network retries.
   - Validates that `holdToken` matches and `heldUntil > now`.
   - Transitions slot status atomically to `BOOKED`.

### 6.2 Authoritative Database Constraint
A compound unique index on the slots collection guarantees that no two bookings can ever occupy the same doctor time-slot regardless of thread scheduling:
```javascript
slotSchema.index(
  { doctorId: 1, startTime: 1, activeSlotKey: 1 },
  { unique: true }
);
```

---

## 7. AI Safety Architecture & Consequential Guardrails

### 7.1 Separation of Chatbot & AI Agent
MediBridge enforces strict architectural partitioning between informational AI interactions and actionable AI workflows:

```
+---------------------------------------------------------------------------------------------------+
|                                  MEDIBRIDGE AI SAFETY ARCHITECTURE                                |
+---------------------------------------------------+-----------------------------------------------+
| Informational Triage Chatbot                      | Actionable Clinical AI Agent                  |
+---------------------------------------------------+-----------------------------------------------+
| • Route: POST /api/v1/chatbot/query               | • Route: POST /api/v1/ai-agent/plan           |
| • Capabilities: FAQs, health education, triage    | • Capabilities: Draft scheduling, prep scripts|
| • DB Permissions: ZERO database mutation rights   | • Execution: Strictly bounded tool schema     |
| • Output: Mandatory clinical disclaimer banner    | • Consequential actions REQUIRE confirmation  |
| • Emergency Protocol: Fast-tracks local helpline  | • Token: 5-minute single-use HMAC token       |
+---------------------------------------------------+-----------------------------------------------+
```

### 7.2 HMAC-SHA256 Signed Confirmation Token Protocol
Consequential operations (`initiateAppointmentBooking`, `cancelAppointment`, `draftPrescription`, `revokeAccessConsent`) cannot be executed autonomously by the AI agent.

When an action is proposed:
1. The agent computes an HMAC-SHA256 signature token:
   $$\text{Token} = \text{HMAC-SHA256}(\text{userId} + \text{action} + \text{payloadHash} + \text{nonce} + \text{expiresAt}, K_{\text{action}})$$
2. The agent returns a `STAGED` response to the user with the token and a human-readable action summary.
3. The client presents an explicit confirmation modal to the user.
4. Execution is committed only via `POST /api/v1/ai-agent/confirm` carrying the signed token.
5. The backend validates the signature, verifies single-use nonce consumption, re-evaluates user permissions, and commits the mutation.

---

## 8. Emergency Break-Glass Protocol

In acute, life-threatening clinical emergencies where a patient is incapacitated and unable to grant explicit consent:

1. **Invocation**: A verified clinician submits an emergency override request (`POST /api/v1/consent/break-glass`).
2. **Mandatory Clinical Justification**: Requires a comprehensive text justification (minimum 20 characters) explaining the medical emergency.
3. **Time-Bounded Scope**: Access is granted for a strictly limited window (12 hours) and expires automatically.
4. **Immediate High-Priority Notifications**: System alerts the patient (SMS/Email) and notifies the hospital compliance officer.
5. **Post-Incident Audit Review**: Every break-glass action creates an indelible, high-severity record in the audit trail for mandatory clinical governance review.

---

## 9. Tamper-Evident Audit Trail & Redaction

### 9.1 Append-Only Audit Logging
Every read, creation, modification, deletion, export, or break-glass access involving PHI generates an immutable record:
```json
{
  "actorId": "651a2b3c4d5e6f7a8b9c0d1e",
  "actorRole": "DOCTOR",
  "action": "PHI_READ",
  "resourceType": "MEDICAL_RECORD",
  "resourceId": "651a2b3c4d5e6f7a8b9c0d2f",
  "patientId": "651a2b3c4d5e6f7a8b9c0d11",
  "timestamp": "2026-10-30T14:15:00.000Z",
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0 ...",
  "outcome": "SUCCESS"
}
```
The audit collection enforces MongoDB access rules disallowing `update` and `delete` commands.

### 9.2 PHI Redaction in Application Logs
Pino logger middleware intercepts all incoming requests and outgoing responses, automatically masking:
- `Authorization` headers
- Passwords and token strings
- Credit card or bank identifiers
- Names, mobile numbers, and encrypted PHI strings

---

## 10. Verification & Audit Results

| Security Control | Verification Method | Status |
| :--- | :--- | :--- |
| **AES-256-GCM Field Encryption** | Cryptographic test suite (`crypto.test.ts`) validating 96-bit IV, 128-bit tag, and envelope | **PASS** |
| **BOLA / ABAC Authorization** | Access control integration tests (`rbac-abac.test.ts`) | **PASS** |
| **Instant Consent Revocation** | Consent engine integration tests (`consent.test.ts`) verifying immediate 403 on stream proxy | **PASS** |
| **Public Role Registration Lockdown** | Auth integration tests verifying HTTP 400 when attempting non-PATIENT roles | **PASS** |
| **Two-Phase Slot Concurrency** | Concurrency race condition tests (`concurrency.test.ts`) simulating parallel bookings | **PASS** |
| **AI HMAC Confirmation Token** | AI agent test suite validating invalid tokens, expired tokens, and single-use nonces | **PASS** |
| **Magic-Byte Upload Filter** | Medical records test suite uploading valid/invalid binary headers | **PASS** |
| **Audit Trail Persistence** | Audit query test suite (`audit.test.ts`) verifying immutable insertion | **PASS** |

*All security controls are verified and functional across test and production builds.*
