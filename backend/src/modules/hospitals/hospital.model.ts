import { Schema, model, Document, Types } from 'mongoose';

export interface IDepartment {
  _id: Types.ObjectId;
  name: string;
  isActive: boolean;
}

export interface IHospital extends Document {
  name: string;
  address: string;
  phone: string;
  email: string;
  departments: Types.DocumentArray<IDepartment>;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const departmentSchema = new Schema<IDepartment>({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  isActive: { type: Boolean, default: true },
});

const hospitalSchema = new Schema<IHospital>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    departments: { type: [departmentSchema], default: [] },
    isVerified: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
  }
);

export const HospitalModel = model<IHospital>('Hospital', hospitalSchema);
