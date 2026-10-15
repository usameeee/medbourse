import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { toPublicUser } from '../models/User.js';
import { listAssignableManagers } from '../services/assignment.js';

export const usersRouter = Router();

usersRouter.get(
  '/managers',
  requireAuth,
  requirePermission('assignment:manage:admin'),
  async (_req, res, next) => {
    try {
      const managers = await listAssignableManagers();
      res.json({ data: managers.map(toPublicUser) });
    } catch (err) {
      next(err);
    }
  },
);
