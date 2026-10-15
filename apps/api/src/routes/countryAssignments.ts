import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import {
  CountryAssignment,
  toPublicCountryAssignment,
} from '../models/CountryAssignment.js';
import { assertAssignableManager, writeAudit } from '../services/assignment.js';
import { countryCodeSchema } from '../validation/country.js';

const upsertBody = z.object({
  countryCode: countryCodeSchema,
  managerUserIds: z.array(z.string().min(1)).min(1).max(20),
  isActive: z.boolean().optional().default(true),
});

export const countryAssignmentsRouter = Router();

countryAssignmentsRouter.get(
  '/',
  requireAuth,
  requirePermission('assignment:manage:admin'),
  async (_req, res, next) => {
    try {
      const items = await CountryAssignment.find().sort({ countryCode: 1 }).exec();
      res.json({ data: items.map(toPublicCountryAssignment) });
    } catch (err) {
      next(err);
    }
  },
);

countryAssignmentsRouter.put(
  '/',
  requireAuth,
  requirePermission('assignment:manage:admin'),
  validate({ body: upsertBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof upsertBody>;
      const uniqueIds = [...new Set(body.managerUserIds)];
      const managers = [];
      for (const id of uniqueIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new AppError(400, 'INVALID_MANAGER', 'Manager id is not valid');
        }
        const manager = await assertAssignableManager(id);
        if (!manager) {
          throw new AppError(
            400,
            'INVALID_MANAGER',
            'Each manager must be an active staff, admin, or super_admin account',
          );
        }
        managers.push(manager._id);
      }

      const previous = await CountryAssignment.findOne({ countryCode: body.countryCode }).exec();
      const doc = await CountryAssignment.findOneAndUpdate(
        { countryCode: body.countryCode },
        {
          countryCode: body.countryCode,
          managerUserIds: managers,
          isActive: body.isActive,
        },
        { upsert: true, new: true, runValidators: true },
      ).exec();

      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'country_assignment.upserted',
        entityType: 'CountryAssignment',
        entityId: doc!._id.toString(),
        metadata: {
          countryCode: body.countryCode,
          previousManagerUserIds: previous?.managerUserIds.map((id) => id.toString()) ?? [],
          managerUserIds: uniqueIds,
          isActive: body.isActive,
        },
      });

      res.status(previous ? 200 : 201).json({ assignment: toPublicCountryAssignment(doc!) });
    } catch (err) {
      next(err);
    }
  },
);
