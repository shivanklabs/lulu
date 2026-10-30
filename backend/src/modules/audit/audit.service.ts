import { AuditLogModel, AuditAction } from './audit.model';
import { logger } from '../../lib/logger';

export interface AuditLogInput {
  actorId: string;
  actorRole: 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'HOSPITAL' | 'SYSTEM';
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  patientId?: string;
  ipAddress?: string;
  userAgent?: string;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILED';
  details?: Record<string, unknown>;
}

export const logAuditEvent = async (input: AuditLogInput): Promise<void> => {
  try {
    await AuditLogModel.create({
      ...input,
      ipAddress: input.ipAddress || 'unknown',
      userAgent: input.userAgent || 'unknown',
      timestamp: new Date(),
    });
  } catch (err) {
    // Log failure directly to server logger without crashing clinical flow
    logger.error({ err, input }, 'Failed to record audit log entry');
  }
};
