import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PublicInvitation } from '@medbourse/shared';

export interface InvitationFields {
  customerId: mongoose.Types.ObjectId;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  createdByUserId: mongoose.Types.ObjectId;
  consumedAt: Date | null;
  consumedByUserId: mongoose.Types.ObjectId | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export type InvitationDocument = HydratedDocument<InvitationFields>;

const invitationSchema = new mongoose.Schema<InvitationFields>(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    consumedAt: { type: Date, default: null },
    consumedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

invitationSchema.index({ customerId: 1, createdAt: -1 });
invitationSchema.index({ expiresAt: 1 });

export function toPublicInvitation(doc: InvitationDocument): PublicInvitation {
  return {
    id: doc._id.toString(),
    customerId: doc.customerId.toString(),
    email: doc.email,
    expiresAt: doc.expiresAt.toISOString(),
    consumedAt: doc.consumedAt ? doc.consumedAt.toISOString() : null,
    revokedAt: doc.revokedAt ? doc.revokedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const Invitation: Model<InvitationFields> =
  mongoose.models.Invitation ?? mongoose.model<InvitationFields>('Invitation', invitationSchema);
