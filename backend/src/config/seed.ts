import crypto from 'crypto';
import { UserModel } from '../modules/users/user.model';
import { PatientModel } from '../modules/patients/patient.model';
import { DoctorModel } from '../modules/doctors/doctor.model';
import { SlotModel } from '../modules/appointments/slot.model';
import { ConsentGrantModel } from '../modules/consent/consent.model';
import { PrescriptionModel } from '../modules/prescriptions/prescription.model';
import { MedicalRecordModel } from '../modules/medical-records/medical-record.model';
import { HospitalStaffModel, ShiftStatus, StaffDesignation } from '../modules/hospitals/hospital-staff.model';
import { AnonymizedDonorModel } from '../modules/donor-organ-blood-bank/anonymized-donor.model';
import { BloodOrganBankModel, BloodGroupType, OrganTissueType } from '../modules/donor-organ-blood-bank/blood-organ-bank.model';
import { hashPassword, encryptPhi } from '../lib/crypto';
import { logger } from '../lib/logger';

export const seedBaselineData = async (): Promise<void> => {
  try {
    const passwordHash = await hashPassword('Password123!');

    // 1. Seed Demo Patient (Alice Patient)
    let aliceUser = await UserModel.findOne({ email: 'alice.patient@medibridge.internal' });
    let alicePatient = aliceUser ? await PatientModel.findOne({ userId: aliceUser._id }) : null;

    if (!aliceUser) {
      aliceUser = await UserModel.create({
        email: 'alice.patient@medibridge.internal',
        passwordHash,
        role: 'PATIENT',
      });
      alicePatient = await PatientModel.create({
        userId: aliceUser._id,
        fullName: 'Alice Patient',
        phone: '+91 98100 11223',
        specialId: '#MB-PAT-4821',
        bloodGroup: 'O+',
        dateOfBirth: '1992-06-14',
        gender: 'FEMALE',
        emergencyContact: 'Meera Singhania (+91 98100 44556)',
      });
      logger.info('Seeded baseline patient: Alice Patient (#MB-PAT-4821)');
    }

    // 2. Seed Verified Doctor (Dr. Gregory House)
    let houseUser = await UserModel.findOne({ email: 'dr.house@medibridge.internal' });
    let houseDoctor = houseUser ? await DoctorModel.findOne({ userId: houseUser._id }) : null;

    if (!houseUser) {
      houseUser = await UserModel.create({
        email: 'dr.house@medibridge.internal',
        passwordHash,
        role: 'DOCTOR',
      });
      houseDoctor = await DoctorModel.create({
        userId: houseUser._id,
        fullName: 'Dr. Gregory House',
        phone: '+91 98200 44556',
        specialization: 'Internal Medicine & Nephrology',
        licenseNumber: 'RMP-NMC-LIFE-999',
        medicalCouncil: 'Delhi Medical Council',
        consultationFee: 1000,
        experienceYears: 18,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        rating: 4.95,
        totalConsultations: 180,
        patientSatisfactionPercent: 98,
        availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      });
      logger.info('Seeded baseline doctor: Dr. Gregory House (VERIFIED)');
    }

    // 3. Seed Verified Doctor (Dr. Raymond Scanlon)
    let scanlonUser = await UserModel.findOne({ email: 'dr.scanlon@medibridge.internal' });
    let scanlonDoctor = scanlonUser ? await DoctorModel.findOne({ userId: scanlonUser._id }) : null;

    if (!scanlonUser) {
      scanlonUser = await UserModel.create({
        email: 'dr.scanlon@medibridge.internal',
        passwordHash,
        role: 'DOCTOR',
      });
      scanlonDoctor = await DoctorModel.create({
        userId: scanlonUser._id,
        fullName: 'Dr. Raymond Scanlon',
        phone: '+91 98200 44557',
        specialization: 'Diagnostic Radiology',
        licenseNumber: 'RMP-NMC-RAD-442',
        medicalCouncil: 'Maharashtra Medical Council',
        consultationFee: 1200,
        experienceYears: 12,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        rating: 4.88,
        totalConsultations: 110,
        patientSatisfactionPercent: 96,
        availableDays: ['Tuesday', 'Thursday', 'Saturday'],
      });
      logger.info('Seeded baseline doctor: Dr. Raymond Scanlon (VERIFIED)');
    }

    // 4. Seed Pending Doctor (Dr. Allison Cameron)
    let cameronUser = await UserModel.findOne({ email: 'dr.cameron@medibridge.internal' });
    if (!cameronUser) {
      cameronUser = await UserModel.create({
        email: 'dr.cameron@medibridge.internal',
        passwordHash,
        role: 'DOCTOR',
      });
      await DoctorModel.create({
        userId: cameronUser._id,
        fullName: 'Dr. Allison Cameron',
        phone: '+91 98200 44558',
        specialization: 'Clinical Immunology',
        licenseNumber: 'RMP-NMC-IMM-603',
        medicalCouncil: 'Karnataka Medical Council',
        consultationFee: 1100,
        experienceYears: 7,
        verificationStatus: 'PENDING',
        rating: 4.8,
        totalConsultations: 45,
        patientSatisfactionPercent: 94,
        availableDays: ['Wednesday', 'Saturday'],
      });
      logger.info('Seeded baseline doctor: Dr. Allison Cameron (PENDING)');
    }

    // 5. Seed Hospital User
    const hospitalUser = await UserModel.findOne({ email: 'hospital.admin@medibridge.internal' });
    if (!hospitalUser) {
      await UserModel.create({
        email: 'hospital.admin@medibridge.internal',
        passwordHash,
        role: 'HOSPITAL',
      });
      logger.info('Seeded baseline hospital admin');
    }

    // 6. Seed Admin User
    const adminUser = await UserModel.findOne({ email: 'admin.compliance@medibridge.internal' });
    if (!adminUser) {
      await UserModel.create({
        email: 'admin.compliance@medibridge.internal',
        passwordHash,
        role: 'ADMIN',
      });
      logger.info('Seeded baseline platform administrator');
    }

    // 7. Seed Appointment Slots for Dr. House & Dr. Scanlon
    if (houseDoctor) {
      const existingSlots = await SlotModel.countDocuments({ doctorId: houseDoctor._id });
      if (existingSlots === 0) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);

        const slotTimes = [
          { hour: 10, minute: 0 },
          { hour: 10, minute: 30 },
          { hour: 11, minute: 0 },
          { hour: 14, minute: 0 },
          { hour: 14, minute: 30 },
        ];

        for (const t of slotTimes) {
          const start = new Date(tomorrow);
          start.setHours(t.hour, t.minute, 0, 0);
          const end = new Date(start.getTime() + 30 * 60 * 1000);

          await SlotModel.create({
            doctorId: houseDoctor._id,
            startTime: start,
            endTime: end,
            status: 'AVAILABLE',
          });
        }
        logger.info(`Seeded ${slotTimes.length} appointment slots for Dr. House`);
      }
    }

    // 8. Seed Consent Grants for Alice <-> Dr. House
    if (alicePatient && houseDoctor) {
      const existingGrants = await ConsentGrantModel.countDocuments({ patientId: alicePatient._id });
      if (existingGrants === 0) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);

        await ConsentGrantModel.create({
          patientId: alicePatient._id,
          doctorId: houseDoctor._id,
          categories: ['CLINICAL_NOTES', 'LAB_RESULTS', 'PRESCRIPTIONS'],
          status: 'ACTIVE',
          grantedAt: new Date(),
          expiresAt: expiryDate,
        });

        if (scanlonDoctor) {
          await ConsentGrantModel.create({
            patientId: alicePatient._id,
            doctorId: scanlonDoctor._id,
            categories: ['IMAGING_REPORTS'],
            status: 'ACTIVE',
            grantedAt: new Date(),
            expiresAt: expiryDate,
          });
        }
        logger.info('Seeded baseline active consent grants for Alice Patient');
      }
    }

    // 9. Seed Prescriptions for Alice by Dr. House
    if (alicePatient && houseDoctor) {
      const existingRx = await PrescriptionModel.countDocuments({ patientId: alicePatient._id });
      if (existingRx === 0) {
        await PrescriptionModel.create({
          patientId: alicePatient._id,
          doctorId: houseDoctor._id,
          medications: [
            {
              name: 'Metformin Hydrochloride',
              dosage: '500mg',
              frequency: 'Twice daily after meals',
              duration: '30 days',
              instructions: 'Monitor fasting blood sugar weekly.',
            },
            {
              name: 'Ramipril',
              dosage: '5mg',
              frequency: 'Once daily morning',
              duration: '90 days',
              instructions: 'Blood pressure control and renal protection.',
            },
          ],
          status: 'ISSUED',
          digitalSignature: `sig:v1:${crypto.randomBytes(32).toString('hex')}`,
          signedAt: new Date(),
          signedBy: houseDoctor._id,
          notes: 'Standard glycemic management and cardiovascular prophylaxis.',
        });
        logger.info('Seeded baseline issued prescription with digital signature digest');
      }
    }

    // 10. Seed Encrypted Medical Records for Alice
    if (alicePatient && houseDoctor) {
      const existingRecords = await MedicalRecordModel.countDocuments({ patientId: alicePatient._id });
      if (existingRecords === 0) {
        const notes = 'Patient exhibits mild proteinuria. Glomerular filtration rate is stable. Fasting blood sugar: 95 mg/dL (Normal). Recommended continued lifestyle moderation and metformin 500mg.';
        const encryptedNotes = encryptPhi(notes);

        await MedicalRecordModel.create({
          patientId: alicePatient._id,
          doctorId: houseDoctor._id,
          category: 'CLINICAL_NOTES',
          title: 'Comprehensive Nephrology & Glycemic Evaluation',
          encryptedNotes,
          attachments: [],
        });

        await MedicalRecordModel.create({
          patientId: alicePatient._id,
          doctorId: houseDoctor._id,
          category: 'LAB_RESULTS',
          title: 'Fasting Blood Sugar & Lipid Profile',
          encryptedNotes: encryptPhi('Fasting Blood Glucose: 95 mg/dL. Total Cholesterol: 172 mg/dL. Triglycerides: 140 mg/dL. All markers within target physiological bounds.'),
          attachments: [],
        });
        logger.info('Seeded baseline AES-256-GCM encrypted medical records');
      }
    }

    // 11. Seed Hospital Staff Roster
    const staffCount = await HospitalStaffModel.countDocuments();
    if (staffCount === 0) {
      const defaultStaff = [
        {
          employeeId: 'HOSP-STF-001',
          name: 'Sister Sunita Verma',
          designation: 'NURSE' as StaffDesignation,
          department: 'Cardiology & Emergency ICU',
          qualification: 'B.Sc Nursing, Critical Care Certified',
          shiftStatus: 'ON_DUTY' as ShiftStatus,
          phone: '+91 98110 55443',
          email: 'sverma@hospital.org',
          experienceYears: 6,
          currentFloorOrWard: 'ICU Ward 3B',
        },
        {
          employeeId: 'HOSP-STF-002',
          name: 'Dr. Rajesh Sen',
          designation: 'DUTY_DOCTOR' as StaffDesignation,
          department: 'Emergency & Critical Care',
          qualification: 'MBBS, Emergency Medicine Certified',
          shiftStatus: 'ON_DUTY' as ShiftStatus,
          phone: '+91 98101 22334',
          email: 'rsen@hospital.org',
          experienceYears: 4,
          currentFloorOrWard: 'Emergency Bay 1',
        },
        {
          employeeId: 'HOSP-STF-003',
          name: 'Amitabh Sen',
          designation: 'LAB_TECHNICIAN' as StaffDesignation,
          department: 'Diagnostic Radiology & Pathology',
          qualification: 'M.Sc Medical Lab Technology',
          shiftStatus: 'ON_DUTY' as ShiftStatus,
          phone: '+91 98111 00102',
          email: 'asen@hospital.org',
          experienceYears: 5,
          currentFloorOrWard: 'Central Diagnostic Wing',
        },
        {
          employeeId: 'HOSP-STF-004',
          name: 'Pooja Kashyap',
          designation: 'PHARMACIST' as StaffDesignation,
          department: 'In-Patient Pharmacy & Dispensing',
          qualification: 'B.Pharm, Registered Pharmacist',
          shiftStatus: 'ON_CALL' as ShiftStatus,
          phone: '+91 98111 00104',
          email: 'pkashyap@hospital.org',
          experienceYears: 4,
          currentFloorOrWard: 'Main Pharmacy Vault',
        },
      ];
      await HospitalStaffModel.insertMany(defaultStaff);
      logger.info('Seeded baseline hospital staff roster');
    }

    // 12. Seed Donor Bank & Blood Inventory
    const donorCount = await AnonymizedDonorModel.countDocuments();
    if (donorCount === 0) {
      const defaultDonors = [
        {
          donorAliasId: '#DONOR-8821',
          bloodGroup: 'O-' as BloodGroupType,
          organOrTissueType: 'BLOOD' as OrganTissueType,
          hlaMatchPercentage: 100,
          ageBracket: '25-35',
          medicalFitnessStatus: 'FIT_APPROVED' as const,
          nodalRegistryCode: 'NOTTO-DL-402',
          distanceKm: 4.8,
          isAvailable: true,
          registryAuditHash: crypto.randomBytes(16).toString('hex'),
        },
        {
          donorAliasId: '#DONOR-9043',
          bloodGroup: 'A+' as BloodGroupType,
          organOrTissueType: 'KIDNEY' as OrganTissueType,
          hlaMatchPercentage: 94,
          ageBracket: '30-40',
          medicalFitnessStatus: 'FIT_APPROVED' as const,
          nodalRegistryCode: 'NOTTO-DL-408',
          distanceKm: 8.2,
          isAvailable: true,
          registryAuditHash: crypto.randomBytes(16).toString('hex'),
        },
        {
          donorAliasId: '#DONOR-4412',
          bloodGroup: 'B+' as BloodGroupType,
          organOrTissueType: 'LIVER' as OrganTissueType,
          hlaMatchPercentage: 88,
          ageBracket: '25-35',
          medicalFitnessStatus: 'FIT_APPROVED' as const,
          nodalRegistryCode: 'NOTTO-DL-412',
          distanceKm: 14.5,
          isAvailable: true,
          registryAuditHash: crypto.randomBytes(16).toString('hex'),
        },
      ];
      await AnonymizedDonorModel.insertMany(defaultDonors);
      logger.info('Seeded baseline anonymized blood and organ donors');
    }

    const bankCount = await BloodOrganBankModel.countDocuments();
    if (bankCount === 0) {
      await BloodOrganBankModel.create({
        hospitalFacility: 'Metropolitan Nodal Blood & Organ Bank',
        bloodInventory: [
          { bloodGroup: 'O+', wholeBloodUnits: 42, prbcUnits: 55, plateletUnits: 28, ffpUnits: 34, lastTestedAt: new Date() },
          { bloodGroup: 'O-', wholeBloodUnits: 14, prbcUnits: 18, plateletUnits: 9, ffpUnits: 12, lastTestedAt: new Date() },
          { bloodGroup: 'A+', wholeBloodUnits: 36, prbcUnits: 48, plateletUnits: 22, ffpUnits: 30, lastTestedAt: new Date() },
          { bloodGroup: 'B+', wholeBloodUnits: 38, prbcUnits: 50, plateletUnits: 25, ffpUnits: 32, lastTestedAt: new Date() },
        ],
        organRegistry: [
          { organType: 'KIDNEY', availableCount: 2, nodalCenter: 'AIIMS Delhi Organ Recovery Nodal Unit', preservationColdIschemiaLimitHours: 24, status: 'READY_FOR_MATCH' },
          { organType: 'LIVER', availableCount: 1, nodalCenter: 'ILBS New Delhi Hepatic Transplant Wing', preservationColdIschemiaLimitHours: 12, status: 'READY_FOR_MATCH' },
          { organType: 'CORNEA', availableCount: 6, nodalCenter: 'Dr. R.P. Centre for Ophthalmic Sciences', preservationColdIschemiaLimitHours: 96, status: 'READY_FOR_MATCH' },
        ],
      });
      logger.info('Seeded baseline blood & organ bank inventory');
    }

    logger.info('MediBridge baseline database seeding completed successfully');
  } catch (error) {
    logger.error({ error }, 'Error while seeding baseline database records');
  }
};
