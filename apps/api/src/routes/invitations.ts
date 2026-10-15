import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { hashInvitationToken } from '../auth/invitationToken.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { toPublicUser, User } from '../models/User.js';
import { consumeInvitation } from '../services/invitations.js';

const acceptLimiter: RequestHandler =
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

const acceptBody = z.object({
  token: z.string().min(20).max(200),
});

export const invitationsRouter = Router();

invitationsRouter.post(
  '/accept',
  acceptLimiter,
  requireAuth,
  validate({ body: acceptBody }),
  async (req, res, next) => {
    try {
      const { token } = req.body as z.infer<typeof acceptBody>;
      const user = await User.findById(req.auth!.userId).exec();
      if (!user) {
        throw new Error('missing user');
      }
      await consumeInvitation({
        tokenHash: hashInvitationToken(token),
        user,
        actorUserId: req.auth!.userId,
      });
      const fresh = await User.findById(user._id).exec();
      res.json({ user: toPublicUser(fresh!) });
    } catch (err) {
      next(err);
    }
  },
);
