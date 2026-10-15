import { Router } from 'express';
import { z } from 'zod';
import { roleHasPermission } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { Invitation, toPublicInvitation } from '../models/Invitation.js';
import { Customer, toPublicCustomer } from '../models/Customer.js';
import { issueInvitation } from '../services/invitations.js';
import {
  assertAssignableManager,
  resolveCountryAssignment,
  writeAudit,
} from '../services/assignment.js';
import { countryCodeSchema } from '../validation/country.js';
import mongoose from 'mongoose';

const createBody = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().toLowerCase().optional(),
  phone: z.string().trim().max(32).optional(),
  countryCode: countryCodeSchema,
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(80).optional(),
});

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

const reassignBody = z.object({
  managerUserId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});

const inviteBody = z.object({
  email: z.string().trim().email().toLowerCase().optional(),
});

export const customersRouter = Router();

customersRouter.post(
  '/',
  requireAuth,
  requirePermission('customer:create:staff'),
  validate({ body: createBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createBody>;
      const email = body.email ?? null;
      if (email) {
        const duplicate = await Customer.findOne({ email }).exec();
        if (duplicate) {
          throw new AppError(409, 'CUSTOMER_EMAIL_IN_USE', 'A customer with this email already exists', {
            customerId: duplicate._id.toString(),
          });
        }
      }
      const assignment = await resolveCountryAssignment(body.countryCode);
      const customer = await Customer.create({
        fullName: body.fullName,
        email,
        phone: body.phone ?? null,
        countryCode: body.countryCode,
        assignedManagerUserId: assignment.assignedManagerUserId,
        assignmentStatus: assignment.assignmentStatus,
        assignmentSource: assignment.assignmentSource,
        createdByUserId: new mongoose.Types.ObjectId(req.auth!.userId),
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'customer.created',
        entityType: 'Customer',
        entityId: customer._id.toString(),
        metadata: {
          countryCode: customer.countryCode,
          assignmentStatus: customer.assignmentStatus,
          assignedManagerUserId: customer.assignedManagerUserId?.toString() ?? null,
        },
      });
      res.status(201).json({ customer: toPublicCustomer(customer) });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.get(
  '/',
  requireAuth,
  requirePermission('customer:read:staff'),
  validate({ query: listQuery }),
  async (req, res, next) => {
    try {
      const { page, limit, q } = req.query as unknown as z.infer<typeof listQuery>;
      const filter = q
        ? {
            $or: [
              { fullName: { $regex: q, $options: 'i' } },
              { email: { $regex: q, $options: 'i' } },
            ],
          }
        : {};
      const [total, items] = await Promise.all([
        Customer.countDocuments(filter),
        Customer.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .exec(),
      ]);
      res.json({
        data: items.map(toPublicCustomer),
        meta: { page, limit, total },
      });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.get(
  '/queue/unassigned',
  requireAuth,
  requirePermission('customer:read:staff'),
  validate({ query: listQuery }),
  async (req, res, next) => {
    try {
      const { page, limit } = req.query as unknown as z.infer<typeof listQuery>;
      const filter = { assignmentStatus: { $in: ['unassigned', 'exception'] } };
      const [total, items] = await Promise.all([
        Customer.countDocuments(filter),
        Customer.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .exec(),
      ]);
      res.json({
        data: items.map(toPublicCustomer),
        meta: { page, limit, total },
      });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.post(
  '/:id/assignment',
  requireAuth,
  requirePermission('assignment:manage:admin'),
  validate({ params: idParams, body: reassignBody }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const { managerUserId, reason } = req.body as z.infer<typeof reassignBody>;
      const customer = await Customer.findById(id).exec();
      if (!customer) {
        throw new AppError(404, 'NOT_FOUND', 'Customer not found');
      }
      if (!mongoose.Types.ObjectId.isValid(managerUserId)) {
        throw new AppError(400, 'INVALID_MANAGER', 'Manager id is not valid');
      }
      const manager = await assertAssignableManager(managerUserId);
      if (!manager) {
        throw new AppError(
          400,
          'INVALID_MANAGER',
          'Manager must be an active staff, admin, or super_admin account',
        );
      }
      const fromManagerId = customer.assignedManagerUserId?.toString() ?? null;
      const fromStatus = customer.assignmentStatus;
      customer.assignedManagerUserId = manager._id;
      customer.assignmentStatus = 'assigned';
      customer.assignmentSource = 'manual';
      await customer.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'customer.reassigned',
        entityType: 'Customer',
        entityId: customer._id.toString(),
        metadata: {
          reason,
          fromManagerUserId: fromManagerId,
          toManagerUserId: manager._id.toString(),
          fromStatus,
          countryCode: customer.countryCode,
        },
      });
      res.json({ customer: toPublicCustomer(customer) });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.post(
  '/:id/invitations',
  requireAuth,
  requirePermission('customer:create:staff'),
  validate({ params: idParams, body: inviteBody }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const { email } = req.body as z.infer<typeof inviteBody>;
      const result = await issueInvitation({
        customerId: id,
        emailFromStaff: email,
        actorUserId: req.auth!.userId,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.post(
  '/:id/invitations/:invitationId/revoke',
  requireAuth,
  requirePermission('customer:create:staff'),
  validate({
    params: idParams.extend({
      invitationId: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
    }),
  }),
  async (req, res, next) => {
    try {
      const { id, invitationId } = req.params as { id: string; invitationId: string };
      const invitation = await Invitation.findOne({
        _id: invitationId,
        customerId: id,
      }).exec();
      if (!invitation) {
        throw new AppError(404, 'NOT_FOUND', 'Invitation not found');
      }
      if (!invitation.revokedAt && !invitation.consumedAt) {
        invitation.revokedAt = new Date();
        await invitation.save();
        await writeAudit({
          actorUserId: req.auth!.userId,
          action: 'invitation.revoked',
          entityType: 'Customer',
          entityId: id,
          metadata: { invitationId },
        });
      }
      res.json({ invitation: toPublicInvitation(invitation) });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.get(
  '/:id',
  requireAuth,
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const customer = await Customer.findById(id).exec();
      if (!customer) {
        throw new AppError(404, 'NOT_FOUND', 'Customer not found');
      }
      const staffRead = roleHasPermission(req.auth!.role, 'customer:read:staff');
      const selfRead = req.auth!.customerId === id;
      if (!staffRead && !selfRead) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      res.json({ customer: toPublicCustomer(customer) });
    } catch (err) {
      next(err);
    }
  },
);
