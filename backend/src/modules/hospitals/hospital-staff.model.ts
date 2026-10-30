import { Schema, model, Document } from 'mongoose';

export type StaffDesignation =
  | 'NURSE'
  | 'LAB_TECHNICIAN'
  | 'PARAMEDIC'
  | 'PHARMACIST'
  | 'ADMIN_OFFICER'
  | 'DUTY_DOCTOR';

export type ShiftStatus = 'ON_DUTY' | 'OFF_DUTY' | 'ON_CALL';

export interface IHospitalStaff extends Document {
  employeeId: string;
  name: string;
  designation: StaffDesignation;
  department: string;
  qualification: string;
  shiftStatus: ShiftStatus;
  phone: string;
  email: string;
  experienceYears: number;
  currentFloorOrWard?: string;
  facilityId?: string;
  facilityName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const hospitalStaffSchema = new Schema<IHospitalStaff>(
  {
    employeeId: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    designation: {
      type: String,
      required: true,
      enum: ['NURSE', 'LAB_TECHNICIAN', 'PARAMEDIC', 'PHARMACIST', 'ADMIN_OFFICER', 'DUTY_DOCTOR'],
      index: true,
    },
    department: { type: String, required: true, trim: true },
    qualification: { type: String, required: true, trim: true },
    shiftStatus: {
      type: String,
      required: true,
      enum: ['ON_DUTY', 'OFF_DUTY', 'ON_CALL'],
      default: 'ON_DUTY',
      index: true,
    },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    experienceYears: { type: Number, required: true, default: 1 },
    currentFloorOrWard: { type: String, trim: true },
    facilityId: { type: String, trim: true, index: true },
    facilityName: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

export const HospitalStaffModel = model<IHospitalStaff>('HospitalStaff', hospitalStaffSchema);
