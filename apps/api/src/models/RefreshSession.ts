import mongoose, { type HydratedDocument, type Model } from 'mongoose';

export interface RefreshSessionFields {
  userId: mongoose.Types.ObjectId;
  /** SHA-256 hex of the opaque refresh token; the raw token is never stored. */
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export type RefreshSessionRecord = HydratedDocument<RefreshSessionFields>;

const refreshSessionSchema = new mongoose.Schema<RefreshSessionFields>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Expired sessions are removed automatically once `expiresAt` passes.
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSession: Model<RefreshSessionFields> =
  mongoose.models.RefreshSession ??
  mongoose.model<RefreshSessionFields>('RefreshSession', refreshSessionSchema);
