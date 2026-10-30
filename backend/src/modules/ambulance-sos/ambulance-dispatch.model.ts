import { Schema, model, Document, Types } from 'mongoose';

export type AmbulanceStatus = 'DISPATCHED' | 'EN_ROUTE' | 'ARRIVED' | 'CANCELLED' | 'COMPLETED';
export type AmbulanceType = 'GOVERNMENT' | 'PRIVATE';
export type AmbulanceVehicleTier = 'BASIC_LIFE_SUPPORT' | 'ADVANCED_ICU' | 'FREE_EMERGENCY_108';

export interface IAmbulanceDispatch extends Document {
  patientId: Types.ObjectId;
  callerPhone: string;
  patientName: string;
  ambulanceType: AmbulanceType;
  vehicleTier: AmbulanceVehicleTier;
  costEstimate: number;
  pickupLocation: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
    address?: string;
  };
  hospitalId?: Types.ObjectId;
  assignedHospitalName: string;
  status: AmbulanceStatus;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  etaMinutes: number;
  triageNotes?: string;
  dispatchedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ambulanceDispatchSchema = new Schema<IAmbulanceDispatch>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    callerPhone: { type: String, required: true },
    patientName: { type: String, required: true },
    ambulanceType: {
      type: String,
      enum: ['GOVERNMENT', 'PRIVATE'],
      default: 'GOVERNMENT',
      index: true,
    },
    vehicleTier: {
      type: String,
      enum: ['BASIC_LIFE_SUPPORT', 'ADVANCED_ICU', 'FREE_EMERGENCY_108'],
      default: 'FREE_EMERGENCY_108',
    },
    costEstimate: { type: Number, default: 0 },
    pickupLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
      address: { type: String },
    },
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital' },
    assignedHospitalName: { type: String, required: true, default: 'MediBridge Central Emergency Unit' },
    status: {
      type: String,
      enum: ['DISPATCHED', 'EN_ROUTE', 'ARRIVED', 'CANCELLED', 'COMPLETED'],
      default: 'DISPATCHED',
      index: true,
    },
    vehicleNumber: { type: String, required: true },
    driverName: { type: String, required: true },
    driverPhone: { type: String, required: true },
    etaMinutes: { type: Number, required: true, default: 8 },
    triageNotes: { type: String },
    dispatchedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

ambulanceDispatchSchema.index({ pickupLocation: '2dsphere' }, { sparse: true });

export const AmbulanceDispatchModel = model<IAmbulanceDispatch>('AmbulanceDispatch', ambulanceDispatchSchema);
