import { Schema, model, Document } from 'mongoose';

export type BloodGroupType = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-';
export type OrganTissueType = 'BLOOD' | 'KIDNEY' | 'LIVER' | 'CORNEA' | 'HEART' | 'BONE_MARROW';

export interface IBloodInventoryItem {
  bloodGroup: BloodGroupType;
  wholeBloodUnits: number;
  prbcUnits: number; // Packed Red Blood Cells
  plateletUnits: number;
  ffpUnits: number; // Fresh Frozen Plasma
  lastTestedAt: Date;
}

export interface IOrganInventoryItem {
  organType: OrganTissueType;
  availableCount: number;
  nodalCenter: string;
  preservationColdIschemiaLimitHours: number;
  status: 'READY_FOR_MATCH' | 'ALLOCATED' | 'MAINTENANCE';
}

export interface IBloodOrganBank extends Document {
  hospitalFacility: string;
  bloodInventory: IBloodInventoryItem[];
  organRegistry: IOrganInventoryItem[];
  updatedAt: Date;
}

const bloodInventoryItemSchema = new Schema<IBloodInventoryItem>({
  bloodGroup: {
    type: String,
    required: true,
    enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
  },
  wholeBloodUnits: { type: Number, required: true, default: 0 },
  prbcUnits: { type: Number, required: true, default: 0 },
  plateletUnits: { type: Number, required: true, default: 0 },
  ffpUnits: { type: Number, required: true, default: 0 },
  lastTestedAt: { type: Date, default: Date.now },
});

const organInventoryItemSchema = new Schema<IOrganInventoryItem>({
  organType: {
    type: String,
    required: true,
    enum: ['BLOOD', 'KIDNEY', 'LIVER', 'CORNEA', 'HEART', 'BONE_MARROW'],
  },
  availableCount: { type: Number, required: true, default: 0 },
  nodalCenter: { type: String, required: true },
  preservationColdIschemiaLimitHours: { type: Number, required: true },
  status: {
    type: String,
    required: true,
    enum: ['READY_FOR_MATCH', 'ALLOCATED', 'MAINTENANCE'],
    default: 'READY_FOR_MATCH',
  },
});

const bloodOrganBankSchema = new Schema<IBloodOrganBank>(
  {
    hospitalFacility: { type: String, required: true, default: 'Metropolitan Nodal Blood & Organ Bank' },
    bloodInventory: [bloodInventoryItemSchema],
    organRegistry: [organInventoryItemSchema],
  },
  {
    timestamps: true,
  }
);

export const BloodOrganBankModel = model<IBloodOrganBank>('BloodOrganBank', bloodOrganBankSchema);
