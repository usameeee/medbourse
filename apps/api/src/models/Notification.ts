import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import { NOTIFICATION_TYPES, type NotificationType, type PublicNotification } from '@medbourse/shared';

export interface NotificationFields {
  recipientUserId: mongoose.Types.ObjectId;
  type: NotificationType;
  caseId: mongoose.Types.ObjectId | null;
  metadata: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

export type NotificationDocument = HydratedDocument<NotificationFields>;

const notificationSchema = new mongoose.Schema<NotificationFields>(
  {
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, enum: NOTIFICATION_TYPES },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, readAt: 1 });

export function toPublicNotification(doc: NotificationDocument): PublicNotification {
  return {
    id: doc._id.toString(),
    type: doc.type,
    caseId: doc.caseId ? doc.caseId.toString() : null,
    metadata: doc.metadata,
    readAt: doc.readAt ? doc.readAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const Notification: Model<NotificationFields> =
  mongoose.models.Notification ??
  mongoose.model<NotificationFields>('Notification', notificationSchema);
