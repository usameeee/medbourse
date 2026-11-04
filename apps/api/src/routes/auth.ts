import { Router, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { z } from 'zod';
import type { UserRole } from '@medbourse/shared';
import {
  clearAccessCookie,
  clearRefreshCookie,
  setAccessCookie,
  setRefreshCookie,
} from '../auth/cookies.js';
import { hashInvitationToken } from '../auth/invitationToken.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { readRefreshToken } from '../auth/readToken.js';
import { signAccessToken } from '../auth/tokens.js';
import { AppError } from '../errors/AppError.js';
import { sendPasswordResetCode, sendSignupCode } from '../mail/otpMail.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { Media } from '../models/Media.js';
import { toPublicUserWithAvatar, User } from '../models/User.js';
import { assertInvitationUsable, claimInvitation, consumeInvitation } from '../services/invitations.js';
import {
  createRefreshSession,
  revokeAllRefreshSessions,
  revokeRefreshSession,
  rotateRefreshSession,
} from '../services/refreshSessions.js';
import { consumeCode, issueCode } from '../services/verificationCodes.js';
import { countryCodeSchema } from '../validation/country.js';

const emailSchema = z.string().trim().email().toLowerCase();
const passwordSchema = z.string().min(10).max(200);
const personNameSchema = z.string().trim().max(60);
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

const signupRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: personNameSchema.optional(),
  lastName: personNameSchema.optional(),
  displayName: z.string().trim().max(80).optional(),
  countryCode: countryCodeSchema.optional(),
  invitationToken: z.string().min(20).max(200).optional(),
});

const signupVerifySchema = z.object({ email: emailSchema, code: codeSchema });

/**
 * Claims an invitation issued to a customer who has no password yet (the office flow: an admin
 * provisioned the account and opened a case on their behalf). The token stands in for the
 * email proof — an admin hands it to the customer — so the account is verified and signed in.
 */
const claimSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
  firstName: personNameSchema.optional(),
  lastName: personNameSchema.optional(),
  displayName: z.string().trim().max(80).optional(),
});

const forgotSchema = z.object({ email: emailSchema });

const resetSchema = z.object({
  email: emailSchema,
  code: codeSchema,
  password: passwordSchema,
});

const profileSchema = z.object({
  firstName: personNameSchema.nullable().optional(),
  lastName: personNameSchema.nullable().optional(),
  displayName: z.string().trim().max(80).nullable().optional(),
  countryCode: countryCodeSchema.nullable().optional(),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

const avatarSchema = z.object({
  mediaId: z
    .string()
    .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid media')
    .nullable(),
});

const authLimiter: RequestHandler =
  process.env.VITEST === 'true'
    ? (_req, _res, next) => {
        next();
      }
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        standardHeaders: true,
        legacyHeaders: false,
      });

export const authRouter = Router();

/** Sets a short-lived access cookie plus a long-lived, rotatable refresh cookie. */
async function startSession(res: Response, userId: string, role: UserRole): Promise<void> {
  const refreshToken = await createRefreshSession(userId);
  setAccessCookie(res, signAccessToken(userId, role));
  setRefreshCookie(res, refreshToken);
}

/** Loads the signed-in account or fails with the standard unauthenticated error. */
async function requireActiveUser(userId: string) {
  const user = await User.findById(userId).exec();
  if (!user || !user.isActive) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  return user;
}

/**
 * Step one of registration: validate the request, then email a six-digit code.
 * No account row is written until the code comes back, so unverified addresses
 * never occupy the users collection.
 */
authRouter.post(
  '/signup/request',
  authLimiter,
  validate({ body: signupRequestSchema }),
  async (req, res, next) => {
    try {
      const { email, password, firstName, lastName, displayName, countryCode, invitationToken } =
        req.body as z.infer<typeof signupRequestSchema>;

      const existing = await User.findOne({ email }).exec();
      if (existing) {
        throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists');
      }

      const invitationTokenHash = invitationToken ? hashInvitationToken(invitationToken) : null;
      if (invitationTokenHash) {
        await assertInvitationUsable(invitationTokenHash, email);
      }

      const code = await issueCode({
        email,
        purpose: 'signup',
        payload: {
          passwordHash: await hashPassword(password),
          firstName: firstName ?? null,
          lastName: lastName ?? null,
          displayName: displayName ?? null,
          countryCode: countryCode ?? null,
          invitationTokenHash,
        },
      });
      await sendSignupCode(email, code);

      res.status(202).json({ pending: true, email });
    } catch (err) {
      next(err);
    }
  },
);

/** Step two of registration: the code proves the mailbox, then the account is created and signed in. */
authRouter.post(
  '/signup/verify',
  authLimiter,
  validate({ body: signupVerifySchema }),
  async (req, res, next) => {
    try {
      const { email, code } = req.body as z.infer<typeof signupVerifySchema>;

      const existing = await User.findOne({ email }).exec();
      if (existing) {
        throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists');
      }

      const record = await consumeCode({ email, purpose: 'signup', code });
      const payload = record.payload;
      if (!payload) {
        throw new AppError(400, 'CODE_NOT_FOUND', 'No pending signup for this email');
      }
      if (payload.invitationTokenHash) {
        await assertInvitationUsable(payload.invitationTokenHash, email);
      }

      const user = await User.create({
        email,
        passwordHash: payload.passwordHash,
        role: 'customer',
        displayName: payload.displayName,
        firstName: payload.firstName,
        lastName: payload.lastName,
        countryCode: payload.countryCode ?? null,
        emailVerifiedAt: new Date(),
      });

      if (payload.invitationTokenHash) {
        await consumeInvitation({
          tokenHash: payload.invitationTokenHash,
          user,
          actorUserId: user._id.toString(),
        });
      }

      const fresh = await User.findById(user._id).exec();
      await startSession(res, user._id.toString(), user.role);
      res.status(201).json({ user: await toPublicUserWithAvatar(fresh!) });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: z.object({ email: emailSchema, password: passwordSchema }) }),
  async (req, res, next) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const user = await User.findOne({ email }).select('+passwordHash').exec();
      // A provisioned account has no password until its invitation is claimed.
      if (!user || !user.isActive || !user.passwordHash) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      }
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      }
      await startSession(res, user._id.toString(), user.role);
      res.json({ user: await toPublicUserWithAvatar(user) });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Finishes the office flow: the customer opens the invitation link, sets a password, and is
 * signed in right away. Works for an account an admin provisioned on their behalf and for a
 * customer record with no account at all.
 */
authRouter.post(
  '/invitations/claim',
  authLimiter,
  validate({ body: claimSchema }),
  async (req, res, next) => {
    try {
      const { token, password, firstName, lastName, displayName } = req.body as z.infer<
        typeof claimSchema
      >;
      const user = await claimInvitation({
        tokenHash: hashInvitationToken(token),
        passwordHash: await hashPassword(password),
        firstName,
        lastName,
        displayName,
      });
      await startSession(res, user._id.toString(), user.role);
      res.json({ user: await toPublicUserWithAvatar(user) });
    } catch (err) {
      next(err);
    }
  },
);

/** Starts a password reset. Always answers the same way so emails cannot be probed. */
authRouter.post(
  '/password/forgot',
  authLimiter,
  validate({ body: forgotSchema }),
  async (req, res, next) => {
    try {
      const { email } = req.body as z.infer<typeof forgotSchema>;
      const user = await User.findOne({ email }).exec();
      if (user && user.isActive) {
        const code = await issueCode({ email, purpose: 'password_reset' });
        await sendPasswordResetCode(email, code);
      }
      res.status(202).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

/** Finishes a reset: the code sets a new password and every old session is revoked. */
authRouter.post(
  '/password/reset',
  authLimiter,
  validate({ body: resetSchema }),
  async (req, res, next) => {
    try {
      const { email, code, password } = req.body as z.infer<typeof resetSchema>;
      const user = await User.findOne({ email }).exec();
      if (!user || !user.isActive) {
        throw new AppError(400, 'CODE_NOT_FOUND', 'No active code for this email');
      }
      await consumeCode({ email, purpose: 'password_reset', code });

      user.passwordHash = await hashPassword(password);
      await user.save();
      await revokeAllRefreshSessions(user._id.toString());

      await startSession(res, user._id.toString(), user.role);
      res.json({ user: await toPublicUserWithAvatar(user) });
    } catch (err) {
      next(err);
    }
  },
);

/** Rotates the refresh token and re-issues a short-lived access cookie. */
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const rawToken = readRefreshToken(req);
    if (!rawToken) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    const { userId, refreshToken } = await rotateRefreshSession(rawToken);
    const user = await User.findById(userId).exec();
    if (!user || !user.isActive) {
      clearRefreshCookie(res);
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    setAccessCookie(res, signAccessToken(user._id.toString(), user.role));
    setRefreshCookie(res, refreshToken);
    res.json({ user: await toPublicUserWithAvatar(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const rawToken = readRefreshToken(req);
    if (rawToken) {
      await revokeRefreshSession(rawToken);
    }
    clearAccessCookie(res);
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await requireActiveUser(req.auth!.userId);
    res.json({ user: await toPublicUserWithAvatar(user) });
  } catch (err) {
    next(err);
  }
});

/** Self-service profile edit; every role may change its own names. */
authRouter.patch(
  '/me',
  requireAuth,
  validate({ body: profileSchema }),
  async (req, res, next) => {
    try {
      const user = await requireActiveUser(req.auth!.userId);
      const { firstName, lastName, displayName, countryCode } = req.body as z.infer<
        typeof profileSchema
      >;
      if (firstName !== undefined) user.firstName = firstName || null;
      if (lastName !== undefined) user.lastName = lastName || null;
      if (displayName !== undefined) user.displayName = displayName || null;
      if (countryCode !== undefined) user.countryCode = countryCode || null;
      await user.save();
      res.json({ user: await toPublicUserWithAvatar(user) });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.patch(
  '/me/password',
  requireAuth,
  validate({ body: passwordChangeSchema }),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body as z.infer<typeof passwordChangeSchema>;
      const user = await User.findById(req.auth!.userId).select('+passwordHash').exec();
      if (!user || !user.isActive || !user.passwordHash) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
      }
      const ok = await verifyPassword(currentPassword, user.passwordHash);
      if (!ok) {
        throw new AppError(400, 'INVALID_PASSWORD', 'The current password is incorrect');
      }
      user.passwordHash = await hashPassword(newPassword);
      await user.save();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

/** Sets or clears the profile photo; `mediaId: null` removes it. */
authRouter.patch(
  '/me/avatar',
  requireAuth,
  validate({ body: avatarSchema }),
  async (req, res, next) => {
    try {
      const { mediaId } = req.body as z.infer<typeof avatarSchema>;
      let avatarMediaId: mongoose.Types.ObjectId | null = null;
      if (mediaId) {
        const media = await Media.findById(mediaId).exec();
        if (!media) {
          throw new AppError(400, 'INVALID_MEDIA', 'Media does not exist');
        }
        avatarMediaId = media._id;
      }
      const user = await requireActiveUser(req.auth!.userId);
      user.avatarMediaId = avatarMediaId;
      await user.save();
      res.json({ user: await toPublicUserWithAvatar(user) });
    } catch (err) {
      next(err);
    }
  },
);

/** Permission check probe — admin+ only. No catalog mutation. */
authRouter.get(
  '/admin-check',
  requireAuth,
  requirePermission('case:create:admin'),
  (_req, res) => {
    res.json({ ok: true });
  },
);
