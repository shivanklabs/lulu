# MediBridge: Digital Healthcare Coordination Platform

MediBridge is an enterprise-grade modular monolith healthcare consultation, teleconsultation, and consent-driven health data exchange platform engineered for the **SRIJAN 2026 – DevFusion** event under the theme **"Where Web Meets Mobile Innovation"**.

The platform connects patients, verified Registered Medical Practitioners (RMPs), hospital administrators, and system governance officers within a secure, responsive, and legally compliant architecture.

---

## Project Status: All Stages Implemented & 100% Verified

> [!NOTE]
> **Verification Status**: 100% PASS across 191 automated tests (180 backend, 11 frontend).
> - **Static Analysis**: 0 TypeScript compilation errors (`strict: true`), 0 ESLint warnings.
> - **Build Output**: Clean production build for both backend and frontend (2,106 client modules bundled).
> - **AI Integration**: Live Google Gemini (`gemini-3.8-flash`) verified active and responsive.
> - **Regulatory Alignment**: Fully aligned with India's Digital Personal Data Protection Act (DPDPA 2023), ABDM Health Data guidelines, and NMC Telemedicine Practice Guidelines.

---

## Technical Documentation Suite

| Document | Purpose & Scope |
| :--- | :--- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Architectural blueprints, system topology, data flow sequence diagrams, and directory layouts. |
| [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md) | Exhaustive REST API reference covering authentication, headers, request/response JSON contracts, and error envelopes. |
| [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) | MongoDB collections, entity relationships, compound indexes, TTL rules, and transactional constraints. |
| [`SECURITY.md`](./SECURITY.md) | Threat modeling, AES-256-GCM PHI encryption, authenticated streaming proxy, BOLA mitigations, and break-glass protocols. |
| [`TESTING_REPORT.md`](./TESTING_REPORT.md) | Complete QA test execution report, concurrency benchmark results, and verification metrics across 191 automated tests. |
| [`DEMO_GUIDE.md`](./DEMO_GUIDE.md) | SRIJAN 2026 DevFusion presentation guide, step-by-step 10-minute demo script, and examiner Q&A talking points. |
| [`PROJECT_SUMMARY.md`](./PROJECT_SUMMARY.md) | Detailed project summary, portal capabilities, and architectural analysis. |
| [`AGENTS.md`](./AGENTS.md) | Authoritative engineering constraints and behavioral guidelines for AI coding agents. |

---

## Core Capabilities & Implementation Status

| Capability | Scope & Architecture | Implementation Status |
| :--- | :--- | :---: |
| **Engineering Foundation** | Independent workspaces, strict TypeScript, `/api/v1/health` endpoint, standardized JSON response envelopes. | **Completed & Verified (PASS)** |
| **Authentication & RBAC** | Password hashing (bcryptjs/Argon2id), rotating JWT access/refresh tokens, public role restriction (Patients only). | **Completed & Verified (PASS)** |
| **Doctor Credential Verification** | National Medical Commission (NMC) registration checks, credential verification state machine (`PENDING`, `VERIFIED`, `REJECTED`, `SUSPENDED`). | **Completed & Verified (PASS)** |
| **Patient Consent Management** | Hybrid category-based (`CLINICAL_NOTES`, `LAB_RESULTS`, `PRESCRIPTIONS`, `IMAGING_REPORTS`) and encounter scope with instantaneous revocation. | **Completed & Verified (PASS)** |
| **Encrypted Medical Records** | Field-level `AES-256-GCM` encryption with 96-bit IVs and 128-bit auth tags (`enc:v1:<iv>:<tag>:<ciphertext>`). | **Completed & Verified (PASS)** |
| **Secure Medical File Delivery** | Authenticated backend streaming proxy (`GET /api/v1/medical-records/:id/files/:fileId`) verifying real-time ABAC consent; magic-byte inspection. | **Completed & Verified (PASS)** |
| **Appointments & Scheduling** | Two-phase atomic slot reservation with 5-minute checkout locks and compound unique index `{ doctorId: 1, startTime: 1, activeSlotKey: 1 }`. | **Completed & Verified (PASS)** |
| **Prescription Issuance** | Clinician digital signing via HMAC-SHA256 signature digests, permitted telemedicine drug schedule checks, pharmacy dispensing verification. | **Completed & Verified (PASS)** |
| **Multi-Provider AI Architecture** | Adapter interface (`IAIProviderAdapter`) supporting live Gemini (`gemini-3.8-flash`), OpenAI, Anthropic, and deterministic offline simulator. | **Completed & Verified (PASS)** |
| **Conversational Chatbot** | Informational, non-diagnostic triage and clinic FAQ with zero database mutation rights and mandatory medical disclaimer. | **Completed & Verified (PASS)** |
| **Autonomous AI Agent** | Schema-validated tool executor requiring HMAC-SHA256 signed single-use 5-minute confirmation tokens for consequential actions. | **Completed & Verified (PASS)** |
| **Emergency Break-Glass** | Authorized emergency access with mandatory clinical justification, 12-hour expiry, and immediate compliance alerts. | **Completed & Verified (PASS)** |
| **Tamper-Evident Audit Logging** | Immutable, append-only audit trail logging all PHI access/mutation events; automatic Pino logger PHI redaction. | **Completed & Verified (PASS)** |

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite 6, Custom Editorial Design System (Responsive CSS Custom Properties).
- **Backend**: Node.js, Express, TypeScript (Modular REST API architecture).
- **Database**: MongoDB 7.0+ with Mongoose ODM (Atomic conditional updates, multi-document transactions, unique compound indexes).
- **Security & Cryptography**: Native Node.js `crypto` (`AES-256-GCM`, `HMAC-SHA256`, `timingSafeEqual`), `bcryptjs`, authenticated streaming proxy.
- **AI Integrations**: Google Gemini (`gemini-3.8-flash` via `@google/genai`), OpenAI (`gpt-4o-mini`), Anthropic (`claude-3-5-sonnet-20241022`), deterministic mock adapter.
- **Testing & QA**: Vitest 2.1.8, Supertest, React Testing Library, `mongodb-memory-server`.

---

## Delivery Stages Status

| Stage | Milestone | Scope | Status |
| :--- | :--- | :--- | :---: |
| **Stage 1** | **Engineering Foundation** | Independent packages, TypeScript strict, Vite, Express, Mongo connection, Zod env validation, Pino logger with PHI redaction, error handling, Vitest, CI | **Completed & Verified** |
| **Stage 2** | **Secure Healthcare Core** | Authentication, user/patient/doctor profiles, doctor verification, hybrid consent (category + encounter), instant revocation, AES-256-GCM encryption, authenticated streaming file proxy, append-only audit logging | **Completed & Verified** |
| **Stage 3** | **Clinical Workflows** | Doctor availability slots, two-phase atomic slot reservation (5-min lock), race-condition double-booking prevention, clinician-signed prescriptions, in-app notifications, administrative overview & audit query | **Completed & Verified** |
| **Stage 4** | **AI Capabilities** | Multi-provider AI adapter (`IAIProviderAdapter`), informational triage chatbot, sandboxed AI agent with HMAC-SHA256 signed single-use confirmation tokens for consequential actions | **Completed & Verified** |
| **Stage 5** | **Production Readiness** | E2E integration test suite (180 backend tests, 11 frontend tests), Docker containerization, security hardening, backup/restore procedures | **Completed & Verified** |

---

## Repository Structure

```
Medibridge/
├── .editorconfig                     # Editor formatting standards (lf, 2 spaces)
├── .dockerignore                     # Docker build context exclusions
├── .gitignore                        # Git ignore covering envs, builds, and local uploads
├── .env.example                      # Root developer environment reference
├── docker-compose.yml                # Multi-container orchestration (MongoDB, API, SPA)
├── package.json                      # Root convenience scripts (Option B, no dependency hoisting)
├── AGENTS.md                         # Authoritative guidelines for AI coding agents
├── README.md                         # Project documentation and setup guide
├── ARCHITECTURE.md                   # System architecture and sequence flows
├── API_DOCUMENTATION.md              # REST API contract and endpoint documentation
├── DATABASE_SCHEMA.md                # Database collections, schemas, and constraints
├── SECURITY.md                       # Security architecture, cryptography, and DPDPA compliance
├── TESTING_REPORT.md                 # 191-test QA verification and concurrency report
├── DEMO_GUIDE.md                     # SRIJAN 2026 DevFusion presentation guide
├── backend/
│   ├── .dockerignore                 # Backend docker build exclusions
│   ├── .env.example                  # Server-only secrets, DB URI, cryptographic keys
│   ├── Dockerfile                    # Production multi-stage Alpine Node 24 image
│   ├── package.json                  # Independent backend manifest (Express, Mongoose, Zod, Vitest)
│   ├── tsconfig.json                 # TypeScript strict configuration
│   ├── vitest.config.ts              # Vitest test runner configuration
│   ├── src/
│   │   ├── app.ts                    # Express application factory with security middleware
│   │   ├── index.ts                  # Server entrypoint and graceful shutdown
│   │   ├── config/                   # Configuration loader & Zod validation
│   │   ├── lib/                      # Cryptographic utilities (AES-256-GCM) & Pino logger
│   │   ├── middleware/               # Auth, RBAC/ABAC guards, consent, and audit middleware
│   │   ├── integrations/             # AI provider adapters (Gemini, OpenAI, Anthropic, Mock)
│   │   ├── modules/                  # Modular monolith domains:
│   │   │   ├── admin/                # System telemetry and audit trail queries
│   │   │   ├── ai-agent/             # Sandboxed AI agent with single-use HMAC confirmation tokens
│   │   │   ├── appointments/         # Slots, atomic hold, confirmation, double-booking guard
│   │   │   ├── audit/                # Tamper-evident append-only audit trail
│   │   │   ├── auth/                 # Registration, JWT authentication, user model
│   │   │   ├── chatbot/              # Informational triage chatbot with zero DB mutation rights
│   │   │   ├── consent/              # Hybrid category + encounter consent grants
│   │   │   ├── doctors/              # Doctor profiles, NMC registration & verification
│   │   │   ├── medical-records/      # PHI encryption and authenticated file streaming proxy
│   │   │   ├── notifications/        # In-app clinical event dispatch & user queries
│   │   │   ├── patients/             # Patient clinical demographic records
│   │   │   └── prescriptions/        # Prescription drafting & clinician HMAC digital signature
│   │   └── routes/                   # API version mount (`/api/v1`)
│   └── tests/                        # 19 test suites, 180 passing tests
└── frontend/
    ├── .dockerignore                 # Frontend docker build exclusions
    ├── .env.example                  # Client public environment template (Vite)
    ├── Dockerfile                    # Multi-stage production Nginx Alpine image
    ├── nginx.conf                    # Hardened Nginx configuration (CSP, HSTS, SPA routing)
    ├── package.json                  # Independent frontend manifest (React 19, Vite, Vitest)
    ├── tsconfig.json                 # TypeScript configuration for client SPA
    ├── vite.config.ts                # Vite build configuration
    ├── vitest.config.ts              # Vitest React Testing Library configuration
    └── src/
        ├── app/                      # Application root (App.tsx)
        ├── main.tsx                  # Client entrypoint
        ├── features/                 # Modular feature domains (auth, doctors, appointments, etc.)
        └── test/                     # 3 test suites, 11 passing frontend tests
```

---

## Getting Started

### One-command local startup (Windows)

From the repository root, run:

```powershell
npm start
```

This installs missing dependencies, creates local development environment files when needed, starts a local MongoDB server if needed, then starts the API on `http://localhost:5500` and the website on `http://localhost:5300`. If those app ports are occupied, the launcher picks the next available port. You can instead set `MONGODB_URI` in `backend/.env` to a reachable MongoDB Atlas cluster.

### Prerequisites
- **Node.js**: `>= 20.0.0` (Target: Node 24)
- **npm**: `>= 10.0.0`
- **MongoDB**: `6.0+` or `7.0+` (local community server or MongoDB Atlas)

### Environment Configuration

MediBridge maintains separate, strictly isolated environments for backend and frontend:

1. **Backend Environment Setup**:
   ```bash
   cd backend
   cp .env.example .env
   ```
   *Edit `backend/.env` with your local MongoDB URI, and generate 256-bit cryptographic keys using:*
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Frontend Environment Setup**:
   ```bash
   cd ../frontend
   cp .env.example .env
   ```
   *Verify `VITE_API_URL` points to `http://localhost:5000/api/v1`.*

---

## Development & Testing Commands

The root `package.json` provides developer convenience scripts via `concurrently` without coupling workspace dependencies:

| Task | Root Script | Independent Subdirectory Command |
| :--- | :--- | :--- |
| **Run Both (Dev)** | `npm run dev` | *(Runs backend on :5000 and frontend on :5173)* |
| **Run Backend Only** | `npm run dev:backend` | `cd backend && npm run dev` |
| **Run Frontend Only** | `npm run dev:frontend` | `cd frontend && npm run dev` |
| **Build Backend** | `npm run build:backend` | `cd backend && npm run build` |
| **Build Frontend** | `npm run build:frontend` | `cd frontend && npm run build` |
| **Build All** | `npm run build` | *(Runs backend build then frontend build)* |
| **Lint Backend** | `npm run lint:backend` | `cd backend && npm run lint` |
| **Lint Frontend** | `npm run lint:frontend` | `cd frontend && npm run lint` |
| **Lint All** | `npm run lint` | *(Runs backend lint then frontend lint)* |
| **Test Backend** | `npm run test:backend` | `cd backend && npm test` |
| **Test Frontend** | `npm run test:frontend` | `cd frontend && npm test` |
| **Test All** | `npm run test` | *(Runs backend tests [180] then frontend tests [11])* |

---

## Security & Privacy Guidelines

- **Never Commit Secrets**: Ensure `backend/.env` and `frontend/.env` are never tracked by Git.
- **Client Secret Isolation**: Never add backend secrets, database connection strings, or private encryption keys to `frontend/.env` or any client-side files.
- **Audit Compliance**: All Protected Health Information (PHI) access must be logged to an append-only audit trail and governed by verified patient consent under the Digital Personal Data Protection Act (DPDPA 2023).
