# MediBridge: SRIJAN 2026 – DevFusion Live Demonstration Guide

> **Event**: SRIJAN 2026 – DevFusion  
> **Theme**: Where Web Meets Mobile Innovation  
> **Platform**: MediBridge — Full-Stack Healthcare Coordination & Teleconsultation Platform  
> **Target Audience**: Technical Examiners, Judges, and Evaluators  

---

## 1. Demonstration Overview & Theme Alignment

### "Where Web Meets Mobile Innovation"
MediBridge bridges modern web and mobile healthcare experiences through:
1. **Fully Responsive Mobile-First Client**: Engineered in React 19 + TypeScript with responsive viewports, touch-friendly navigation, collapsible sidebars, and adaptive dashboards that function seamlessly across mobile smartphones, tablets, and desktop workstations.
2. **Real-Time Healthcare Coordination**: Fast two-phase appointment booking, instant consent revocation, and emergency break-glass notifications designed for mobile teleconsultations.
3. **Defense-in-Depth Security**: Field-level `AES-256-GCM` encryption, authenticated streaming file proxies, and HMAC-SHA256 digital prescription signatures meeting India's DPDPA 2023 and NMC Telemedicine guidelines.

---

## 2. Quick-Start Commands (Pre-Demo Setup)

### Step A: Verify Services
Ensure the application is running:
- **Backend API**: `http://localhost:5000` (PID active)
- **Frontend SPA**: `http://localhost:5173` (PID active)
- **Database**: Local MongoDB community server or MongoDB Atlas cluster

```bash
# If starting fresh from terminal:
npm run dev
# Or in separate terminals:
# Terminal 1 (Backend): cd backend && npm run dev
# Terminal 2 (Frontend): cd frontend && npm run dev
```

### Step B: System Health Check
Open browser or run curl to verify backend connectivity:
```bash
curl http://localhost:5000/api/v1/health
```
Expected response:
```json
{
  "success": true,
  "data": {
    "status": "UP",
    "timestamp": "2026-10-30T...",
    "database": "CONNECTED",
    "version": "1.0.0"
  }
}
```

---

## 3. Step-by-Step Live Demonstration Script (10-Minute Presentation)

### Step 1: Mobile Responsiveness & Public Exploration (2 Minutes)
**Theme Highlight: "Where Web Meets Mobile Innovation"**

1. Open `http://localhost:5173` in Google Chrome or Microsoft Edge.
2. Open Developer Tools (`F12`) and toggle **Device Emulation** (`Ctrl+Shift+M`).
3. Select **iPhone 14 Pro** (393x852) or **Samsung Galaxy S20** (412x915):
   - **Showcase**: Touch-friendly hamburger navigation, responsive hero banner, quick-action cards, and clean typography with zero horizontal overflow.
4. Switch to **iPad / Tablet** (768x1024) and **Desktop Fullscreen**:
   - **Showcase**: Smooth responsive layout transitions, multi-column feature grids, and accessible contrast ratios.
5. Highlight the core clinical disclaimer visible on the footer, establishing regulatory compliance from the first touchpoint.

---

### Step 2: Patient Registration & Role Lockdown Security (1.5 Minutes)
**Security Highlight: Privilege Escalation Prevention**

1. Click **Get Started** or **Register** (`http://localhost:5173/register`).
2. Demonstrate that public registration is strictly restricted to **Patients**:
   - Malicious users cannot self-register as Doctors or System Administrators from the public UI or raw API payloads.
3. Fill out the registration form with demo data:
   - **Name**: `Aarav Sharma`
   - **Email**: `aarav.sharma@example.in`
   - **Password**: `SecurePass123!`
   - **Mobile**: `+91 98765 43210`
4. Submit the form. Notice immediate client-side validation, password strength meter, and redirection to the **Patient Portal**.

---

### Step 3: Hospital Admin & Doctor NMC Verification Gate (1.5 Minutes)
**Compliance Highlight: National Medical Commission (NMC) Telemedicine Verification**

1. Log in as Hospital Administrator (or demonstrate the clinician onboarding workflow).
2. Clinicians cannot practice immediately upon registration:
   - Clinician accounts enter a mandatory `PENDING` state.
   - Hospital Administrator must verify the doctor's **State Medical Council Registration Number**, qualification year, and identity documents against the NMC registry.
3. Once approved, the doctor transitions to `VERIFIED` and gains rights to publish availability slots, conduct teleconsultations, and sign prescriptions.

---

### Step 4: Two-Phase Slot Reservation & Concurrency Race Condition Demo (2 Minutes)
**Architecture Highlight: Double-Booking Prevention Under High Load**

1. In the **Doctor Portal**:
   - The verified doctor publishes available consultation slots (e.g., `10:00 AM - 10:30 AM`).
2. In the **Patient Portal**:
   - Patient searches for available clinicians and selects the `10:00 AM` slot.
3. **Showcase Phase 1 (Atomic Hold)**:
   - Clicking "Book Slot" triggers `POST /api/v1/appointments/slots/:id/hold`.
   - The slot is conditionally locked for 5 minutes (`heldUntil = now + 5 min`) with a unique `holdToken`.
   - The UI shows an active 5-minute countdown reservation timer.
4. **Showcase Concurrency Conflict Handling**:
   - Explain to the examiners: If a second patient attempts to hold the same slot simultaneously, the server responds with **HTTP 409 Conflict**. The compound unique database index `{ doctorId: 1, startTime: 1, activeSlotKey: 1 }` guarantees zero double-bookings.
5. **Showcase Phase 2 (ACID Confirmation)**:
   - The patient confirms the appointment details with an `Idempotency-Key`.
   - The slot status transitions atomically to `BOOKED`.

---

### Step 5: Encrypted Records & Authenticated Streaming Proxy with Instant Revocation (1.5 Minutes)
**Security Highlight: DPDPA 2023 Consent & AES-256-GCM Field Encryption**

1. In the **Patient Portal**, navigate to **Medical Records**:
   - Upload a sample lab report (PDF/JPEG).
   - Point out that files are verified via **magic-byte inspection** (validating binary headers, not just file extensions) with a 10MB limit.
2. In the database, the record's sensitive clinical notes are stored as:
   `enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>` using `AES-256-GCM`.
3. **Showcase Authenticated Streaming Proxy**:
   - Accessing the file calls `GET /api/v1/medical-records/:id/files/:fileId`.
   - The file is **never** publicly hosted; it is streamed through the server only after validating active ABAC consent.
4. **Showcase Instant Consent Revocation**:
   - Navigate to **Consent Management**.
   - Click **Revoke Consent** for the clinician.
   - Refresh the clinician's record view: Subsequent attempts to stream the file immediately receive **HTTP 403 Forbidden**.

---

### Step 6: Teleconsultation, Notes & Digitally Signed Prescriptions (1 Minute)
**Regulatory Highlight: NMC Telemedicine Digital Signature**

1. In the **Doctor Portal**, open the active consultation encounter.
2. Enter encrypted clinical notes and draft a prescription with dosage and frequency.
3. Click **Digitally Sign & Issue Prescription**:
   - The backend computes an **HMAC-SHA256 signature digest** across the prescription ID, doctor ID, patient ID, and medications payload.
   - The prescription is issued with a tamper-evident digital seal.
   - Patients can download or verify the authenticity of the prescription offline or at partner pharmacies.

---

### Step 7: Emergency Break-Glass Access & AI Safety Guardrails (1 Minute)
**Safety Highlight: Single-Use HMAC Action Tokens & Audit Transparency**

1. **Emergency Break-Glass Protocol**:
   - Show how in a critical emergency, an authorized clinician can invoke emergency access with a mandatory clinical justification text string.
   - A time-bounded 12-hour override is granted, and an immediate high-severity notification is dispatched to compliance officers and the patient.
2. **AI Assistant Safety Guardrails**:
   - Open the **MediBridge AI Assistant**.
   - Show the informational triage chatbot: Responds with mandatory non-clinical disclaimers and has **zero database mutation rights**.
   - Show the autonomous AI agent: For consequential actions (e.g., booking an appointment), the agent returns an uncommitted stage with a **5-minute single-use HMAC confirmation token**. The user must explicitly approve before the action commits.
3. **System Telemetry & Audit Trail**:
   - Switch to **System Admin Portal**: View the append-only, tamper-evident audit trail logging every PHI read, prescription signature, and consent change.

---

## 4. Key Questions & Technical Examiner Talking Points

| Anticipated Examiner Question | MediBridge Architectural Answer |
| :--- | :--- |
| **"How do you ensure medical records aren't leaked if your cloud storage is compromised?"** | Medical records are never exposed via public URLs. File bytes are streamed exclusively through an authenticated backend proxy that checks active patient consent in real time. Clinical fields in MongoDB are encrypted with `AES-256-GCM` using 96-bit random IVs and 128-bit authentication tags. |
| **"What happens during peak booking hours when two patients click the same slot?"** | We use a two-phase reservation protocol: `Slot.findOneAndUpdate` atomically claims a 5-minute checkout lock with a `holdToken`. The second request receives HTTP 409 Conflict. A compound unique index on `{ doctorId: 1, startTime: 1, activeSlotKey: 1 }` guarantees database-level isolation. |
| **"How does your platform comply with India's DPDPA 2023?"** | We enforce granular, category-scoped consent (`CLINICAL_NOTES`, `LAB_RESULTS`, `PRESCRIPTIONS`, `IMAGING_REPORTS`). Consent revocation is instantaneous. We maintain append-only audit logs and redact PHI from server logs. |
| **"How do you prevent AI from hallucinating and prescribing dangerous drugs?"** | The triage chatbot has zero database mutation permissions. The AI agent cannot commit consequential actions directly; it generates an HMAC-SHA256 signed confirmation token requiring explicit human confirmation. Only verified Registered Medical Practitioners (RMPs) can digitally sign prescriptions. |

---

## 5. Verification Checklist for Presenters

- [x] Backend running on `http://localhost:5000` with active MongoDB connection.
- [x] Frontend running on `http://localhost:5173` with Vite HMR enabled.
- [x] Device emulation tested on mobile viewport (393px width).
- [x] All 191 automated tests passing (`180 backend, 11 frontend`).
- [x] Zero TypeScript errors and zero ESLint warnings across both repositories.
- [x] Live Google Gemini model (`gemini-3.8-flash`) verified operational.
