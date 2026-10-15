import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PublicAuditLog } from '@medbourse/shared';

export interface AuditLogFields {
  actorUserId: mongoose.Types.ObjectId | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLogFields>;

const auditLogSchema = new mongoose.Schema<AuditLogFields>(
  {
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actorUserId: 1, createdAt: -1 });

export function toPublicAuditLog(doc: AuditLogDocument): PublicAuditLog {
  return {
    id: doc._id.toString(),
    actorUserId: doc.actorUserId ? doc.actorUserId.toString() : null,
    action: doc.action,
    entityType: doc.entityType,
    entityId: doc.entityId,
    metadata: doc.metadata,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const AuditLog: Model<AuditLogFields> =
  mongoose.models.AuditLog ?? mongoose.model<AuditLogFields>('AuditLog', auditLogSchema);
