import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { DoctorModel } from '../../src/modules/doctors/doctor.model';
import { AuditLogModel } from '../../src/modules/audit/audit.model';
import { HospitalStaffModel } from '../../src/modules/hospitals/hospital-staff.model';
import { AnonymizedDonorModel } from '../../src/modules/donor-organ-blood-bank/anonymized-donor.model';
import { SlotModel } from '../../src/modules/appointments/slot.model';
import { registerAccount } from '../helpers/accounts';

describe('Stage 7: Portals, Special-ID Lookup, Donor Matcher & Voice Companion Integration', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let patientToken: string;
  let doctorToken: string;
  let hospitalToken: string;

  let patientSpecialId: string;
  let patientDbId: string;
  let doctorProfileId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());

    // 1. Register Patient with explicit DPDPA privacy consent
    const patReg = await registerAccount(app, {
      email: 'stage7.patient@example.com',
      password: 'Password123!',
      role: 'PATIENT',
      fullName: 'Aarav Singhania',
      phone: '+91 98100 11223',
      bloodGroup: 'B+',
      privacyPolicyAccepted: true,
    });
    expect(patReg.status).toBe(201);
    patientToken = patReg.body.data.accessToken;

    const mePat = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(mePat.status).toBe(200);
    patientDbId = mePat.body.data.profile._id;
    patientSpecialId = mePat.body.data.profile.specialId;
    expect(patientSpecialId).toMatch(/^#MB-PAT-\d{4}$/);

    // 2. Register Verified Doctor
    const docReg = await registerAccount(app, {
      email: 'dr.anand.stage7@example.com',
      password: 'Password123!',
      role: 'DOCTOR',
      fullName: 'Dr. Anand Kulkarni',
      phone: '+91 98200 44556',
      licenseNumber: 'NMC-STAGE7-DOC-99',
      specialization: 'General Medicine & Nephrology',
      consultationFee: 800,
      privacyPolicyAccepted: true,
    });
    expect(docReg.status).toBe(201);
    doctorToken = docReg.body.data.accessToken;

    const meDoc = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(meDoc.status).toBe(200);
    doctorProfileId = meDoc.body.data.profile._id;

    // Mark doctor verified
    await DoctorModel.findByIdAndUpdate(doctorProfileId, {
      verificationStatus: 'VERIFIED',
      rating: 4.95,
      totalConsultations: 120,
      patientSatisfactionPercent: 98,
    });

    // 3. Register Hospital Facility User
    const hospReg = await registerAccount(app, {
      email: 'admin.apollo@hospital.org',
      password: 'Password123!',
      role: 'HOSPITAL',
      fullName: 'Apollo Multispecialty Care Node',
      facilityName: 'Apollo Multispecialty Care Node',
      phone: '+91 11 2682 5555',
      privacyPolicyAccepted: true,
    });
    expect(hospReg.status).toBe(201);
    hospitalToken = hospReg.body.data.accessToken;

    // 4. Register Administrator
    const admReg = await registerAccount(app, {
      email: 'superadmin.stage7@medibridge.org',
      password: 'Password123!',
      role: 'ADMIN',
      fullName: 'National Health Officer',
      privacyPolicyAccepted: true,
    });
    expect(admReg.status).toBe(201);

    // Create tomorrow's appointment slots for companion booking test
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setMinutes(tomorrowEnd.getMinutes() + 30);

    await SlotModel.create({
      doctorId: doctorProfileId,
      startTime: tomorrow,
      endTime: tomorrowEnd,
      status: 'AVAILABLE',
    });
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  describe('1. Platform Compliance & Licensing Disclosure', () => {
    it('should return verified platform certificates, statutory licenses and transparency rules', async () => {
      const res = await request(app).get('/api/v1/auth/compliance-info');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.platformName).toBe('MediBridge Healthcare Exchange');
      expect(res.body.data.regulatoryCertifications.length).toBeGreaterThanOrEqual(4);

      // Validate DPDPA 2023 and NMC guidelines presence
      const standards = res.body.data.regulatoryCertifications.map((c: { standard: string }) => c.standard);
      expect(standards.some((s: string) => s.includes('DPDPA'))).toBe(true);
      expect(standards.some((s: string) => s.includes('Telemedicine'))).toBe(true);

      // Validate data storage transparency
      expect(res.body.data.dataStorageTransparency.length).toBeGreaterThanOrEqual(4);
      const categories = res.body.data.dataStorageTransparency.map((d: { dataCategory: string }) => d.dataCategory);
      expect(categories.some((c: string) => c.includes('Protected Health Information'))).toBe(true);
    });

    it('should have logged PRIVACY_CONSENT_ACKNOWLEDGED in immutable AuditLogModel on user registration', async () => {
      const auditLog = await AuditLogModel.findOne({
        action: 'PRIVACY_CONSENT_ACKNOWLEDGED',
        resourceType: 'User',
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.actorRole).toBe('PATIENT');
    });
  });

  describe('2. Hospital Staff Roster & Top Doctors Showcase', () => {
    it('should allow hospital facility to view overview metrics', async () => {
      const res = await request(app)
        .get('/api/v1/hospitals/overview')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.doctorsCount).toBeGreaterThanOrEqual(1);
    });

    it('should return ranked top doctors with ratings and satisfaction percentages', async () => {
      const res = await request(app)
        .get('/api/v1/hospitals/top-doctors')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const topDoc = res.body.data[0];
      expect(topDoc.rating).toBeGreaterThanOrEqual(4.5);
      expect(topDoc.patientSatisfactionPercent).toBeGreaterThanOrEqual(90);
      expect(topDoc.badges).toContain('Top Rated Specialist');
    });

    it('should allow hospital facility to add staff and update shift status', async () => {
      // Add staff member
      const addRes = await request(app)
        .post('/api/v1/hospitals/staff')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          name: 'Sister Sunita Verma',
          designation: 'NURSE',
          department: 'Cardiology & Emergency ICU',
          qualification: 'B.Sc Nursing / Critical Care Specialist',
          shiftStatus: 'ON_DUTY',
          phone: '+91 98110 55443',
          email: 'sverma@hospital.org',
          experienceYears: 6,
          currentFloorOrWard: 'ICU Ward 3B',
        });
      expect(addRes.status).toBe(201);
      expect(addRes.body.success).toBe(true);
      const staffId = addRes.body.data._id;
      expect(addRes.body.data.employeeId).toMatch(/^HOSP-STF-/);

      // Query staff roster
      const rosterRes = await request(app)
        .get('/api/v1/hospitals/staff?department=Cardiology%20%26%20Emergency%20ICU')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(rosterRes.status).toBe(200);
      expect(rosterRes.body.data.length).toBeGreaterThanOrEqual(1);

      // Update shift status to OFF_DUTY
      const shiftRes = await request(app)
        .patch(`/api/v1/hospitals/staff/${staffId}/shift`)
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ shiftStatus: 'OFF_DUTY' });
      expect(shiftRes.status).toBe(200);
      expect(shiftRes.body.data.shiftStatus).toBe('OFF_DUTY');

      const updatedInDb = await HospitalStaffModel.findById(staffId);
      expect(updatedInDb?.shiftStatus).toBe('OFF_DUTY');
    });
  });

  describe('3. Doctor Longitudinal Patient Lookup by Special Health ID', () => {
    it('should allow verified doctor to lookup complete patient history using #MB-PAT-XXXX', async () => {
      const res = await request(app)
        .get(`/api/v1/doctors/patient-lookup/${encodeURIComponent(patientSpecialId)}`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.patient.specialId).toBe(patientSpecialId);
      expect(res.body.data.patient.fullName).toBe('Aarav Singhania');
      expect(res.body.data.patient.bloodGroup).toBe('B+');
      expect(Array.isArray(res.body.data.pastTreatments)).toBe(true);
      expect(Array.isArray(res.body.data.currentActiveMedications)).toBe(true);
      expect(Array.isArray(res.body.data.pastMedications)).toBe(true);
      expect(Array.isArray(res.body.data.records)).toBe(true);

      // Verify PHI_READ was logged in audit collection
      const audit = await AuditLogModel.findOne({
        action: 'PHI_READ',
        resourceType: 'PatientLongitudinalHistory',
        patientId: patientDbId,
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorRole).toBe('DOCTOR');
    });

    it('should return 404 for unknown special ID', async () => {
      const res = await request(app)
        .get('/api/v1/doctors/patient-lookup/%23MB-PAT-9999')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should forbid unauthenticated or patient lookup of other patient special IDs', async () => {
      const res = await request(app)
        .get(`/api/v1/doctors/patient-lookup/${encodeURIComponent(patientSpecialId)}`)
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('4. Zero-PII Anti-Black-Market Blood & Organ Donor Matching', () => {
    it('should return live blood and organ inventories', async () => {
      const res = await request(app)
        .get('/api/v1/donor-bank/inventory')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bloodInventory.length).toBe(8);
      expect(res.body.data.organInventory.length).toBeGreaterThanOrEqual(4);
      expect(res.body.data.totalRegisteredDonors).toBeGreaterThan(0);
    });

    it('should search compatible donors and strictly return ZERO donor PII', async () => {
      const res = await request(app)
        .get('/api/v1/donor-bank/search-donors?organType=Kidney&minHlaMatch=70')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      // STRICT ZERO-PII ANTI-BLACK-MARKET ASSERTIONS
      res.body.data.forEach((donor: Record<string, unknown>) => {
        expect(donor.donorAliasId).toMatch(/^#DONOR-\d{4}$/);
        expect(donor.hlaMatchPercentage).toBeGreaterThanOrEqual(70);
        expect(donor.nodalRegistryCode).toBeDefined();

        // Must NOT expose PII fields
        expect(donor.name).toBeUndefined();
        expect(donor.fullName).toBeUndefined();
        expect(donor.phone).toBeUndefined();
        expect(donor.phoneNumber).toBeUndefined();
        expect(donor.email).toBeUndefined();
        expect(donor.address).toBeUndefined();
        expect(donor.street).toBeUndefined();
        expect(donor.nationalId).toBeUndefined();
        expect(donor.aadhaar).toBeUndefined();
      });
    });

    it('should submit audited organ allocation request to NOTTO/SOTTO nodal center', async () => {
      const donor = await AnonymizedDonorModel.findOne({ organOrTissueType: 'KIDNEY' });
      expect(donor).not.toBeNull();

      const res = await request(app)
        .post('/api/v1/donor-bank/request-allocation')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          donorAliasId: donor?.donorAliasId,
          recipientSpecialId: patientSpecialId,
          organOrBloodType: 'KIDNEY',
          clinicalUrgency: 'EMERGENCY_CRITICAL',
          justification: 'End-stage renal disease with 96% HLA match and pending dialysis failure.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.allocationId).toBeDefined();
      expect(res.body.data.auditLogged).toBe(true);

      // Verify AuditLogModel entry
      const audit = await AuditLogModel.findOne({
        action: 'ORGAN_DONOR_ALLOCATION_REQUEST',
        resourceType: 'AnonymizedDonor',
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorRole).toBe('DOCTOR');
    });
  });

  describe('5. Voice & Text AI Health Companion with Staged Slot Hold', () => {
    it('should provide structured home remedies and clinical disclaimer for minor ailments', async () => {
      const res = await request(app)
        .post('/api/v1/ai-agent/companion-assist')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          query: 'I have a sore throat, mild cough and fatigue since yesterday',
          channel: 'TEXT',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reply).toBeDefined();
      expect(res.body.data.clinicalDisclaimer).toContain('informational guidance only');
      expect(Array.isArray(res.body.data.homeRemedies)).toBe(true);
      expect(res.body.data.homeRemedies.length).toBeGreaterThan(0);
      expect(Array.isArray(res.body.data.redFlags)).toBe(true);
    });

    it('should stage a next-day slot hold protected by single-use HMAC token if consultation is indicated', async () => {
      const res = await request(app)
        .post('/api/v1/ai-agent/companion-assist')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          query: 'I have severe burning urination and kidney flank pain with high fever',
          channel: 'VOICE',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shouldBookConsultation).toBe(true);
      expect(res.body.data.stagedNextDayBooking).toBeDefined();

      const booking = res.body.data.stagedNextDayBooking;
      expect(booking.holdToken).toBeDefined();
      expect(booking.stagedAction).toBeDefined();
      expect(booking.stagedAction.confirmationToken).toBeDefined();

      // Now confirm the staged booking using HMAC token
      const confirmRes = await request(app)
        .post('/api/v1/ai-agent/confirm-action')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(booking.stagedAction);

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.success).toBe(true);
    });
  });

  describe('6. Govt 108/102 vs Private Ambulance Discovery & Dispatch', () => {
    it('should return nearby Govt 108 (₹0 Free) and Private ICU ambulances', async () => {
      const res = await request(app)
        .get('/api/v1/ambulance-sos/nearby?lat=28.6139&lng=77.2090')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      const govt = res.body.data.find((a: { ambulanceType: string }) => a.ambulanceType === 'GOVERNMENT');
      expect(govt).toBeDefined();
      expect(govt.costEstimate).toBe(0);

      const priv = res.body.data.find((a: { ambulanceType: string }) => a.ambulanceType === 'PRIVATE');
      expect(priv).toBeDefined();
      expect(priv.costEstimate).toBeGreaterThan(0);
    });

    it('should dispatch Govt 108 ambulance with emergency coordinates', async () => {
      const res = await request(app)
        .post('/api/v1/ambulance-sos/dispatch')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          latitude: 28.6139,
          longitude: 77.2090,
          callerPhone: '+91 98100 11223',
          address: 'Connaught Place Block B, New Delhi',
          triageNotes: 'Acute chest pain radiating to left arm',
          ambulanceType: 'GOVERNMENT',
          vehicleTier: 'FREE_EMERGENCY_108',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DISPATCHED');
      expect(res.body.data.ambulanceType).toBe('GOVERNMENT');
      expect(res.body.data.costEstimate).toBe(0);
    });
  });
});
