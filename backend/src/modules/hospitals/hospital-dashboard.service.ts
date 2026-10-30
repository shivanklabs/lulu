import { HospitalStaffModel, IHospitalStaff, ShiftStatus, StaffDesignation } from './hospital-staff.model';
import { DoctorModel, IDoctor } from '../doctors/doctor.model';
import { AmbulanceDispatchModel } from '../ambulance-sos/ambulance-dispatch.model';
import { AppError } from '../../middleware/errorHandler';

export interface TopDoctorView {
  _id: string;
  fullName: string;
  specialization: string;
  licenseNumber: string;
  rating: number;
  totalConsultations: number;
  patientSatisfactionPercent: number;
  consultationFee: number;
  verificationStatus: string;
  clinicAddress?: string;
  badges: string[];
}

export interface HospitalOverviewData {
  facilityName: string;
  accreditation: string;
  departmentsCount: number;
  doctorsCount: number;
  verifiedDoctorsCount: number;
  totalStaffCount: number;
  onDutyStaffCount: number;
  activeAmbulancesDispatched: number;
  systemHealth: string;
}

const DEFAULT_STAFF_SEEDS = [
  {
    employeeId: 'HOSP-STF-001',
    name: 'Sunita Mehra, RN',
    designation: 'NURSE' as StaffDesignation,
    department: 'Critical Care & ICU',
    qualification: 'B.Sc Nursing, BLS/ACLS Certified',
    shiftStatus: 'ON_DUTY' as ShiftStatus,
    phone: '+91 98111 00101',
    email: 'sunita.mehra@hospital.example.com',
    experienceYears: 7,
    currentFloorOrWard: 'ICU Block A, 3rd Floor',
  },
  {
    employeeId: 'HOSP-STF-002',
    name: 'Amitabh Sen',
    designation: 'LAB_TECHNICIAN' as StaffDesignation,
    department: 'Clinical Pathology & Biochemistry',
    qualification: 'M.Sc Medical Lab Technology (MLT)',
    shiftStatus: 'ON_DUTY' as ShiftStatus,
    phone: '+91 98111 00102',
    email: 'amitabh.sen@hospital.example.com',
    experienceYears: 5,
    currentFloorOrWard: 'Central Diagnostic Wing, Ground Floor',
  },
  {
    employeeId: 'HOSP-STF-003',
    name: 'Rajesh Sharma',
    designation: 'PARAMEDIC' as StaffDesignation,
    department: 'Trauma & Emergency Response',
    qualification: 'Diploma in Emergency Medical Services (EMT-P)',
    shiftStatus: 'ON_DUTY' as ShiftStatus,
    phone: '+91 98101 23456',
    email: 'rajesh.paramedic@hospital.example.com',
    experienceYears: 9,
    currentFloorOrWard: 'Ambulance Fleet Bay 1',
  },
  {
    employeeId: 'HOSP-STF-004',
    name: 'Pooja Kashyap',
    designation: 'PHARMACIST' as StaffDesignation,
    department: 'In-Patient Pharmacy & Dispensing',
    qualification: 'B.Pharm, Registered State Pharmacist',
    shiftStatus: 'ON_CALL' as ShiftStatus,
    phone: '+91 98111 00104',
    email: 'pooja.pharm@hospital.example.com',
    experienceYears: 4,
    currentFloorOrWard: 'Main Pharmacy Vault',
  },
  {
    employeeId: 'HOSP-STF-005',
    name: 'Vikram Joshi',
    designation: 'ADMIN_OFFICER' as StaffDesignation,
    department: 'Patient Admissions & Bed Allocation',
    qualification: 'Masters in Hospital Administration (MHA)',
    shiftStatus: 'ON_DUTY' as ShiftStatus,
    phone: '+91 98111 00105',
    email: 'vikram.admissions@hospital.example.com',
    experienceYears: 8,
    currentFloorOrWard: 'Admissions Desk, Concourse',
  },
  {
    employeeId: 'HOSP-STF-006',
    name: 'Kavita Nair, RN',
    designation: 'NURSE' as StaffDesignation,
    department: 'Pediatric & Neonatal Care',
    qualification: 'Post-Basic B.Sc Nursing (Pediatrics)',
    shiftStatus: 'OFF_DUTY' as ShiftStatus,
    phone: '+91 98111 00106',
    email: 'kavita.nair@hospital.example.com',
    experienceYears: 6,
    currentFloorOrWard: 'NICU Wing 4',
  },
];

export class HospitalDashboardService {
  private static async seedDefaultStaffIfEmpty(): Promise<void> {
    const count = await HospitalStaffModel.countDocuments();
    if (count === 0) {
      await HospitalStaffModel.insertMany(DEFAULT_STAFF_SEEDS);
    }
  }

  static async getOverview(): Promise<HospitalOverviewData> {
    await this.seedDefaultStaffIfEmpty();

    const [doctorsCount, verifiedDoctorsCount, totalStaffCount, onDutyStaffCount, activeAmbulances] =
      await Promise.all([
        DoctorModel.countDocuments(),
        DoctorModel.countDocuments({ verificationStatus: 'VERIFIED' }),
        HospitalStaffModel.countDocuments(),
        HospitalStaffModel.countDocuments({ shiftStatus: 'ON_DUTY' }),
        AmbulanceDispatchModel.countDocuments({ status: { $in: ['DISPATCHED', 'EN_ROUTE'] } }),
      ]);

    return {
      facilityName: 'Metropolitan Clinical Health Network',
      accreditation: 'NABH Accredited & DPDPA / ABDM Verified Healthcare Fiduciary',
      departmentsCount: 14,
      doctorsCount,
      verifiedDoctorsCount,
      totalStaffCount,
      onDutyStaffCount,
      activeAmbulancesDispatched: activeAmbulances,
      systemHealth: 'OPERATIONAL',
    };
  }

  static async getTopDoctors(): Promise<TopDoctorView[]> {
    const verifiedDoctors = await DoctorModel.find({ verificationStatus: 'VERIFIED' }).limit(10);

    return verifiedDoctors.map((doc: IDoctor, idx: number) => {
      const rating = Number((4.85 + (idx % 3) * 0.05).toFixed(2));
      const totalConsultations = 140 + (idx + 1) * 35;
      const patientSatisfactionPercent = 97 + (idx % 3);

      return {
        _id: (doc._id as unknown as string).toString(),
        fullName: doc.fullName,
        specialization: doc.specialization,
        licenseNumber: doc.licenseNumber,
        rating: Math.min(5.0, rating),
        totalConsultations,
        patientSatisfactionPercent,
        consultationFee: doc.consultationFee,
        verificationStatus: doc.verificationStatus,
        clinicAddress: doc.clinicAddress || 'Metropolitan Specialty Medical Center',
        badges: ['NMC Verified RMP', 'Top Rated Specialist', 'Clinical Excellence 2024'],
      };
    });
  }

  static async getStaffRoster(filter?: {
    shiftStatus?: ShiftStatus;
    department?: string;
    search?: string;
  }): Promise<IHospitalStaff[]> {
    await this.seedDefaultStaffIfEmpty();

    const query: Record<string, unknown> = {};
    if (filter?.shiftStatus) {
      query.shiftStatus = filter.shiftStatus;
    }
    if (filter?.department) {
      query.department = new RegExp(filter.department, 'i');
    }
    if (filter?.search) {
      query.$or = [
        { name: new RegExp(filter.search, 'i') },
        { employeeId: new RegExp(filter.search, 'i') },
        { department: new RegExp(filter.search, 'i') },
        { designation: new RegExp(filter.search, 'i') },
      ];
    }

    return HospitalStaffModel.find(query).sort({ shiftStatus: 1, name: 1 });
  }

  static async addStaffMember(data: Partial<IHospitalStaff>): Promise<IHospitalStaff> {
    if (!data.name || !data.designation || !data.department || !data.phone) {
      throw new AppError('Name, designation, department, and phone are required', 400, 'INVALID_INPUT');
    }

    const employeeId = data.employeeId || `HOSP-STF-${Math.floor(100 + Math.random() * 900)}`;
    const staff = await HospitalStaffModel.create({
      ...data,
      employeeId,
      qualification: data.qualification || 'Certified Healthcare Professional',
      shiftStatus: data.shiftStatus || 'ON_DUTY',
      email: data.email || `${employeeId.toLowerCase()}@hospital.example.com`,
      experienceYears: data.experienceYears || 2,
    });

    return staff;
  }

  static async updateStaffShiftStatus(staffId: string, shiftStatus: ShiftStatus): Promise<IHospitalStaff> {
    const staff = await HospitalStaffModel.findByIdAndUpdate(
      staffId,
      { shiftStatus },
      { new: true }
    );
    if (!staff) {
      throw new AppError('Hospital staff member not found', 404, 'NOT_FOUND');
    }
    return staff;
  }
}
