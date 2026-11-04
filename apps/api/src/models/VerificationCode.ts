import mongoose, { type HydratedDocument, type Model } from 'mongoose';

export const VERIFICATION_PURPOSES = ['signup', 'password_reset'] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

/** Data a verified signup needs to finish creating the account. */
export interface SignupPayload {
  passwordHash: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  /** ISO 3166-1 alpha-2 country chosen at signup, carried over to the account. */
  countryCode: string | null;
  /** Hash of the invitation token, when the signup started from an invitation link. */
  invitationTokenHash: string | null;
}

export interface VerificationCodeFields {
  email: string;
  purpose: VerificationPurpose;
  /** Six-digit code. Only ever sent by email; never returned to a client. */
  code: string;
  payload: SignupPayload | null;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type VerificationCodeRecord = HydratedDocument<VerificationCodeFields>;

const verificationCodeSchema = new mongoose.Schema<VerificationCodeFields>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, required: true, enum: VERIFICATION_PURPOSES },
    code: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One active code per email and purpose; issuing a new one replaces the previous.
verificationCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });
// Stale codes are removed automatically once `expiresAt` passes.
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationCode: Model<VerificationCodeFields> =
  mongoose.models.VerificationCode ??
  mongoose.model<VerificationCodeFields>('VerificationCode', verificationCodeSchema);
