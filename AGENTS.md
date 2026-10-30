# MediBridge: AI Agent & Contributor Guidelines

## 1. Architectural Boundaries & System Structure

MediBridge is a modular monolith healthcare coordination and consultation platform designed for secure patient-doctor interaction, consent-driven health data sharing, and clinician-verified teleconsultations.

### Architectural Rules
- **Stack Separation**: The application is divided into independent workspaces:
  - Frontend (`frontend/`): React 19 + Vite + TypeScript client SPA.
  - Backend (`backend/`): Node.js + Express + TypeScript REST API.
- **Package Manifest Independence**:
  - `frontend/package.json` and `backend/package.json` maintain independent dependencies and build scripts.
  - The root `package.json` provides developer convenience scripts only (via `concurrently`) and **must never** hoist dependencies or act as an npm workspace.
- **Directory Conventions**:
  - Backend modules reside in `backend/src/modules/<module-name>/`.
  - Frontend features reside in `frontend/src/features/<feature-name>/`.
  - Naming Alignment: All entity folders follow plural naming (e.g. `doctors`, `appointments`, `medical-records`, `prescriptions`, `patients`).
  - *Notice on Existing Scaffolding*: The existing `frontend/src/features/patient` folder is scheduled for alignment to `frontend/src/features/patients` in a future approved phase. Do not rename or delete it without authorization. Similarly, `consent` and `doctor-verification` are planned modules not yet created in the directory tree.
- **Inter-Module Communication**:
  - Modules must encapsulate their Mongoose models, controllers, services, schemas, and routes.
  - Inter-module data access must pass through public service methods, never through direct cross-module database mutations.

---

## 2. Security, Compliance & Regulatory Requirements

### Legal Framework (India-Oriented)
MediBridge is designed for Indian healthcare and digital data protection contexts:
- **Digital Personal Data Protection Act, 2023 (DPDPA)**: Governs processing of digital personal and health data. Mandates clear, verifiable, and withdrawable consent, purpose specification, and strict data fiduciary duties.
- **Ayushman Bharat Digital Mission (ABDM) Health Data Management Policy**: Emphasizes federated electronic health record access governed by explicit consent artifacts.
- **National Medical Commission (NMC) Telemedicine Practice Guidelines**: Teleconsultation must verify Registered Medical Practitioner (RMP) credentials. Prescriptions require digital doctor signatures and must adhere to permitted drug schedules.
- *Open Legal Policies*: Exact statutory record retention windows, minor consent thresholds, and specific cross-border transfer requirements are subject to formal legal review before production.

### Data Protection & Cryptography (AES-256-GCM)
- Sensitive medical fields (clinical notes, psychiatric evaluations, diagnosis descriptions) must be encrypted at rest using AES-256-GCM before writing to MongoDB.
- Cryptographic specifications:
  - Algorithm: `AES-256-GCM`.
  - Nonce/IV: Unique 96-bit (12-byte) cryptographically secure initialization vector per encryption via `crypto.randomBytes(12)`. IV reuse is strictly forbidden.
  - Auth Tag: 128-bit authentication tag verified on decryption to ensure integrity.
  - Ciphertext envelope format: `enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>`. The version prefix (`v1`) enables future key rotation without data loss.
  - Master key `PHI_ENCRYPTION_KEY` must be loaded from server environment variables; never hardcode or commit keys.

### Medical File Delivery: Authenticated Streaming Proxy
- Medical records, scans, and lab reports must reside in private storage (restricted local filesystem or private S3 bucket) and must never be served statically from a public web root.
- **Primary Access Pattern**: Files are served exclusively through an authenticated backend streaming proxy endpoint (`GET /api/v1/medical-records/:id/files/:fileId`).
  - The endpoint authenticates the user, checks real-time ABAC consent, verifies file integrity, and streams bytes directly.
  - Revocation is immediate: once consent is withdrawn, subsequent stream requests receive `403 Forbidden`.
  - *Known Limitation*: An active HTTP byte stream already in flight cannot be interrupted mid-chunk without socket termination middleware. Pre-signed direct URLs are reserved only for non-sensitive public assets.
- **Upload Validation**: All uploads must be validated via magic-byte inspection (detecting true MIME headers for PDF/JPEG/PNG/DICOM), enforce a 10MB maximum limit, and pass through an antivirus scanning pipeline hook before becoming available.

### Tamper-Evident Audit Logging
- Every read, update, delete, export, or emergency break-glass action involving Protected Health Information (PHI) must generate an append-only audit record:
  `{ actorId, actorRole, action, resourceType, resourceId, patientId, timestamp, ipAddress, userAgent, outcome }`.
- Application database users must be restricted to `insert` and `find` privileges on the audit collection (no `update` or `delete`).
- Sensitive data minimization: Application loggers (Pino) must automatically redact passwords, tokens, cookies, authorization headers, and clinical text to prevent PHI leakage into server logs.

---

## 3. Consent & Authorization Architecture

### Hybrid Consent Model
Access to patient records is evaluated through a hybrid model combining **category permissions** and **encounter scopes**:
1. **Categories**: `CLINICAL_NOTES`, `LAB_RESULTS`, `PRESCRIPTIONS`, `IMAGING_REPORTS`.
2. **Encounter Scope**: Clinician access is restricted to the active consultation lifecycle (from appointment booking through a defined post-consultation follow-up window, proposed as 30 days pending clinical policy approval).
3. **Historical / Out-of-Encounter Access**: Requires an explicit, active `ConsentGrant` created by the patient.
4. **Server-Side Evaluation**:
   Authorization must be evaluated on every request. Never rely on frontend UI hiding:
   ```typescript
   // Evaluated server-side on every medical record request
   const canAccess =
     isAuthenticated(user) &&
     isVerifiedDoctor(user) &&
     (hasActiveEncounter(user, patient, record.encounterId) || hasConsentGrant(user, patient, record.category)) &&
     !isConsentRevoked(user, patient, record.category) &&
     !isConsentExpired(grant);
   ```
5. **Immediate Revocation**:
   - Consent revocation must be instantaneous. When revoked, the revocation status is updated immediately and invalidates all active session caches. Revoked consent cannot be bypassed via secondary permission paths.
6. **Emergency Break-Glass**:
   - Verified clinical personnel can override access controls only during acute, life-threatening emergencies.
   - Requires entering a mandatory clinical justification text string.
   - Dispatches immediate high-priority audit alerts to the compliance officer and patient. Access is time-bounded (proposed 12-hour automated expiry) and subject to post-incident clinical governance review.

---

## 4. Multi-Provider AI Architecture & Safety Guardrails

### Provider-Independent Adapter Pattern
All AI interactions must route through the `IAIProviderAdapter` abstraction:
- Supported providers: Google Gemini, OpenAI, Anthropic, and a Mock adapter for offline testing.
- Switching providers is controlled via the `AI_PROVIDER` environment variable without modifying domain logic.
- Resiliency: Request timeouts (15s for chat, 30s for agent), max 2 retries with exponential backoff on 429/503 errors.
- Safe Failure: Fail closed. If AI services fail, the core clinic platform remains 100% operational, and the UI displays a non-clinical fallback notice.
- PHI Protection: Direct identifiers (name, phone, national ID) are scrubbed before prompt submission. Production requires verified Zero Data Retention (ZDR) agreements.

### Chatbot Boundaries
- Purely conversational, triage, and navigation assistance.
- **ZERO database mutation rights.** It has no tools to create, update, or delete records.
- Mandatory clinical disclaimer delivered with every response:
  > *"MediBridge AI Assistant provides informational guidance only and is not a substitute for professional medical judgment, diagnosis, or treatment. In medical emergencies, immediately contact local emergency services."*
- Prohibited from presenting as a licensed clinician or prescribing medication.

### AI Agent Boundaries & Consequential Actions
- Tool-augmented agent operating strictly under the authenticated user's session and permissions.
- Every tool parameter is validated using strict Zod schemas with regex constraints.
- **Consequential Actions** (`initiateAppointmentBooking`, `cancelAppointment`, `draftPrescription`, `revokeAccessConsent`):
  - Cannot be executed automatically by the agent.
  - The agent produces an uncommitted stage response containing an HMAC-SHA256 signed confirmation token:
    $$\text{Token} = \text{HMAC-SHA256}(\text{userId} + \text{action} + \text{resourceId} + \text{payloadHash} + \text{nonce} + \text{expiresAt}, K_{\text{auth}})$$
  - Token validity: 5 minutes. Enforced single-use via server-side nonce verification to prevent replay attacks.
  - Re-evaluates authorization, doctor verification, and database state at execution time before committing.
- **Prescription Authorization Guard**:
  - The AI agent may **only** draft prescriptions (`draftPrescription`) in status `DRAFT_PENDING_DOCTOR_SIGNATURE`.
  - Only a verified Registered Medical Practitioner can review, digitally sign, and issue the prescription.

---

## 5. Appointment Concurrency & Concurrency Controls

- **Authoritative Database Constraint**: A compound unique index on `{ doctorId: 1, startTime: 1 }` in the slots collection guarantees at the database level that no two bookings can occupy the same slot.
- **Two-Phase Slot Hold & Atomic Confirmation**:
  1. *Atomic Hold*: Uses `findOneAndUpdate` with a conditional query (`status: 'AVAILABLE'` or expired hold `heldUntil < now`) to establish a 5-minute checkout lock with a unique `holdToken`.
  2. *Booking Confirmation*: Executed within a MongoDB multi-document transaction with an `Idempotency-Key` header, validating the hold token and active timeout before transitioning to `BOOKED`.
- **Testing Requirement**: All concurrency workflows must have parallel integration tests simulating simultaneous booking requests to verify that exactly one succeeds and all others receive `409 Conflict`.

---

## 6. Coding Standards & Change-Control Protocol

### Development Rules
- **Inspect Before Editing**: Always inspect actual files before modifying them. Never assume a file exists or has specific contents without checking.
- **Preserve Unrelated Content**: Do not delete existing comments, docstrings, or unrelated configurations.
- **No Hallucinated Features**: Never claim a feature exists, is implemented, or has passing tests unless actual code and passing tests exist in the repository.
- **Standardized API Responses**:
  - Success: `{ "success": true, "data": <payload> }`
  - Error: `{ "success": false, "error": { "code": string, "message": string, "details": any, "requestId": string } }`
- **TypeScript Strict Mode**: All code must compile under `strict: true` with zero `any` types in domain logic.

### Verification Checklist Before Completing Tasks
1. Run linting and type-checking across frontend and backend.
2. Run unit and integration test suites.
3. Verify that no real secrets, passwords, or all-zero encryption keys have been introduced.
4. Verify that `.gitignore` prevents committing `.env`, coverage reports, and local upload files.
5. Report verification results accurately, distinguishing tested code from pending items.
