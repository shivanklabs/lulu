# MediBridge — Role Dashboards Report (Patient · Doctor · Hospital)

Date: 2026-10-30 · Scope: Step 3 (implement) + Step 4 (test & report) of the approved dashboards plan.

> Note: the requested `PROJECT_SPEC.md` does not exist in the repository. `AGENTS.md`, `AUDIT_REPORT.md` and the approved plan were used as the spec.
> All test numbers below come from commands **actually run on this machine** (2026-10-30). Nothing here was run against your real MongoDB Atlas.

---

## 1. Kya bana (summary)

| Area | Result |
|---|---|
| Roles | `PATIENT`, `DOCTOR`, `HOSPITAL` (= hospital_admin, decision #1). `ADMIN` = platform compliance admin, unchanged |
| Public signup | **Only PATIENT** (body mein koi aur role → `400`). Pehle ADMIN/HOSPITAL bhi ban jaate the (critical audit finding — fixed) |
| Hospital admin | CLI `npm run bootstrap:hospital-admin`. Values sirf `.env` (`BOOTSTRAP_*`) se aati hain. Idempotent. Password kabhi print nahi hota |
| Doctor onboarding | Hospital admin invite karta hai → one-time token (sirf SHA-256 hash store hota hai, 72h expiry) → doctor `/accept-invite` pe password set karta hai |
| Server-side checks | Har request pe DB se `isActive` + `role` + `hospitalId` dobara padhe jaate hain (deactivation turant lagta hai). Har dashboard router pe `requireRole` + ownership scope (`loadActor`) |
| Ownership | Patient → sirf apne appointments; Doctor → sirf apne; Hospital admin → sirf apne hospital ke. Doosre ka resource → `404` (existence leak nahi hota) |
| Double booking | Unique sparse index `activeSlotKey` (`doctorId|startTime`) active bookings (PENDING/CONFIRMED/SCHEDULED) pe → `409`. Legacy slot flow bhi isi index se guarded hai |
| Status rules | Ek hi jagah (`booking.service.ts → allowedActions`) aur server pe enforce. Completed / no-show / cancelled final hain. Legacy `/appointments/:id/cancel` bhi ab completed ko cancel nahi karta |
| Fake data | Naye dashboards mein koi fixture/demo data nahi. Saare numbers MongoDB queries se. Data na ho to empty state + CTA |
| Design | Original layout, spec ke teal tokens (`#0B7A75`, `#E7F6F4`, `#202B35`, `#FFFFFF`) `frontend/src/styles/dashboard-tokens.css` mein. Har text/background pair ka WCAG contrast **calculate karke** verify kiya (sab ≥ 4.5:1) |

### Fake / fabricated data jo is kaam ke dauran hataya
- Register pe default `bloodGroup: 'O+'` aur `dateOfBirth: '2000-01-01'` (backend) — ab sirf jo patient de wahi store hota hai.
- Patient lookup mein missing blood group pe `'O+'` dikhana → ab `'Not recorded'`.
- `/auth/me` ka hardcoded HOSPITAL profile ("Metropolitan Clinical Health Network…") → ab real `Hospital` document.
- Legacy login page: login fail hone pe **fake demo token + fake user** se sign-in → hataya, ab error dikhta hai. Legacy register form ka default phone `'+91 98100 00000'` aur default `O+` bhi hataye.
- `.env.example` (root + backend) mein pada **Gemini API key** placeholder se replace kiya. ⚠️ Key ko **Google Cloud console mein rotate karein** — woh file mein thi.

---

## 2. Models (existing ko extend kiya, duplicate nahi)

| Model | File | Change |
|---|---|---|
| `User` | `backend/src/modules/users/user.model.ts` | `+ name`, `+ hospitalId`, `+ isTestAccount`, `+ inviteTokenHash/inviteExpiresAt` (`select:false`) |
| `Hospital` *(new)* | `backend/src/modules/hospitals/hospital.model.ts` | `name, address, phone, email, departments[{name,isActive}], isVerified, timestamps` |
| `Doctor` (= DoctorProfile) | `backend/src/modules/doctors/doctor.model.ts` | `+ hospitalId, departmentId, phone, qualifications[], consultationModes[]`. `licenseNumber` = registration number. Index `{hospitalId, departmentId, verificationStatus}` |
| `Availability` *(new)* | `backend/src/modules/appointments/availability.model.ts` | `WEEKLY` (weekday + HH:mm window + slotMinutes) aur `LEAVE` (date). Times IST mein. Unique leave per doctor/date |
| `Appointment` | `backend/src/modules/appointments/appointment.model.ts` | Status mein `PENDING`, `CONFIRMED` add. `+ hospitalId, mode, reason (≤200), activeSlotKey, confirmedAt, completedAt`. `slotId` ab optional (unique **sparse**) |
| `Patient` | `backend/src/modules/patients/patient.model.ts` | `dateOfBirth` optional, `bloodGroup` ka default hataya. Koi naya medical field **nahi** |

Field naming note: plan mein `date/slotStart` likha tha; existing `startTime/endTime` (UTC) reuse kiye hain, aur API IST `date` + `startTime` (`HH:mm`) return karti hai.

---

## 3. API endpoints (prefix `/api/v1`, response `{ success, data }` / `{ success:false, error:{code,message,details,requestId} }`)

**Auth** (`authRateLimiter` 30/15 min, `/me` ko chhod ke)
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Patient only, Zod validation, password ≥10 + letter + number |
| POST | `/auth/login` | `data.user` ab return hota hai (legacy flat fields bhi); inactive account → `403` |
| POST | `/auth/accept-invite` | `{ token, password }` |
| POST | `/auth/refresh` | Ab account active/role bhi check karta hai |
| GET | `/auth/me` | Real hospital profile for HOSPITAL |

**Catalog** (PATIENT only)
| GET | `/catalog/hospitals` · `/catalog/hospitals/:id/departments` · `/catalog/doctors?hospitalId&departmentId` · `/catalog/doctors/:id/slots?date=YYYY-MM-DD` |
|---|---|
Sirf verified hospitals aur VERIFIED + active doctors. Slots = weekly grid − leave − booked − past (60 din ka window).

**Patient** (`requireRole('PATIENT')` + ownership)
| Method | Path |
|---|---|
| GET | `/patient/summary` |
| GET | `/patient/appointments?scope=upcoming\|history&page&limit` |
| POST | `/patient/appointments` — `bookingRateLimiter` (20/15 min) + `Idempotency-Key` → `201` (replay `200`), slot gone `409` |
| POST | `/patient/appointments/:id/cancel` |
| GET/PATCH | `/patient/profile` |

**Doctor** (`requireRole('DOCTOR')`; actions ke liye VERIFIED zaroori)
| Method | Path |
|---|---|
| GET | `/doctor/summary`, `/doctor/appointments?scope=today\|upcoming\|pending\|history` |
| POST | `/doctor/appointments/:id/confirm` · `decline` (reason required) · `cancel` (reason required) · `complete` · `no-show` |
| GET | `/doctor/availability` |
| PUT | `/doctor/availability/weekly` — booked slot hatne pe `409 AFFECTS_BOOKINGS` + affected list; `confirm:true` se save (bookings auto-cancel **nahi** hoti) |
| POST/DELETE | `/doctor/availability/leave`, `/doctor/availability/leave/:id` (same warning) |
| GET/PATCH | `/doctor/profile` (verification, name, registration read-only) |

**Hospital** (`requireRole('HOSPITAL')`, sab `hospitalId` scoped)
| Method | Path |
|---|---|
| GET | `/hospital/stats` — `countDocuments` aggregates only |
| GET/POST | `/hospital/doctors` (POST = invite) |
| POST | `/hospital/doctors/:id/invite` (naya link) |
| PATCH | `/hospital/doctors/:id/verification` (PENDING/VERIFIED/REJECTED), `/hospital/doctors/:id/active` (bookings hone pe `409` jab tak `confirm:true`) |
| GET/POST/PATCH | `/hospital/departments`, `/hospital/departments/:id` (doctors wala department deactivate → `409`) |
| GET | `/hospital/appointments?date&doctorId&status&q&page` — patient ka naam dikhta hai, reason/contact **nahi** |
| GET/PATCH | `/hospital/profile` |

Status codes used: `400` validation, `401` no/expired/stale token, `403` wrong role / unverified / inactive, `404` not found or not owned, `409` conflict / invalid transition / affects bookings, `429` rate limit.

**Status transition rules** (server-enforced)
```
PENDING   → CONFIRMED (doctor, start se pehle) | CANCELLED (patient, ya doctor decline + reason)
CONFIRMED → COMPLETED / NO_SHOW (doctor, start ke baad) | CANCELLED (patient ≥ PATIENT_CANCEL_CUTOFF_HOURS=2 pehle; doctor + reason)
COMPLETED / NO_SHOW / CANCELLED → final (409 INVALID_TRANSITION)
```
Doctor ke confirm karne pe 30-din ka encounter `ConsentGrant` banta hai (AGENTS.md §3). Pehle yeh booking pe hi ban jaata tha.

---

## 4. Frontend

- Routing: `react-router-dom@7.18.3` add kiya (decision #2). `/login`, `/register`, `/accept-invite`, `/dashboard/patient|doctor|hospital/*`. Baaki saare URLs existing app render karte hain (unchanged).
- Code: `frontend/src/features/dashboards/{shared,auth,patient,doctor,hospital}`.
- Shared layout: desktop pe sidebar; mobile/tablet pe hamburger drawer (Esc se close, focus trap, focus wapas button pe). Skip link, har control pe visible `:focus-visible` ring, `prefers-reduced-motion` respect hota hai.
- Har list mein loading skeleton, empty state + CTA, aur error state + **Retry**.
- Status hamesha icon + text + colour.
- Forms: `<label>`, `aria-describedby` se inline errors, submit ke dauraan button disabled. Booking mein `Idempotency-Key` bhi lagta hai.
- Patient: summary, upcoming list + cancel, history (pagination), booking wizard (hospital → department → verified doctor → slot → confirm, request PENDING), profile, 112 disclaimer.
- Doctor: today + pending (confirm/decline), tabs (upcoming/pending/past), complete/no-show, weekly schedule + leave with booked-slot warning dialog, profile (verification read-only).
- Hospital: 5 real metrics, verification queue, doctors (invite link shown once, verify/reject + **"Registration check is manual — NMC/State Council register pe khud check karein"** notice + checkbox), deactivate/reactivate, departments, appointments (date/doctor/status/search + pagination), profile.

---

## 5. Test results (actually run)

Environment: Windows 10, Node, local `mongod 6.0.29` via `MONGOMS_SYSTEM_BINARY` (memory-server ka 7.0.24 download stalled tha). Pehle 9 test files mongod start timeout (10s) se fail ho rahi thi; `backend/tests/setup/mongo-launch-timeout.ts` launch window 45s karta hai (sirf test infra).

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | ✅ 0 errors |
| Backend ESLint | ✅ 0 problems |
| Backend Vitest (full) | **177 passed, 3 failed (180)**. 3 failures **pre-existing** hain aur audit baseline mein bhi the: `chatbot.test.ts:50` (`fallback` vs `mock`) aur `gemini-adapter.test.ts:302, 308`. Wajah `env.ts` ka Gemini auto-override + local `backend/.env` ki key; yeh dashboards se unrelated hai aur maine nahi chheda |
| New `tests/integration/dashboards.test.ts` | ✅ **39/39** |
| Frontend typecheck | ✅ 0 errors. ⚠️ Pehle `npm run typecheck` (`tsc --noEmit` on a `files: []` tsconfig) **kuch bhi check nahi karta tha**; ab `-p tsconfig.app.json` pe chalta hai |
| Frontend ESLint | ✅ 0 errors, 5 warnings (pre-existing, public site files) |
| Frontend Vitest | ✅ **46/46** (35 existing + 11 new `src/test/Dashboards.test.tsx`) |
| Frontend `npm run build` | ✅ (pre-existing >500 kB chunk warning, three.js) |

**`dashboards.test.ts` mein covered scenarios:**
- Login per role (bootstrap admin, invited doctor, registered patient, seed script users) → `data.user.role` sahi.
- Public register as DOCTOR / HOSPITAL / ADMIN → `400`, DB mein koi user nahi bana. Weak password / bad email → `400` with field details.
- Galat role se doosre dashboard ki API (8 combinations) → `403`; bina token → `401`.
- Doosre patient ka appointment cancel → `404`, uski list mein nahi dikhta. Doosre hospital ka admin → doctor list khaali, verify → `404`. Legacy ADMIN route se hospital doctor verify → `403`.
- Unverified doctor: availability publish → `403 DOCTOR_NOT_VERIFIED`, catalog mein nahi dikhta.
- Same slot dobara → `409`. **5 parallel requests ek slot pe → exactly 1 × 201, 4 × 409.** Same Idempotency-Key replay → `200` same booking.
- `PENDING → CONFIRMED → COMPLETED` (after start); confirm twice → `409`; complete before start → `409`; no-show after start ✅.
- Cancel rules: confirmed cutoff (2h) ke andar patient cancel → `409`; completed cancel (patient, doctor, legacy route) → `409`; decline bina reason → `400`; cancel ke baad slot wapas available.
- Schedule change / leave jo booking hata de → `409 AFFECTS_BOOKINGS` with affected ids.
- Deactivate doctor with bookings → `409`, `confirm` ke baad → doctor token `403 ACCOUNT_INACTIVE`, catalog se gayab.
- Booking rate limit → `429`. Invalid id → `404` (500 nahi). Empty states: summary zeros, empty lists, stats zeros.
- Seed script: Atlas-style URI refuse; localhost / `*test*` DB allow; har user `isTestAccount: true`.

**Live smoke test (real server + CLI scripts, throwaway mongod on port 27999, test DB):**
`bootstrap:hospital-admin` (missing vars → refuse, sirf field names print; create; re-run idempotent), `seed:test-users` (Atlas URI → refuse; local → 3 users), server `src/index.ts` start, curl: 3 role logins ✅, cross-role `403` ✅, no-token `401` ✅, register as DOCTOR `400` ✅, 12 slots ✅, booking `PENDING` ✅, duplicate `409` ✅, confirm ✅, early complete `409` ✅, stats real ✅, cancel ✅, error JSON shape with `requestId` ✅.
`db:sync-dashboard-indexes` against a DB with the **legacy** non-sparse `slotId_1` → rebuilt as unique+sparse, `activeSlotKey_1` created ✅.

---

## 6. Kaise chalayein

```bash
# backend/.env mein BOOTSTRAP_* aur TEST_USERS_PASSWORD bharein (.env.example dekhein)
cd backend
npm run db:sync-dashboard-indexes     # EXISTING database pe ek baar zaroor (neeche dekhein)
npm run bootstrap:hospital-admin      # pehla hospital + hospital admin
npm run seed:test-users               # sirf local/test DB: 3 "TEST" accounts
npm run dev
cd ../frontend && npm run dev         # http://localhost:5173/login
```

---

## 7. Kya baaki hai / known limitations (honest list)

1. **Existing Atlas DB migration zaroori:** purana `appointments.slotId_1` index unique + **non-sparse** hai. Bina `npm run db:sync-dashboard-indexes` ke, doosri dashboard booking (bina `slotId`) `409` degi. Script local legacy-index DB pe test hui hai, Atlas pe nahi.
2. Migration se **pehle** ke active legacy appointments mein `activeSlotKey` nahi hai (woh tab set hota hai jab document save ho). Naya booking flow unhe slot calculation mein exclude karta hai, lekin us chhote window ke liye DB-level unique guard nahi hai.
3. **Browser mein manual click-through nahi kiya** (sirf jsdom component tests + build). Real phone/tablet pe responsive check aur screen-reader (NVDA/TalkBack) test pending hai.
4. Invite link **email nahi hota**, kyunki email service code mein hai hi nahi. Admin link copy karke khud share karta hai.
5. Refresh token rotation frontend mein nahi hai: 15 min baad dobara login karna padta hai. Access token `localStorage` mein hai (pre-existing audit finding).
6. Rate limiter in-memory hai (multi-instance pe share nahi hota) — pre-existing.
7. Hospital verification (`isVerified`): bootstrap CLI hospitals ko verified banata hai (decision #3). Platform-ADMIN se hospital verify karne ka flow nahi bana.
8. Legacy portals (`/` pe `PatientPortal`, `DoctorPortal`, `HospitalPortal`) mein abhi bhi audit wala hardcoded/fake data hai. Unhe delete ya redirect nahi kiya (authorization nahi tha). Legacy login ke baad user abhi bhi un portals mein jaata hai; naye dashboards `/login` se khulte hain.
9. Public site: `Doctr*` component names ("Doctr X" Webflow template) aur `theme.css` ka "PharmEasy / Practo Ref" comment — template-copy concern. Yeh alag phase hai, chheda nahi.
10. Pre-existing 3 AI test failures (section 5) aur baaki audit items (OCR IDOR, fabricated AI fallback, etc.) is scope mein nahi the.
11. Statutory: patient cancel cutoff (2h), invite expiry (72h), encounter window (30 din) — clinical/legal policy approval pending; env se configurable hain (`PATIENT_CANCEL_CUTOFF_HOURS`, `DOCTOR_INVITE_TTL_HOURS`).
