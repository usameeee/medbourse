import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { AuditLog, toPublicAuditLog } from '../models/AuditLog.js';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().min(1).max(120).optional(),
  entityType: z.string().trim().min(1).max(64).optional(),
  actorUserId: z
    .string()
    .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid actor')
    .optional(),
});

export const auditRouter = Router();

auditRouter.get(
  '/',
  requireAuth,
  requirePermission('audit:read:super_admin'),
  validate({ query: listQuery }),
  async (req, res, next) => {
    try {
      const { page, limit, action, entityType, actorUserId } =
        req.query as unknown as z.infer<typeof listQuery>;
      const filter: Record<string, unknown> = {};
      if (action) filter.action = action;
      if (entityType) filter.entityType = entityType;
      if (actorUserId) filter.actorUserId = actorUserId;
      const [total, items] = await Promise.all([
        AuditLog.countDocuments(filter),
        AuditLog.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .exec(),
      ]);
      res.json({
        data: items.map(toPublicAuditLog),
        meta: { page, limit, total },
      });
    } catch (err) {
      next(err);
    }
  },
);
