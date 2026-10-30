import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { bootstrapHospitalAdmin } from '../../src/scripts/bootstrap-hospital-admin';
import { isSafeTestTarget, seedTestUsers, TEST_EMAILS } from '../../src/scripts/seed-test-users';
import { AppointmentModel } from '../../src/modules/appointments/appointment.model';
import { PatientModel } from '../../src/modules/patients/patient.model';
import { HospitalModel } from '../../src/modules/hospitals/hospital.model';
import { DoctorModel } from '../../src/modules/doctors/doctor.model';
import { UserModel } from '../../src/modules/users/user.model';
import { addDaysIst, istWeekday, todayIst } from '../../src/lib/ist-time';

// All accounts below exist only inside this throwaway in-memory database.
const PASSWORD = 'TestOnlyPass123';
const API = '/api/v1';

describe('Role dashboards: auth, ownership, booking lifecycle', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let adminToken: string;
  let otherAdminToken: string;
  let doctorToken: string;
  let doctorId: string;
  let departmentId: string;
  let hospitalId: string;
  let patientAToken: string;
  let patientBToken: string;
  let patientAId: string;
  const extraPatientTokens: string[] = [];

  const tomorrow = addDaysIst(todayIst(), 1);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = async (email: string, password = PASSWORD) =>
    request(app).post(`${API}/auth/login`).send({ email, password });

  const registerPatient = async (email: string, name: string) => {
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send({ email, password: PASSWORD, fullName: name, phone: '9876543210' });
    expect(res.status).toBe(201);
    return res.body.data.accessToken as string;
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDatabase(mongoServer.getUri());
    await Promise.all([
      AppointmentModel.syncIndexes(),
      HospitalModel.syncIndexes(),
      DoctorModel.syncIndexes(),
      UserModel.syncIndexes(),
    ]);

    // 1. Hospital admin via the bootstrap function (same code path as the CLI)
    const boot = await bootstrapHospitalAdmin({
      BOOTSTRAP_HOSPITAL_NAME: 'Dashboard Test Hospital',
      BOOTSTRAP_HOSPITAL_ADDRESS: 'In-memory test database only',
      BOOTSTRAP_HOSPITAL_PHONE: '+91 90000 00000',
      BOOTSTRAP_HOSPITAL_EMAIL: 'hospital@dash.test',
      BOOTSTRAP_ADMIN_NAME: 'Dash Admin',
      BOOTSTRAP_ADMIN_EMAIL: 'admin@dash.test',
      BOOTSTRAP_ADMIN_PASSWORD: PASSWORD,
    });
    expect(boot.status).toBe('CREATED');
    if (boot.status === 'CREATED') hospitalId = boot.hospitalId;

    // Second, unrelated hospital for cross-tenant checks
    await bootstrapHospitalAdmin({
      BOOTSTRAP_HOSPITAL_NAME: 'Other Test Hospital',
      BOOTSTRAP_HOSPITAL_ADDRESS: 'In-memory test database only',
      BOOTSTRAP_HOSPITAL_PHONE: '+91 90000 00001',
      BOOTSTRAP_HOSPITAL_EMAIL: 'other@dash.test',
      BOOTSTRAP_ADMIN_NAME: 'Other Admin',
      BOOTSTRAP_ADMIN_EMAIL: 'other.admin@dash.test',
      BOOTSTRAP_ADMIN_PASSWORD: PASSWORD,
    });

    adminToken = (await login('admin@dash.test')).body.data.accessToken;
    otherAdminToken = (await login('other.admin@dash.test')).body.data.accessToken;

    patientAToken = await registerPatient('patient.a@dash.test', 'Patient Alpha');
    patientBToken = await registerPatient('patient.b@dash.test', 'Patient Beta');
    const userA = await UserModel.findOne({ email: 'patient.a@dash.test' });
    patientAId = (await PatientModel.findOne({ userId: userA?._id }))!._id.toString();
    for (let i = 0; i < 5; i++) {
      extraPatientTokens.push(await registerPatient(`racer${i}@dash.test`, `Racer ${i}`));
    }
  }, 120000);

  afterAll(async () => {
    await disconnectDatabase();
    if (mongoServer) await mongoServer.stop();
  }, 30000);

  // ---------------------------------------------------------------------------
  describe('Registration & login', () => {
    it('public signup cannot create doctor, hospital admin or platform admin accounts', async () => {
      for (const role of ['DOCTOR', 'HOSPITAL', 'ADMIN']) {
        const res = await request(app)
          .post(`${API}/auth/register`)
          .send({ email: `sneaky.${role}@dash.test`, password: PASSWORD, fullName: 'Sneaky', phone: '9876543210', role });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(await UserModel.countDocuments({ email: /sneaky/ })).toBe(0);
    });

    it('rejects weak passwords and malformed emails with 400', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: 'not-an-email', password: '1', fullName: 'X Y', phone: '9876543210' });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toHaveProperty('email');
      expect(res.body.error.details).toHaveProperty('password');
    });

    it('does not fabricate blood group or date of birth for new patients', async () => {
      const patient = await PatientModel.findById(patientAId).lean();
      expect(patient?.bloodGroup).toBeUndefined();
      expect(patient?.dateOfBirth).toBeUndefined();
    });

    it('login returns a `user` object with the role for hospital admin and patient', async () => {
      const admin = await login('admin@dash.test');
      expect(admin.status).toBe(200);
      expect(admin.body.data.user).toMatchObject({ email: 'admin@dash.test', role: 'HOSPITAL', hospitalId });
      const patient = await login('patient.a@dash.test');
      expect(patient.body.data.user.role).toBe('PATIENT');
    });

    it('/auth/me returns the real hospital record for a hospital admin (no hardcoded profile)', async () => {
      const res = await request(app).get(`${API}/auth/me`).set(auth(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.profile.name).toBe('Dashboard Test Hospital');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Hospital admin: departments, doctor invite & verification', () => {
    it('starts with real zero metrics', async () => {
      const res = await request(app).get(`${API}/hospital/stats`).set(auth(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        totalDoctors: 0,
        verifiedDoctors: 0,
        todayAppointments: 0,
        pendingAppointments: 0,
        completedThisWeek: 0,
      });
    });

    it('creates a department and rejects a duplicate name with 409', async () => {
      const res = await request(app).post(`${API}/hospital/departments`).set(auth(adminToken)).send({ name: 'Cardiology' });
      expect(res.status).toBe(201);
      departmentId = res.body.data[0].id;
      const dup = await request(app).post(`${API}/hospital/departments`).set(auth(adminToken)).send({ name: 'cardiology' });
      expect(dup.status).toBe(409);
    });

    it('invites a doctor; the doctor cannot log in until the invite is accepted', async () => {
      const invite = await request(app)
        .post(`${API}/hospital/doctors`)
        .set(auth(adminToken))
        .send({
          fullName: 'Dash Doctor',
          email: 'doctor@dash.test',
          phone: '9876500000',
          specialization: 'Cardiology',
          departmentId,
          registrationNumber: 'TEST-DASH-001',
          medicalCouncil: 'Test Council',
          qualifications: ['MBBS'],
          consultationModes: ['IN_PERSON', 'VIDEO'],
          consultationFee: 500,
          experienceYears: 5,
        });
      expect(invite.status).toBe(201);
      expect(invite.body.data.inviteToken).toMatch(/^[a-f0-9]{64}$/);
      doctorId = invite.body.data.doctorId;

      const beforeAccept = await login('doctor@dash.test');
      expect(beforeAccept.status).toBe(401);

      const accept = await request(app)
        .post(`${API}/auth/accept-invite`)
        .send({ token: invite.body.data.inviteToken, password: PASSWORD });
      expect(accept.status).toBe(200);
      doctorToken = accept.body.data.accessToken;

      const reuse = await request(app)
        .post(`${API}/auth/accept-invite`)
        .send({ token: invite.body.data.inviteToken, password: PASSWORD });
      expect(reuse.status).toBe(400);
    });

    it('unverified doctor cannot publish availability (403) and is not bookable', async () => {
      const res = await request(app)
        .put(`${API}/doctor/availability/weekly`)
        .set(auth(doctorToken))
        .send({ rules: [{ weekday: 1, startTime: '09:00', endTime: '12:00', slotMinutes: 30 }] });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DOCTOR_NOT_VERIFIED');

      const catalog = await request(app).get(`${API}/catalog/doctors`).query({ hospitalId }).set(auth(patientAToken));
      expect(catalog.body.data).toHaveLength(0);
    });

    it('legacy platform ADMIN route cannot verify a hospital doctor', async () => {
      await UserModel.create({
        email: 'platform.admin@dash.test',
        passwordHash: 'x',
        role: 'ADMIN',
      });
      const platformToken = (await UserModel.findOne({ email: 'platform.admin@dash.test' }))!;
      const { signAccessToken } = await import('../../src/lib/crypto');
      const token = signAccessToken({ userId: platformToken._id.toString(), role: 'ADMIN', email: platformToken.email });
      const res = await request(app).patch(`${API}/doctors/${doctorId}/verify`).set(auth(token)).send({ status: 'VERIFIED' });
      expect(res.status).toBe(403);
    });

    it('another hospital admin cannot see or verify this doctor (404)', async () => {
      const list = await request(app).get(`${API}/hospital/doctors`).set(auth(otherAdminToken));
      expect(list.body.data).toHaveLength(0);
      const res = await request(app)
        .patch(`${API}/hospital/doctors/${doctorId}/verification`)
        .set(auth(otherAdminToken))
        .send({ status: 'VERIFIED' });
      expect(res.status).toBe(404);
    });

    it('own hospital admin verifies the doctor (manual registration check)', async () => {
      const res = await request(app)
        .patch(`${API}/hospital/doctors/${doctorId}/verification`)
        .set(auth(adminToken))
        .send({ status: 'VERIFIED', notes: 'Checked against council register' });
      expect(res.status).toBe(200);
      expect(res.body.data.verificationStatus).toBe('VERIFIED');
    });

    it('verified doctor publishes a weekly schedule for tomorrow', async () => {
      const res = await request(app)
        .put(`${API}/doctor/availability/weekly`)
        .set(auth(doctorToken))
        .send({ rules: [{ weekday: istWeekday(tomorrow), startTime: '09:00', endTime: '12:00', slotMinutes: 30 }] });
      expect(res.status).toBe(200);
      expect(res.body.data.schedule.weekly).toHaveLength(1);
    });

    it('rejects overlapping windows with 400', async () => {
      const wd = istWeekday(tomorrow);
      const res = await request(app)
        .put(`${API}/doctor/availability/weekly`)
        .set(auth(doctorToken))
        .send({
          rules: [
            { weekday: wd, startTime: '09:00', endTime: '12:00', slotMinutes: 30 },
            { weekday: wd, startTime: '11:00', endTime: '13:00', slotMinutes: 30 },
          ],
        });
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Role isolation (server-side)', () => {
    it('returns 401 without a token', async () => {
      for (const path of ['/patient/summary', '/doctor/summary', '/hospital/stats', '/catalog/hospitals']) {
        const res = await request(app).get(`${API}${path}`);
        expect(res.status).toBe(401);
      }
    });

    it('returns 403 when a role calls another role’s dashboard API', async () => {
      const cases: Array<[string, string]> = [
        [patientAToken, '/doctor/appointments'],
        [patientAToken, '/hospital/stats'],
        [patientAToken, '/hospital/doctors'],
        [doctorToken, '/patient/summary'],
        [doctorToken, '/hospital/appointments'],
        [adminToken, '/patient/appointments'],
        [adminToken, '/doctor/summary'],
        [adminToken, '/catalog/hospitals'],
      ];
      for (const [token, path] of cases) {
        const res = await request(app).get(`${API}${path}`).set(auth(token));
        expect(res.status, path).toBe(403);
        expect(res.body.success).toBe(false);
      }
    });

    it('patient dashboard shows real empty state', async () => {
      const summary = await request(app).get(`${API}/patient/summary`).set(auth(patientAToken));
      expect(summary.body.data).toEqual({ upcoming: 0, pending: 0, completed: 0 });
      const list = await request(app).get(`${API}/patient/appointments`).set(auth(patientAToken));
      expect(list.body.data.items).toEqual([]);
      expect(list.body.data.pagination.total).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Booking, double-booking and ownership', () => {
    let appointmentId: string;

    it('catalog walks hospital → department → verified doctor → slots', async () => {
      const hospitals = await request(app).get(`${API}/catalog/hospitals`).set(auth(patientAToken));
      expect(hospitals.body.data.map((h: { name: string }) => h.name)).toContain('Dashboard Test Hospital');
      const depts = await request(app).get(`${API}/catalog/hospitals/${hospitalId}/departments`).set(auth(patientAToken));
      expect(depts.body.data).toEqual([{ id: departmentId, name: 'Cardiology' }]);
      const doctors = await request(app).get(`${API}/catalog/doctors`).query({ hospitalId, departmentId }).set(auth(patientAToken));
      expect(doctors.body.data).toHaveLength(1);
      const slots = await request(app).get(`${API}/catalog/doctors/${doctorId}/slots`).query({ date: tomorrow }).set(auth(patientAToken));
      expect(slots.body.data.map((s: { startTime: string }) => s.startTime)).toEqual([
        '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      ]);
    });

    it('patient books a slot → PENDING; booked slot disappears from availability', async () => {
      const res = await request(app)
        .post(`${API}/patient/appointments`)
        .set(auth(patientAToken))
        .set('Idempotency-Key', 'dash-key-0001')
        .send({ doctorId, date: tomorrow, startTime: '09:00', mode: 'IN_PERSON', reason: 'Follow-up' });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.allowedActions).toEqual(['cancel']);
      appointmentId = res.body.data.id;

      const slots = await request(app).get(`${API}/catalog/doctors/${doctorId}/slots`).query({ date: tomorrow }).set(auth(patientAToken));
      expect(slots.body.data.map((s: { startTime: string }) => s.startTime)).not.toContain('09:00');
    });

    it('replaying the same Idempotency-Key returns the original booking (200), not a duplicate', async () => {
      const res = await request(app)
        .post(`${API}/patient/appointments`)
        .set(auth(patientAToken))
        .set('Idempotency-Key', 'dash-key-0001')
        .send({ doctorId, date: tomorrow, startTime: '09:00', mode: 'IN_PERSON' });
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(appointmentId);
      expect(await AppointmentModel.countDocuments({ patientId: patientAId })).toBe(1);
    });

    it('another patient booking the same slot gets 409', async () => {
      const res = await request(app)
        .post(`${API}/patient/appointments`)
        .set(auth(patientBToken))
        .send({ doctorId, date: tomorrow, startTime: '09:00', mode: 'IN_PERSON' });
      expect(res.status).toBe(409);
    });

    it('5 simultaneous bookings for one slot: exactly one succeeds, the rest get 409', async () => {
      const results = await Promise.all(
        extraPatientTokens.map((token) =>
          request(app)
            .post(`${API}/patient/appointments`)
            .set(auth(token))
            .send({ doctorId, date: tomorrow, startTime: '09:30', mode: 'VIDEO' })
        )
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(4);
      expect(await AppointmentModel.countDocuments({ status: 'PENDING', mode: 'VIDEO' })).toBe(1);
    });

    it("another patient cannot cancel or see patient A's appointment", async () => {
      const cancel = await request(app).post(`${API}/patient/appointments/${appointmentId}/cancel`).set(auth(patientBToken)).send({});
      expect(cancel.status).toBe(404);
      const list = await request(app).get(`${API}/patient/appointments`).set(auth(patientBToken));
      expect(list.body.data.items.map((a: { id: string }) => a.id)).not.toContain(appointmentId);
    });

    it('doctor sees patient name, reason and contact only for own appointments', async () => {
      const res = await request(app).get(`${API}/doctor/appointments`).query({ scope: 'pending' }).set(auth(doctorToken));
      expect(res.status).toBe(200);
      const apt = res.body.data.items.find((a: { id: string }) => a.id === appointmentId);
      expect(apt.patient).toEqual({ name: 'Patient Alpha', phone: '9876543210' });
      expect(apt.reason).toBe('Follow-up');
      expect(apt.allowedActions).toEqual(['confirm', 'decline']);
    });

    it('hospital admin list hides reason & patient contact; other hospital sees nothing', async () => {
      const res = await request(app).get(`${API}/hospital/appointments`).query({ status: 'PENDING' }).set(auth(adminToken));
      expect(res.body.data.items.length).toBe(2);
      const apt = res.body.data.items.find((a: { id: string }) => a.id === appointmentId);
      expect(apt.reason).toBeUndefined();
      expect(apt.patient).toEqual({ name: 'Patient Alpha' });

      const search = await request(app).get(`${API}/hospital/appointments`).query({ q: 'alpha' }).set(auth(adminToken));
      expect(search.body.data.items.map((a: { id: string }) => a.id)).toEqual([appointmentId]);

      const other = await request(app).get(`${API}/hospital/appointments`).set(auth(otherAdminToken));
      expect(other.body.data.items).toHaveLength(0);
    });

    it('hospital stats are real aggregates', async () => {
      const res = await request(app).get(`${API}/hospital/stats`).set(auth(adminToken));
      expect(res.body.data).toMatchObject({ totalDoctors: 1, verifiedDoctors: 1, pendingAppointments: 2 });
    });

    it('doctor decline requires a reason (400)', async () => {
      const res = await request(app).post(`${API}/doctor/appointments/${appointmentId}/decline`).set(auth(doctorToken)).send({});
      expect(res.status).toBe(400);
    });

    it('pending → confirmed; complete before start time is rejected with 409', async () => {
      const confirm = await request(app).post(`${API}/doctor/appointments/${appointmentId}/confirm`).set(auth(doctorToken)).send({});
      expect(confirm.status).toBe(200);
      expect(confirm.body.data.status).toBe('CONFIRMED');

      const again = await request(app).post(`${API}/doctor/appointments/${appointmentId}/confirm`).set(auth(doctorToken)).send({});
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('INVALID_TRANSITION');

      const early = await request(app).post(`${API}/doctor/appointments/${appointmentId}/complete`).set(auth(doctorToken)).send({});
      expect(early.status).toBe(409);
    });

    it('changing the schedule so a booked slot disappears returns 409 with the affected booking', async () => {
      const res = await request(app)
        .put(`${API}/doctor/availability/weekly`)
        .set(auth(doctorToken))
        .send({ rules: [{ weekday: istWeekday(tomorrow), startTime: '14:00', endTime: '16:00', slotMinutes: 30 }] });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('AFFECTS_BOOKINGS');
      expect(res.body.error.details.affected.map((a: { appointmentId: string }) => a.appointmentId)).toContain(appointmentId);
    });

    it('adding leave on a booked date also warns with 409', async () => {
      const res = await request(app).post(`${API}/doctor/availability/leave`).set(auth(doctorToken)).send({ date: tomorrow });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('AFFECTS_BOOKINGS');
    });

    it('patient can cancel a confirmed appointment outside the cutoff; slot is released', async () => {
      const res = await request(app).post(`${API}/patient/appointments/${appointmentId}/cancel`).set(auth(patientAToken)).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
      const slots = await request(app).get(`${API}/catalog/doctors/${doctorId}/slots`).query({ date: tomorrow }).set(auth(patientAToken));
      expect(slots.body.data.map((s: { startTime: string }) => s.startTime)).toContain('09:00');
      const twice = await request(app).post(`${API}/patient/appointments/${appointmentId}/cancel`).set(auth(patientAToken)).send({});
      expect(twice.status).toBe(409);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Time-based status rules', () => {
    const seedAppointment = async (minutesFromNow: number, status: 'CONFIRMED' | 'PENDING') => {
      const patientUser = await UserModel.findOne({ email: 'patient.b@dash.test' });
      const patient = await PatientModel.findOne({ userId: patientUser?._id });
      const start = new Date(Date.now() + minutesFromNow * 60 * 1000);
      start.setSeconds(0, 0);
      return AppointmentModel.create({
        patientId: patient?._id,
        doctorId,
        hospitalId,
        startTime: start,
        endTime: new Date(start.getTime() + 30 * 60 * 1000),
        status,
        mode: 'IN_PERSON',
        consultationFee: 500,
      });
    };

    it('confirmed → completed after start; completed can never be cancelled', async () => {
      const apt = await seedAppointment(-45, 'CONFIRMED');
      const done = await request(app).post(`${API}/doctor/appointments/${apt._id}/complete`).set(auth(doctorToken)).send({});
      expect(done.status).toBe(200);
      expect(done.body.data.status).toBe('COMPLETED');

      const patientCancel = await request(app).post(`${API}/patient/appointments/${apt._id}/cancel`).set(auth(patientBToken)).send({});
      expect(patientCancel.status).toBe(409);
      const doctorCancel = await request(app)
        .post(`${API}/doctor/appointments/${apt._id}/cancel`)
        .set(auth(doctorToken))
        .send({ reason: 'test' });
      expect(doctorCancel.status).toBe(409);
      // Legacy endpoint also refuses
      const legacy = await request(app).post(`${API}/appointments/${apt._id}/cancel`).set(auth(patientBToken)).send({});
      expect(legacy.status).toBe(409);
    });

    it('doctor can mark no-show after start time', async () => {
      const apt = await seedAppointment(-120, 'CONFIRMED');
      const res = await request(app).post(`${API}/doctor/appointments/${apt._id}/no-show`).set(auth(doctorToken)).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('NO_SHOW');
    });

    it('patient cannot cancel a confirmed appointment inside the cutoff window', async () => {
      const apt = await seedAppointment(60, 'CONFIRMED');
      const res = await request(app).post(`${API}/patient/appointments/${apt._id}/cancel`).set(auth(patientBToken)).send({});
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/hour/);
    });

    it('invalid ids return 404, not 500', async () => {
      const res = await request(app).post(`${API}/patient/appointments/not-an-id/cancel`).set(auth(patientAToken)).send({});
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Deactivation & rate limiting', () => {
    it('deactivating a doctor with bookings needs confirmation; then their token stops working', async () => {
      const warn = await request(app).patch(`${API}/hospital/doctors/${doctorId}/active`).set(auth(adminToken)).send({ isActive: false });
      expect(warn.status).toBe(409);
      expect(warn.body.error.code).toBe('AFFECTS_BOOKINGS');

      const ok = await request(app)
        .patch(`${API}/hospital/doctors/${doctorId}/active`)
        .set(auth(adminToken))
        .send({ isActive: false, confirm: true });
      expect(ok.status).toBe(200);

      const blocked = await request(app).get(`${API}/doctor/summary`).set(auth(doctorToken));
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('ACCOUNT_INACTIVE');

      const catalog = await request(app).get(`${API}/catalog/doctors`).query({ hospitalId }).set(auth(patientAToken));
      expect(catalog.body.data).toHaveLength(0);
    });

    it('booking endpoint is rate limited (429)', async () => {
      let last = 0;
      for (let i = 0; i < 21; i++) {
        const res = await request(app)
          .post(`${API}/patient/appointments`)
          .set(auth(patientAToken))
          .set('x-test-rate-limit', 'true')
          .send({});
        last = res.status;
      }
      expect(last).toBe(429);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Test-data seed script safety', () => {
    it('refuses non-local, non-test databases', () => {
      expect(isSafeTestTarget('mongodb+srv://u:p@cluster0.abc.mongodb.net/medibridge', 'development')).toBe(false);
      expect(isSafeTestTarget('mongodb://127.0.0.1:27017/medibridge_dev', 'development')).toBe(true);
      expect(isSafeTestTarget('mongodb+srv://u:p@cluster0.abc.mongodb.net/medibridge_test', 'development')).toBe(true);
    });

    it('creates one clearly-marked test user per role that can log in', async () => {
      await seedTestUsers(PASSWORD);
      for (const [role, email] of [
        ['HOSPITAL', TEST_EMAILS.hospitalAdmin],
        ['DOCTOR', TEST_EMAILS.doctor],
        ['PATIENT', TEST_EMAILS.patient],
      ]) {
        const res = await login(email);
        expect(res.status, email).toBe(200);
        expect(res.body.data.user.role).toBe(role);
        expect((await UserModel.findOne({ email }))?.isTestAccount).toBe(true);
      }
    });
  });
});
