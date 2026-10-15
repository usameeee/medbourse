import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { clearAccessCookie, setAccessCookie } from '../auth/cookies.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signAccessToken } from '../auth/tokens.js';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { hashInvitationToken } from '../auth/invitationToken.js';
import { toPublicUser, User } from '../models/User.js';
import { assertInvitationUsable, consumeInvitation } from '../services/invitations.js';

const credentialsSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(10).max(200),
  displayName: z.string().trim().max(80).optional(),
  invitationToken: z.string().min(20).max(200).optional(),
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

authRouter.post('/register', authLimiter, validate({ body: credentialsSchema }), async (req, res, next) => {
  try {
    const { email, password, displayName, invitationToken } = req.body as z.infer<
      typeof credentialsSchema
    >;
    const existing = await User.findOne({ email }).exec();
    if (existing) {
      throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists');
    }
    if (invitationToken) {
      await assertInvitationUsable(hashInvitationToken(invitationToken), email);
    }
    const passwordHash = await hashPassword(password);
    const user = await User.create({
      email,
      passwordHash,
      role: 'customer',
      displayName: displayName || null,
    });
    if (invitationToken) {
      await consumeInvitation({
        tokenHash: hashInvitationToken(invitationToken),
        user,
        actorUserId: user._id.toString(),
      });
    }
    const fresh = await User.findById(user._id).exec();
    const token = signAccessToken(user._id.toString(), user.role);
    setAccessCookie(res, token);
    res.status(201).json({ user: toPublicUser(fresh!) });
  } catch (err) {
    next(err);
  }
});

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: credentialsSchema.pick({ email: true, password: true }) }),
  async (req, res, next) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const user = await User.findOne({ email }).select('+passwordHash').exec();
    if (!user || !user.isActive) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    const token = signAccessToken(user._id.toString(), user.role);
    setAccessCookie(res, token);
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  clearAccessCookie(res);
  res.status(204).send();
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth!.userId).exec();
    if (!user || !user.isActive) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

/** Permission check probe — staff+ only. No catalog mutation. */
authRouter.get(
  '/staff-check',
  requireAuth,
  requirePermission('case:create:staff'),
  (_req, res) => {
    res.json({ ok: true });
  },
);
