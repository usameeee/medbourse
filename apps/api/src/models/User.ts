import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PublicUser, UserRole } from '@medbourse/shared';
import { USER_ROLES } from '@medbourse/shared';
import { mediaUrlsForIds, resolveMediaUrl } from './Media.js';

export interface UserFields {
  email: string;
  /**
   * `null` for an account an admin provisioned on a customer's behalf before the customer set a
   * password (see the office flow in `POST /customers/:id/account`). Such an account cannot
   * sign in until an invitation is claimed and a password is written.
   */
  passwordHash: string | null;
  role: UserRole;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarMediaId: mongoose.Types.ObjectId | null;
  /** Set once the email address has been proven by a verification code. */
  emailVerifiedAt: Date | null;
  customerId: mongoose.Types.ObjectId | null;
  /** ISO 3166-1 alpha-2 country of residence; prefills self-service applications. */
  countryCode: string | null;
  isActive: boolean;
}

export type UserDocument = HydratedDocument<UserFields>;

const userSchema = new mongoose.Schema<UserFields>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null, select: false },
    role: { type: String, required: true, enum: USER_ROLES, default: 'customer' },
    displayName: { type: String, default: null, maxlength: 80 },
    firstName: { type: String, default: null, maxlength: 60 },
    lastName: { type: String, default: null, maxlength: 60 },
    avatarMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
    emailVerifiedAt: { type: Date, default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    countryCode: { type: String, default: null, uppercase: true, minlength: 2, maxlength: 2 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.index(
  { customerId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { customerId: { $type: 'objectId' } } },
);

export function toPublicUser(
  user: UserDocument,
  mediaUrls: Map<string, string> = new Map(),
): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    displayName: user.displayName ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    avatarMediaId: user.avatarMediaId ? user.avatarMediaId.toString() : null,
    avatarUrl: resolveMediaUrl(user.avatarMediaId, mediaUrls),
    emailVerified: Boolean(user.emailVerifiedAt),
    isActive: user.isActive,
    countryCode: user.countryCode ?? null,
    customerId: user.customerId ? user.customerId.toString() : null,
  };
}

/** Same payload as `toPublicUser`, with the avatar resolved to a renderable URL. */
export async function toPublicUserWithAvatar(user: UserDocument): Promise<PublicUser> {
  const urls = await mediaUrlsForIds([user.avatarMediaId]);
  return toPublicUser(user, urls);
}

/** Same as `toPublicUserWithAvatar` for a batch, resolving every avatar in one query. */
export async function toPublicUsersWithAvatars(users: UserDocument[]): Promise<PublicUser[]> {
  const urls = await mediaUrlsForIds(users.map((user) => user.avatarMediaId));
  return users.map((user) => toPublicUser(user, urls));
}

export const User: Model<UserFields> =
  mongoose.models.User ?? mongoose.model<UserFields>('User', userSchema);
