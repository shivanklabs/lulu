# MediBridge — Audit Report

**Date:** 2026-10-30 · **Scope:** `F:\Devfusion\Medibridge` (frontend + backend) · **Mode:** read-only audit (project ki koi file change nahi ki; sirf yeh report add ki)

---

## 0. Pehle yeh padhein: audit kaise hua

| Item | Sach kya hai |
| :--- | :--- |
| **Spec file** | `PROJECT_SPEC.md` repo mein **exist nahi karti**. Maine `PROJECT_SUMMARY.md` (§5 Roles, §6 Modules, §7 API) aur `AGENTS.md` ko spec maana. Neeche "Spec section" column inhi ke section numbers hain (`PS §x` = PROJECT_SUMMARY, `AG §x` = AGENTS.md). |
| **Project ka configured MongoDB** | `backend/.env` mein `MONGODB_URI` abhi bhi template placeholder hai (`mongodb+srv://<username>:<password>@<cluster-host>/...`). Backend as-is start **nahi hota**: `querySrv EBADNAME _mongodb._tcp.<cluster-host>` → `Fatal: Database connection failure during startup` → exit code 1 (`backend/src/index.ts:33-37`). |
| **Phir test kaise hua** | Aapki machine pe installed MongoDB 6.0.29 (`C:\Program Files\MongoDB\Server\6.0`) ko ek **temporary data-dir** (scratchpad) mein single-node replica set (port 27999) ki tarah chalaya, aur backend ko sirf process env se `MONGODB_URI` override karke start kiya. Saare "Working" results **isi local test DB** ke against hain, aapke real Atlas DB ke against nahi. |
| **Doosre env overrides (sirf test process mein)** | `RATE_LIMIT_MAX_REQUESTS=2000` (default 100/15 min mere ~250 requests ke liye kam tha); `STORAGE_LOCAL_DIR=<scratchpad>` (taaki upload test aapke `backend/uploads` mein file na likhe). AI-agent token test ke liye ek baar `AI_PROVIDER=mock` + blank keys ke saath restart kiya (wajah §6 mein). |
| **Frontend** | Port 5173 pe pehle se ek `node.exe` (PID 11020) chal raha tha, isliye `npm run dev` fail hua: `Error: Port 5173 is already in use` (`strictPort: true`, `frontend/vite.config.ts:12`). Maine us process ko nahi chheda; Vite ko 5174 pe start kiya — server up hua aur `main.tsx`, `App.tsx`, `api.ts` HTTP 200 se transform hue. **Browser mein click-through test nahi hua** (koi browser automation tool available nahi tha). Isliye UI ke saare verdicts = *code trace + curl se verified backend response shape*. |
| **Evidence labels** | **Tested** = maine request bhej ke response dekha. **Code** = sirf code padha. **Code+API** = UI code trace kiya + jis backend response pe woh depend karta hai woh curl se verify kiya. |

Raw evidence (saari requests aur responses, JWT redacted): `C:\Users\Lenovo\AppData\Local\Temp\claude\F--Devfusion\e081c1a0-79c2-41fd-afb0-0a3bcffebfb6\scratchpad\results.jsonl`

---

## 1. Feature status table

Do column hain kyunki backend aur UI ki haalat bilkul alag hai: **API** = backend endpoint (curl se), **End-to-end** = React UI → API → DB → UI.

| # | Feature | Spec section | API status | End-to-end status | Evidence |
| :-- | :--- | :--- | :--- | :--- | :--- |
| 1 | Health check | PS §7.1 | **Working** | Code looks OK, not tested | Tested (200 healthy; DB down pe startup hi fail hota hai) |
| 2 | Register / Login / Refresh | PS §6.1, §7.2 | **Partial** — kaam karta hai par koi bhi `ADMIN` ban sakta hai, validation nahi, bad input pe 500 | **Broken** — UI login kabhi real session nahi banata | API tested; UI Code+API |
| 3 | Session restore `/auth/me` | PS §12.2 | **Working** (spec ka "missing" claim ab outdated hai) | Code looks OK, not tested | Tested |
| 4 | Public doctor directory | PS §7.3 | **Working** | Code looks OK, not tested | Tested |
| 5 | Doctor credential verification (Admin) | PS §6.2, §7.3 | **Partial** — spec wala body `{verificationStatus}` → 400; sirf `{status}` chalta hai | **Broken** — UI galat field bhejta hai, aur pending queue hamesha khaali | Tested + Code+API |
| 6 | Patient profile `/patients/me` | PS §7.4 | **Working** | **Partial** — UI kabhi call nahi karta; profile sirf page-reload pe `/auth/me` se aata hai | Tested + Code |
| 7 | Hybrid consent (grant / revoke / list) | PS §6.3, §7.5, AG §3 | **Partial** — grant/revoke/ownership sahi; par non-existent doctor aur empty categories bhi accept | **Partial** — optimistic UI; "re-activate" sirf local state | Tested + Code |
| 8 | Encrypted medical records (create / read) | PS §6.4, §7.6 | **Partial** — AES-GCM + ABAC tested OK; doctor bina kisi relation ke kisi bhi patient ka record bana sakta hai | **Broken** — UI mein records list kabhi load nahi hoti (koi list endpoint nahi, state ka setter nahi) | Tested + Code |
| 9 | File streaming proxy | PS §6.4, AG §2 | **Working** (owner 200, others 403, no-auth 401) | Code looks OK, not tested | Tested |
| 10 | Slot publishing | PS §6.5, §7.7 | **Working** (verified-only, duplicate 409, bad time 400) | **Partial** — success toast API se pehle, result ignore | Tested + Code |
| 11 | Two-phase booking (hold → confirm) | PS §6.5, AG §5 | **Working** — 10 parallel holds → exactly 1×200, 9×409; idempotency OK | **Broken** — fake appointment card, aur wizard ek click mein 2 slots book karta hai | Tested + Code |
| 12 | Cancel + my-appointments | PS §7.7 | **Working** (owner-only cancel) | **Partial** — optimistic, error ignore | Tested + Code |
| 13 | Prescriptions draft / sign / view | PS §6.6, §7.8 | **Working** (verified-only, author-only, consent-gated read) | **Broken** — UI client-side **random fake signature** dikhata hai; doctor ko apne Rx list nahi milte | Tested + Code |
| 14 | In-app notifications | PS §7.9 | **Partial** — list OK; mark-read doosre user ke liye bhi `200 {read:true}` (no-op, misleading), invalid id → 500 | Code looks OK, not tested | Tested |
| 15 | Admin overview + audit logs | PS §6.7, §7.10 | **Working** (role-gated) — *lekin* koi bhi self-register karke admin ban sakta hai (#2) | Code looks OK, not tested | Tested |
| 16 | AI chatbot | PS §6.8, §7.11 | **Broken (live)** — Gemini model 404, har jawab canned fallback; `/ai/chatbot/message` bina auth | Broken (wahi canned text) | Tested |
| 17 | AI agent stage + HMAC confirm | PS §6.8, §7.11, AG §4 | **Partial** — token security (tamper/cross-user/replay) **Working with mock**; live Gemini se 500; sirf exact keyword phrases samajhta hai | **Broken** — UI hardcoded prompt bhejta hai jo kabhi match nahi karta → hardcoded fake token dikhata hai | Tested + Code |
| 18 | Emergency break-glass | AG §3.6 | **Working** (verified-only, min-15-char justification, 30-min grant) | Code looks OK, not tested | Tested |
| 19 | Hospital portal | PS §5 (HOSPITAL) | **Partial** — endpoints chalte hain par data mostly hardcoded/seeded; add-staff validation 500 | Partial | Tested + Code |
| 20 | Public landing / website | PS §5 (PUBLIC) | n/a | Code looks OK, not tested (Vite serve 200) | Code |

### Spec ke bahar extra modules (code mein mile, spec mein nahi)

| Module | API status | Evidence | Note |
| :--- | :--- | :--- | :--- |
| Report/Rx photo OCR | **Broken / unsafe** | Tested | Gemini fail hone pe **fabricated lab values / medicines** patient chart mein save; kisi bhi patient ke chart mein koi bhi upload kar sakta hai |
| Lab trends | Working (consent-gated) | Tested | Upar wale fake OCR data se trends banta hai |
| Medicine reminders | **Broken (authz)** | Tested | Koi bhi user kisi ka reminder bana/pause/trigger kar sakta hai; WhatsApp/push `simulated: true` |
| Patient special-ID lookup | **Broken (authz)** | Tested | PENDING doctor aur ADMIN dono bina consent full PHI dekhte hain |
| Ambulance SOS | Partial | Tested | Nearby list hardcoded; koi bhi (PENDING) doctor sab dispatches ka PII dekh/badal sakta hai |
| Donor / blood bank | Partial | Tested | Seeded hardcoded inventory; public endpoints |
| Skin photo screening | **Broken / unsafe** | Tested | 1×1 transparent PNG pe bhi "Eczematous Dermatitis" diagnosis (hardcoded fallback) |
| Incognito vault | Working | Tested | PIN, owner-only unlock, assigned-doctor-only view sahi |
| OPD queue / waitlist / nearby doctor | Working (basic) | Tested | — |

---

## 2. Score

- **End-to-end (UI → API → MongoDB → UI) fully working, run karke verified: 0 / 20.**
  Wajah: (a) browser test nahi hua, aur (b) zyada important — **UI ka real login flow hi toota hai** (§3.1), isliye koi bhi authenticated feature UI se real data ke saath nahi chal sakta.
- **Backend API layer, run karke verified "Working": 11 / 19** (health, `/auth/me`, doctor directory, patient profile, file streaming, slot publishing, two-phase booking, cancel/list, prescriptions, admin overview/audit, break-glass). Feature #20 (landing page) ka API nahi hai.
- API Partial: 7 (register/login, doctor verification, consent, medical records, notifications, AI agent, hospital) · API Broken: 1 (AI chatbot live).

---

## 3. Data flow, feature-wise (kahan toot raha hai)

Format: **React component → API call → route → middleware → controller → service/model → MongoDB → response → UI update**. ✅ = verified, ❌ = toota, ⚠️ = risky/hardcoded.

### 3.1 Login / Register — ❌ UI pe toota
`RoleBasedComplianceLoginPage.handleSubmit` → `api.auth.login` (`frontend/src/services/api.ts:117`) → `POST /auth/login` (`auth.routes.ts:11`, `authRateLimiter`) → `loginHandler` → `loginUser` → `UserModel` ✅ → response `{ data: { userId, email, role, accessToken, refreshToken } }` (`auth.controller.ts:31-39`) ✅ → **UI ❌**

- ❌ UI `loginRes.data.user` padhta hai (`RoleBasedComplianceLoginPage.tsx:185`, `:112`, `:167`) — yeh field backend bhejta hi nahi (curl: `has data.user? false`).
- ❌ Phir `App.tsx:515-518` `setAuthenticatedUser(undefined)` karta hai aur `showToast(\`Authenticated as ${user.role}\`)` pe **TypeError** aata hai.
- ❌ Yeh error `handleSubmit` ke `catch` (`:191-192`) mein jaata hai jo `handleQuickDemoLogin` chalata hai → woh bhi fail → `:121-122` pe **fake demo user + fake token** (`mb_demo_token_<role>_<ts>`) set ho jaata hai → portal "Alice Patient" jaisa fixture dikhata hai → pehli API call 401 → session-expired → wapas login page.
- ❌ Register: `:167` pe wahi `undefined.user` setTimeout ke andar crash hota hai; user "Registration successful" message ke saath login page pe atka rehta hai (token localStorage mein chala jaata hai, isliye page reload karne pe `/auth/me` se andar aa jaata hai).
- ⚠️ Refresh token frontend kabhi store/use nahi karta (`api.ts:49-58` sirf access token) → `JWT_ACCESS_EXPIRES_IN=15m` ke baad har user logout.
- ⚠️ Frontend tests yeh nahi pakadte kyunki woh login response ko `data.user` ke saath mock karte hain (`frontend/src/test/Stage7Portals.test.tsx:17`) — real backend se alag shape.

### 3.2 Admin: doctor verification — ❌ UI pe toota
`AdminPortal` (pending list) → `App.handleVerifyDoctor` (`App.tsx:427`) → `api.admin.verifyDoctor` sends `{ verificationStatus }` (`api.ts:362-366`) → `PATCH /doctors/:id/verify` → `authenticate` + `requireRole('ADMIN')` ✅ → `updateDoctorVerification` reads **`status`** (`doctor.controller.ts:45`) ❌ → **400 INVALID_STATUS** (tested) → UI pehle hi optimistic "VERIFIED" toast dikha chuka hota hai (`App.tsx:428-431`), error ignore.

- ❌ Pending queue: `AdminPortal.tsx:36` `doctors.filter(d => d.verificationStatus === 'PENDING')`, lekin `doctors` = `GET /doctors` jo sirf VERIFIED doctors deta hai aur `verificationStatus` field select hi nahi karta (`doctor.controller.ts:8-10`; curl output mein field missing). → **queue hamesha 0**. Backend mein pending doctors list karne ka koi endpoint hi nahi hai.

### 3.3 Doctor portal identity — ❌
- ❌ Logged-in doctor ka profile kabhi fetch nahi hota (`api.doctors.getMyProfile` poore frontend mein kahin call nahi). `App.tsx:339-350` `activeDoctor` = public list ka pehla doctor, warna hardcoded **"Dr. Gregory House / RMP-NMC-LIFE-999"**. Aur kyunki list mein `verificationStatus` nahi aata, `.find(d => d.verificationStatus === 'VERIFIED')` kabhi match nahi karta.

### 3.4 Booking — API ✅, UI ❌
`PatientPortal` wizard → `api.appointments.getDoctorSlots` / `holdSlot` / `confirmBooking` → `/appointments/...` → `authenticate` + `requireRole('PATIENT')` ✅ → `holdSlotForPatient` (atomic `findOneAndUpdate`) ✅ → `confirmAppointmentBooking` (transaction + idempotency) ✅ → Slot/Appointment/ConsentGrant (30-day encounter grant) ✅ → 201 ✅
- ❌ `App.tsx:294-312`: API call se **pehle** fake appointment (`slotId: 'slot_dynamic_confirmed'`, `scheduledAt: 'Next Available Consultation Window'`) list mein daal deta hai aur "confirmed" toast; agar slot nahi mila ya API fail hua to fake card wahi reh jaata hai.
- ❌ `PatientPortal.tsx:97-114`: wizard phase 2 held slot confirm karta hai, **phir** `onBookAppointment()` call karta hai jo (`App.tsx:315-324`) agla AVAILABLE slot hold+confirm karta hai → **ek click = 2 appointments** (agar 2 slots free hain).
- Hamesha `doctors[0]` ke liye book hota hai (`PatientPortal.tsx:80`), user ka chuna doctor nahi.

### 3.5 Consent — API mostly ✅, UI ⚠️
`ConsentGrantManager` / PatientPortal form → `api.consent.grant|revoke|myGrants` → `/consent` → `authenticate` + `requireRole('PATIENT')` ✅ → `createConsentGrant` (`consent.service.ts:14-22`) → `ConsentGrantModel` ✅
- ⚠️ `consent.service.ts:14-22` doctor ka existence check nahi karta (tested: `doctorId: 000…0` → 201) aur empty `categories: []` bhi accept (tested).
- ✅ Revocation instant hai (tested): saare grants revoke karne ke baad doctor ko 403. Note: booking se auto-bana encounter grant chaaron categories deta hai, isliye sirf category-grant revoke karne se access band nahi hota (tested) — UI mein yeh clear nahi.
- ❌ `App.tsx:229-248`: toggle se "re-activate" sirf local state badalta hai, backend call hi nahi (fake). Revoke ka error ignore.

### 3.6 Medical records — API ✅, UI ❌
- ✅ Doctor create → AES-256-GCM (`enc:v1:…` dikh raha hai DB response mein) → owner/consented-doctor read 200, others 403, admin 403 (tested).
- ❌ UI: `App.tsx:69` `const [records] = useState(...)` — setter hi nahi, kabhi load nahi hota. Backend mein "list my records" endpoint bhi nahi hai (`medical-record.routes.ts:18-29` mein sirf `POST /`, `GET /:id`). → Patient/Doctor portal ka records section **hamesha khaali**.
- ⚠️ `medical-record.service.ts:29-41`: verified doctor **kisi bhi** patientId ke chart mein record likh sakta hai, koi appointment/consent check nahi (tested: D1 ne Patient B ke liye record banaya, 201).

### 3.7 Photo OCR upload — ❌ unsafe
`UploadReportPrescriptionPhoto` → `api.records.uploadPhotoOcr` → `POST /medical-records/photo-ocr` → `authenticate` (**koi role / ownership check nahi**, `medical-record.routes.ts:21-22`) → `uploadPhotoOcrHandler` (`medical-record.controller.ts:62-66` body ka `patientId` maan leta hai) → `processReportOrPrescriptionPhoto` → disk + `MedicalRecordModel`.
- ❌ IDOR (tested): Patient B ne Patient A ke chart mein record + file daal di (201).
- ❌ **Fabricated medical data** (tested): Gemini call fail hone pe `gemini-multimodal.adapter.ts:197-230` hardcoded result return karta hai — lab report pe **HbA1c 6.8%, Fasting Glucose 126** (dono "abnormal"), prescription pe **Metformin 500mg + Atorvastatin 10mg**, "confidenceScore 0.95", "extracted via Gemini Multimodal OCR". Branch file-size ke even/odd hone se decide hota hai (`:199-200`). Yeh patient ke chart aur lab-trend graph mein real data ki tarah dikhta hai. 1×1 blank PNG upload karke yeh reproduce kiya.
- ❌ Magic-byte validation nahi (AG §2 ki requirement): shell script bytes ko `image/png` bol ke upload kiya → 201.
- ⚠️ Patient upload kare to record "pehle verified doctor" ke naam pe chala jaata hai (`report-photo-ocr.service.ts:56-61`).

### 3.8 Prescriptions — API ✅, UI ❌
- ✅ Draft (verified-only) → sign (author-only, `sig:v1:`) → patient read; doosre patient 403 (tested).
- ❌ `App.tsx:399-413`: sign click pe UI **client-side `Math.random()` se fake `sig:v1:` signature** bana ke "ISSUED" dikha deta hai, phir API call; fail hua to fake signature screen pe reh jaata hai.
- ❌ Doctor ke liye prescriptions kabhi load nahi hote (`App.tsx:114-131` sirf PATIENT ke liye).
- ⚠️ `POST /prescriptions/check-conflicts` koi bhi logged-in user kisi bhi `patientId` ke liye chala sakta hai (tested 200) → doosre patient ki allergy info infer ho sakti hai.

### 3.9 AI chatbot & agent — ❌ live
- ❌ `AI_MODEL=gemini-2.5-flash` pe Gemini **404**: *"This model models/gemini-2.5-flash is no longer available to new users…"* (tested via `/ai-agent/turn` → 500).
- ❌ Phir bhi `GET /ai/status` → `liveAiActive: true` (tested). Chatbot har sawaal pe same canned "Clinical Fallback" text deta hai (`chatbot.service.ts:57-64`), error swallow.
- ❌ `config/env.ts:121-129`: agar Gemini key maujood hai to `AI_PROVIDER=mock` bhi zabardasti `gemini` ban jaata hai (test env ke alawa) → mock pe switch karna bhi possible nahi jab tak key hatayi na jaye. Backend unit test isi wajah se 2 fail (§6).
- ⚠️ Agent intent = string `includes()` (`ai-agent.service.ts:124-127`); "cancel my appointment X" match nahi hota, sirf "cancel appointment X".
- ✅ HMAC token (mock mode, tested): tampered token 403, tampered resourceId 403, doosra user 403, valid 200, replay 409.
- ❌ UI: `PatientPortal.tsx:197` hardcoded prompt `'Book Neurology Consultation'` bhejta hai (backend pattern se kabhi match nahi) → `:202-217` **hardcoded fake token** `e4d8f2a1…` dikhata hai → confirm fail hone par bhi `:230` `setActionConfirmed(true)`.
- ❌ Skin screening: 1×1 transparent PNG pe "Erythematous localized patch… Eczematous Dermatitis" (hardcoded fallback, `gemini-multimodal.adapter.ts:~298`).

### 3.10 Hardcoded / dummy data (DB ki jagah)
| Jagah | Kya hardcoded hai |
| :--- | :--- |
| `backend/src/modules/hospitals/hospital-dashboard.service.ts:144-146` | Doctor rating `4.85+…`, `totalConsultations = 140+(idx+1)*35`, satisfaction 97% — formula se, DB se nahi (tested: 1 appointment wale doctor ke 175 consultations) |
| `hospital-dashboard.service.ts:32`, `:108-111` | `DEFAULT_STAFF_SEEDS` — empty DB pe fake staff insert |
| `hospital-dashboard.service.ts:128-130` | Facility name, "NABH Accredited", `departmentsCount: 14` |
| `backend/src/modules/auth/auth.service.ts:178-184` | HOSPITAL role ka profile poora hardcoded |
| `backend/src/modules/ambulance-sos/ambulance-sos.service.ts:40+` | Nearby ambulances fixed list; lat/lng ignore (`_latitude`, `_longitude`) |
| `ambulance-sos.service.ts:121-125` | Vehicle code, ETA `Math.random()` |
| `backend/src/modules/donor-organ-blood-bank/donor-matching.service.ts:39, 114, 125` | Donors, blood inventory, organ registry seeds |
| `backend/src/integrations/gemini-multimodal.adapter.ts:197-230, ~298` | Fake OCR/lab/medicine/skin results |
| `backend/src/integrations/whatsapp-reminder.adapter.ts:49` | `simulated: true` — WhatsApp actually nahi bhejta |
| `backend/src/modules/auth/auth.service.ts:48-50` | Register pe default `bloodGroup: 'O+'`, `dateOfBirth: '2000-01-01'` — galat medical data default |
| `frontend/src/app/App.tsx:339-350` | Fallback "Dr. Gregory House" |
| `frontend/src/features/auth/RoleBasedComplianceLoginPage.tsx:28-48, 67, 93-125` | Demo accounts, prefilled `Password123!`, fake-token fixture login |
| `frontend/src/features/patients/PatientPortal.tsx:202-217` | Fake HMAC token |
| `backend/src/modules/auth/privacy-consent-disclosure.ts` | `/auth/compliance-info` "certificateNumber: CERT-DPDPA-IN…" — DPDPA ke under aisa koi certificate nahi hota; yeh user ko misleading claim hai |

---

## 4. Security findings

| Sev | Finding | Evidence | Location |
| :--- | :--- | :--- | :--- |
| **Critical** | Public register se **ADMIN (aur HOSPITAL) account** ban jaata hai — role seedha request body se | Tested: `role:"ADMIN"` → 201, us token se `/admin/overview`, audit logs, doctor verify sab 200 | `auth.service.ts:34-38`, `auth.controller.ts:8` |
| **Critical** | Patient PHI lookup sirf role check pe — **PENDING (unverified) doctor aur ADMIN** bina consent naam, phone, allergies, past treatments dekhte hain (spec PS §5: admin ko PHI nahi) | Tested: dono 200 | `doctor.routes.ts:18`, `patient-special-id.service.ts:81-83` |
| **High** | Real-looking **Gemini API key** (`AIza…`) `.env.example` files mein — yeh files commit hone ke liye hain | Code. Staged (index) version clean hai, working-tree version mein key hai → agla `git add` ise commit kar dega. Key ko **rotate** karein | `.env.example:18`, `backend/.env.example:44-45` |
| **High** | Photo-OCR IDOR: koi bhi logged-in user kisi bhi patient ke chart mein record/file inject kar sakta hai | Tested (B → A ka chart, 201) | `medical-record.routes.ts:21-22`, `medical-record.controller.ts:62-66` |
| **High** | AI fail hone pe **fabricated clinical data** (lab values, medicines, diagnosis) real patient record mein "confidence 0.95" ke saath | Tested | `gemini-multimodal.adapter.ts:197-230`, `~298` |
| **High** | Medicine reminders IDOR: create (kisi bhi patientId pe, WhatsApp number bhi attacker ka), pause, trigger-now — sab bina ownership | Tested (sab 200/201) | `medicine-reminder.scheduler.ts:32`, `medicine-reminder.controller.ts:73, 114`, routes `:16-20` |
| **Medium** | Ambulance: koi bhi (PENDING bhi) doctor saare active dispatches (naam, phone, GPS) dekh aur status badal sakta hai | Tested | `ambulance-sos.routes.ts:19-20` |
| **Medium** | Verified doctor bina relation kisi bhi patient ke chart mein records likh sakta hai | Tested | `medical-record.service.ts:29-41` |
| **Medium** | `/ai/chatbot/message` aur `/ai/chatbot` **bina auth** (spec: JWT required) — AI quota abuse | Tested 200 no-auth | `ai.routes.ts:29-30` |
| **Medium** | Koi request validation layer nahi: empty/galat body pe 500 aur internal error text (Mongoose/Zod/TypeError) response mein; login pe `{ "$ne": null }` jaisa object bhi andar tak pahunchta hai (abhi `toLowerCase` crash se bach gaya) | Tested: 9+ endpoints 500 | `errorHandler.ts:27-31` (sirf production mein mask) |
| **Medium** | Password policy nahi (`"1"` accept), email format check nahi | Tested | `auth.service.ts:27-33` |
| **Medium** | JWT: logout/revocation nahi; `isActive` kahin check nahi; role token se trust hota hai (role badla to 15 min tak purana role) | Code (grep: `isActive` sirf model mein) | `auth.middleware.ts:14-28`, `auth.service.ts:98-149` |
| **Medium** | Access token `localStorage` mein — XSS hua to chori | Code | `frontend/src/services/api.ts:29-58` |
| **Medium** | Upload magic-byte / antivirus check nahi (AG §2 requirement) | Tested | `report-photo-ocr.service.ts:64-75` |
| **Low** | Hospital staff roster (phone/email) har logged-in patient ko dikhta hai | Tested | `hospital-dashboard.routes.ts:15-19` |
| **Low** | Rate limiter in-memory (multi-instance pe share nahi); general limit test mein kaam kiya | Tested (auth: 30 ke baad 429) | `rateLimiter.ts:16` |
| **Low** | Dev mein secrets unset hon to known default keys (`PHI_ENCRYPTION_KEY=0123…`) use hoti hain; production mein block hai ✅ | Code | `config/env.ts:27-33` |
| **Low** | Notification mark-read doosre user ke liye `200 {read:true}` (actual no-op) — misleading | Tested | `notification.controller.ts:27-30` |
| **Info ✅** | `.env` `.gitignore` mein hai (`backend/.env`, `frontend/.env`, `uploads/`) — `git check-ignore` se verified; `.env.example` teeno jagah maujood | Tested | `.gitignore:9-20, 44-46` |
| **Info ✅** | Git history: **koi commit hi nahi** (`git log` empty, sirf staged files). Staged files mein koi secret nahi mila. Frontend `src/`, `dist/`, `public/` mein koi secret nahi | Tested | — |
| **Info ✅** | Password hashing bcrypt 12 rounds; JWT access/refresh alag secrets (access token se refresh 401 tested) | Tested + Code | `lib/crypto.ts:54-61, 69-87` |
| **Info ✅** | CORS sirf `FRONTEND_URL` (`http://localhost:5173`) — evil origin pe bhi wahi origin header (browser block karega) | Tested | `app.ts:20-23` |
| **Info ✅** | Security headers: CSP, nosniff, X-Frame-Options DENY, Referrer-Policy | Tested | `securityHeaders.ts` |
| **Info ✅** | Protected/admin routes **server pe** check hote hain (no-auth 401, wrong role 403 — 30+ cases tested). Problem frontend-only check ki nahi, balki upar wale IDOR/ownership gaps aur open ADMIN registration ki hai | Tested | — |

---

## 5. Priority fix list (top 10)

1. **ADMIN/HOSPITAL self-registration band karo** — public register sirf `PATIENT` / `DOCTOR` allow kare; admin seed/invite se bane. (`auth.service.ts:34-38`)
2. **Gemini key rotate karo** aur dono `.env.example` se hatao (placeholder rakho) — commit se pehle. (`.env.example:18`, `backend/.env.example:44-45`)
3. **Fabricated AI fallback hatao** — AI fail ho to error/“extraction failed” dikhao, fake lab values/medicines/diagnosis kabhi save mat karo. (`gemini-multimodal.adapter.ts:197-230, ~298`)
4. **Login/Register response shape fix** — backend `data.user` bheje *ya* frontend `data.userId/email/role` padhe; aur `handleQuickDemoLogin` ka fake-token fixture fallback hatao. (`auth.controller.ts:9-18, 31-39`, `RoleBasedComplianceLoginPage.tsx:112, 121-122, 167, 185`)
5. **Ownership checks**: photo-OCR (patient sirf apna chart), medicine-reminders (create/toggle/trigger), patient-lookup (verified doctor + consent; admin ko PHI nahi), check-conflicts. (`medical-record.controller.ts:62`, `medicine-reminder.*`, `patient-special-id.service.ts:81`)
6. **Admin verification flow**: field name ek karo (`verificationStatus`), aur pending doctors ka admin endpoint banao; AdminPortal usse queue bhare. (`doctor.controller.ts:45`, `api.ts:365`, `AdminPortal.tsx:36`)
7. **Optimistic fake-success hatao** — booking, sign, consent re-activate, slot publish, agent confirm: API result ke baad hi UI update; client-side fake signature/token/appointment band. (`App.tsx:229-447`, `PatientPortal.tsx:97-114, 192-231`)
8. **Request validation (Zod) har route pe** + 4xx errors; invalid ObjectId pe 400; dev mein bhi internal messages mask. Password policy add karo.
9. **AI config fix**: valid model name set karo, `AI_PROVIDER=mock` ko override mat karo, `/ai/status` sach bataye, `/ai/chatbot*` pe `authenticate`. (`env.ts:121-129`, `ai.routes.ts:29-30`)
10. **Missing data-loading**: doctor portal `GET /doctors/me` use kare; records list endpoint + UI loading; doctor ke prescriptions load; refresh-token rotation frontend mein. (`App.tsx:69, 114-131, 339-350`)

---

## 6. Kya test nahi ho paaya, aur kyun

| Item | Kyun |
| :--- | :--- |
| Aapke **real MongoDB (Atlas)** ke against kuch bhi | `MONGODB_URI` placeholder hai; credentials chat mein nahi maange (aapke instruction ke mutabik). Saara testing local temp MongoDB 6.0.29 pe. Atlas-specific cheezein (network access, SRV, TLS) untested. |
| **Browser mein UI click-through** | Browser automation tool available nahi tha. Frontend verdicts code-trace + curl response shapes pe hain. Vite server 5174 pe chala aur modules compile hue (HTTP 200). |
| Frontend port 5173 pe as-configured start | Port pehle se PID 11020 (`node.exe`) ke paas tha; maine use band nahi kiya. |
| **Live Gemini** ka successful path | Model `gemini-2.5-flash` 404 deta hai; isliye real AI output kabhi nahi dekh paaya. Agent ka HMAC flow `AI_PROVIDER=mock` + blank keys ke saath test kiya. |
| WhatsApp / Web-push real delivery | Adapters `simulated: true` hain — koi real integration code hi nahi. |
| Docker compose / production build / `NODE_ENV=production` secret validation | Docker installed nahi; production mode run nahi kiya (sirf code padha, `env.ts:49-94`). |
| Rate-limit window reset, token expiry (15 min / 7 din), hold expiry (5 min) | Time-based; wait nahi kiya. |
| S3 storage | Code mein S3 implementation hai hi nahi (sirf env vars). |
| Email (SMTP) | Env vars hain, code mein koi email sender nahi mila. |

### Automated checks jo chalaye

| Check | Result |
| :--- | :--- |
| Backend `tsc --noEmit` | ✅ pass (exit 0) |
| Frontend `tsc --noEmit` | ✅ pass (exit 0) |
| Backend ESLint | ✅ 0 problems |
| Frontend ESLint | ✅ 0 errors, 5 warnings (react-refresh) |
| Frontend Vitest | ✅ 35/35 pass — **lekin** login response ko galat shape (`data.user`) ke saath mock karte hain, isliye §3.1 ka real bug miss hota hai |
| Backend Vitest (local mongod 6.0.29 ke saath) | ❌ **129 pass, 3 fail, 9 skipped (141)**, exit 1. Fail: `gemini-adapter.test.ts:302, 308` (OpenAI/Anthropic default model ki jagah `gemini-2.5-flash` — `env.ts:121-129` ka auto-override) aur `chatbot.test.ts:49` (provider `fallback` aaya, `mock` expected). Tests real `backend/.env` load karke **live Gemini API call** karte hain (logs mein 404 dikha) — isolated nahi hain. `e2e-lifecycle.test.ts` ke 9 tests skip: test harness ka MongoMemoryServer 10s mein start nahi hua (mere environment ka timeout; code bug nahi maana) |

> Note: `PROJECT_SUMMARY.md` "77 tests passing / Implemented & Verified" claim karta hai. Upar ke runtime results dikhate hain ki unit/integration tests pass hone ke bawajood UI↔API contract aur authorization gaps maujood hain.
