import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { Notification, toPublicNotification } from '../models/Notification.js';

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.enum(['true', 'false']).optional(),
});

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  requireAuth,
  requirePermission('notification:read:self'),
  validate({ query: listQuery }),
  async (req, res, next) => {
    try {
      const { page, limit, unreadOnly } = req.query as unknown as z.infer<typeof listQuery>;
      const owner = new mongoose.Types.ObjectId(req.auth!.userId);
      const filter: Record<string, unknown> = { recipientUserId: owner };
      if (unreadOnly === 'true') {
        filter.readAt = null;
      }
      const [total, unread, items] = await Promise.all([
        Notification.countDocuments(filter),
        Notification.countDocuments({ recipientUserId: owner, readAt: null }),
        Notification.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .exec(),
      ]);
      res.json({
        data: items.map(toPublicNotification),
        meta: { page, limit, total, unread },
      });
    } catch (err) {
      next(err);
    }
  },
);

notificationsRouter.post(
  '/read-all',
  requireAuth,
  requirePermission('notification:read:self'),
  async (req, res, next) => {
    try {
      const result = await Notification.updateMany(
        { recipientUserId: new mongoose.Types.ObjectId(req.auth!.userId), readAt: null },
        { $set: { readAt: new Date() } },
      );
      res.json({ updated: result.modifiedCount });
    } catch (err) {
      next(err);
    }
  },
);

notificationsRouter.patch(
  '/:id/read',
  requireAuth,
  requirePermission('notification:read:self'),
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const item = await Notification.findById(id).exec();
      if (!item || item.recipientUserId.toString() !== req.auth!.userId) {
        throw new AppError(404, 'NOT_FOUND', 'Notification not found');
      }
      if (!item.readAt) {
        item.readAt = new Date();
        await item.save();
      }
      res.json({ notification: toPublicNotification(item) });
    } catch (err) {
      next(err);
    }
  },
);
