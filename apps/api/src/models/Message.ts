import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import { USER_ROLES, type PublicMessage, type UserRole } from '@medbourse/shared';

export interface MessageFields {
  caseId: mongoose.Types.ObjectId;
  authorUserId: mongoose.Types.ObjectId;
  authorRole: UserRole;
  body: string;
  createdAt: Date;
}

export type MessageDocument = HydratedDocument<MessageFields>;

const messageSchema = new mongoose.Schema<MessageFields>(
  {
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true },
    authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorRole: { type: String, required: true, enum: USER_ROLES },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ caseId: 1, createdAt: 1 });

export function toPublicMessage(doc: MessageDocument): PublicMessage {
  return {
    id: doc._id.toString(),
    caseId: doc.caseId.toString(),
    authorUserId: doc.authorUserId.toString(),
    authorRole: doc.authorRole,
    body: doc.body,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const Message: Model<MessageFields> =
  mongoose.models.Message ?? mongoose.model<MessageFields>('Message', messageSchema);
