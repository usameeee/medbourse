import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { USER_ROLES } from '@medbourse/shared';
import { hashPassword } from '../auth/password.js';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { toPublicUser, toPublicUserWithAvatar, toPublicUsersWithAvatars, User } from '../models/User.js';
import { listAssignableManagers, writeAudit } from '../services/assignment.js';

const emailSchema = z.string().trim().email().toLowerCase();
const personNameSchema = z.string().trim().max(60);

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  q: z.string().trim().max(120).optional(),
});

const updateBody = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.role !== undefined || value.isActive !== undefined, {
    message: 'Nothing to update',
  });

/** Accounts a Super Admin may provision directly; existing customers are never overwritten. */
const createBody = z.object({
  email: emailSchema,
  password: z.string().min(10).max(200),
  role: z.literal('admin'),
  firstName: personNameSchema.optional(),
  lastName: personNameSchema.optional(),
});

/** Escapes a user-supplied string so it can be used as a literal inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const usersRouter = Router();

usersRouter.get(
  '/managers',
  requireAuth,
  requirePermission('assignment:manage:admin'),
  async (_req, res, next) => {
    try {
      const managers = await listAssignableManagers();
      res.json({ data: managers.map((manager) => toPublicUser(manager)) });
    } catch (err) {
      next(err);
    }
  },
);

/** Super Admin directory: every account, including customers and deactivated ones. */
usersRouter.get(
  '/',
  requireAuth,
  requirePermission('user:manage:super_admin'),
  validate({ query: listQuery }),
  async (req, res, next) => {
    try {
      const { page, limit, role, status, q } = req.query as unknown as z.infer<typeof listQuery>;
      const filter: Record<string, unknown> = {};
      if (role) filter.role = role;
      if (status) filter.isActive = status === 'active';
      if (q) {
        const pattern = new RegExp(escapeRegExp(q), 'i');
        filter.$or = [
          { email: pattern },
          { displayName: pattern },
          { firstName: pattern },
          { lastName: pattern },
        ];
      }

      const [total, users] = await Promise.all([
        User.countDocuments(filter).exec(),
        User.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .exec(),
      ]);

      res.json({ data: await toPublicUsersWithAvatars(users), meta: { page, limit, total } });
    } catch (err) {
      next(err);
    }
  },
);

/** Super Admin: change a role or activate/deactivate an account. */
usersRouter.patch(
  '/:id',
  requireAuth,
  requirePermission('user:manage:super_admin'),
  validate({ params: idParams, body: updateBody }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const { role, isActive } = req.body as z.infer<typeof updateBody>;

      // A Super Admin must not lock themselves out of the panel.
      if (id === req.auth!.userId && (role !== undefined || isActive === false)) {
        throw new AppError(400, 'CANNOT_MODIFY_SELF', 'You cannot change your own role or status');
      }

      const user = await User.findById(id).exec();
      if (!user) {
        throw new AppError(404, 'NOT_FOUND', 'User not found');
      }

      const before = { role: user.role, isActive: user.isActive };
      if (role !== undefined) user.role = role;
      if (isActive !== undefined) user.isActive = isActive;
      await user.save();

      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'user.updated',
        entityType: 'User',
        entityId: user._id.toString(),
        metadata: { before, after: { role: user.role, isActive: user.isActive } },
      });

      res.json({ user: await toPublicUsersWithAvatars([user]).then(([one]) => one) });
    } catch (err) {
      next(err);
    }
  },
);

/** Super Admin: provision an admin account. Created accounts are trusted, so verified. */
usersRouter.post(
  '/',
  requireAuth,
  requirePermission('user:manage:super_admin'),
  validate({ body: createBody }),
  async (req, res, next) => {
    try {
      const { email, password, role, firstName, lastName } = req.body as z.infer<typeof createBody>;

      const existing = await User.findOne({ email }).exec();
      if (existing) {
        throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists');
      }

      const user = await User.create({
        email,
        passwordHash: await hashPassword(password),
        role,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        emailVerifiedAt: new Date(),
      });

      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'user.created',
        entityType: 'User',
        entityId: user._id.toString(),
        metadata: { email, role },
      });

      res.status(201).json({ user: await toPublicUserWithAvatar(user) });
    } catch (err) {
      next(err);
    }
  },
);
