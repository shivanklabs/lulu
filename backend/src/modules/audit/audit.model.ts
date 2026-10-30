import { Schema, model, Document } from 'mongoose';

export type AuditAction =
  | 'AUTH_LOGIN'
  | 'AUTH_REGISTER'
  | 'AUTH_LOGOUT'
  | 'PHI_READ'
  | 'PHI_CREATE'
  | 'PHI_UPDATE'
  | 'PHI_STREAM_FILE'
  | 'CONSENT_GRANT'
  | 'CONSENT_REVOKE'
  | 'DOCTOR_VERIFY'
  | 'EMERGENCY_BREAK_GLASS'
  | 'EMERGENCY_AMBULANCE_DISPATCH'
  | 'AI_AGENT_ACTION_CONFIRMED'
  | 'PRIVACY_CONSENT_ACKNOWLEDGED'
  | 'ORGAN_DONOR_ALLOCATION_REQUEST'
  | 'AUTH_INVITE_ACCEPTED'
  | 'APPOINTMENT_STATUS_CHANGE'
  | 'DOCTOR_INVITE'
  | 'DOCTOR_ACTIVATION_CHANGE'
  | 'HOSPITAL_UPDATE'
  | 'AVAILABILITY_UPDATE';

export interface IAuditLog extends Document {
  actorId: string;
  actorRole: 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'HOSPITAL' | 'SYSTEM';
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  patientId?: string;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILED';
  details?: Record<string, unknown>;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: String, required: true, index: true },
    actorRole: { type: String, required: true, enum: ['PATIENT', 'DOCTOR', 'ADMIN', 'HOSPITAL', 'SYSTEM'] },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String },
    patientId: { type: String, index: true },
    timestamp: { type: Date, default: Date.now, required: true, index: true },
    ipAddress: { type: String, required: true, default: 'unknown' },
    userAgent: { type: String, required: true, default: 'unknown' },
    outcome: { type: String, required: true, enum: ['SUCCESS', 'DENIED', 'FAILED'] },
    details: { type: Schema.Types.Mixed },
  },
  {
    // Append-only collection; no update or soft delete mutation
    timestamps: false,
    versionKey: false,
  }
);

// Compound indexes for HIPAA / DPDPA compliance queries
auditLogSchema.index({ patientId: 1, timestamp: -1 });
auditLogSchema.index({ actorId: 1, timestamp: -1 });

export const AuditLogModel = model<IAuditLog>('AuditLog', auditLogSchema);
