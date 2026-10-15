import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PublicUser, UserRole } from '@medbourse/shared';
import { USER_ROLES } from '@medbourse/shared';

export interface UserFields {
  email: string;
  passwordHash: string;
  role: UserRole;
  displayName: string | null;
  customerId: mongoose.Types.ObjectId | null;
  isActive: boolean;
}

export type UserDocument = HydratedDocument<UserFields>;

const userSchema = new mongoose.Schema<UserFields>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: USER_ROLES, default: 'customer' },
    displayName: { type: String, default: null, maxlength: 80 },
    customerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.index(
  { customerId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { customerId: { $type: 'objectId' } } },
);

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    displayName: user.displayName ?? null,
    customerId: user.customerId ? user.customerId.toString() : null,
  };
}

export const User: Model<UserFields> =
  mongoose.models.User ?? mongoose.model<UserFields>('User', userSchema);
