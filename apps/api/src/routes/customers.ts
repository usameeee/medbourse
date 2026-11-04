import { Router } from 'express';
import { z } from 'zod';
import { roleHasPermission, type CustomerAccountStatus } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { Invitation, toPublicInvitation } from '../models/Invitation.js';
import { Customer, toPublicCustomer } from '../models/Customer.js';
import { toPublicUser, User } from '../models/User.js';
import { issueInvitation } from '../services/invitations.js';
import {
  assertAssignableManager,
  listAssignedCountryCodes,
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
  requirePermission('customer:create:admin'),
  validate({ body: createBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createBody>;
      // A country admin may only open customers in the countries assigned to them; a super
      // admin is not scoped.
      if (req.auth!.role === 'admin') {
        const assigned = await listAssignedCountryCodes(req.auth!.userId);
        if (!assigned.includes(body.countryCode)) {
          throw new AppError(
            403,
            'COUNTRY_NOT_ASSIGNED',
            'You can only open customers in countries assigned to you',
          );
        }
      }
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
  requirePermission('customer:read:admin'),
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
  requirePermission('customer:read:admin'),
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
  requirePermission('assignment:manage:super_admin'),
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
          'Manager must be an active admin or super_admin account',
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
  requirePermission('customer:create:admin'),
  validate({ params: idParams, body: inviteBody }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const { email } = req.body as z.infer<typeof inviteBody>;
      const result = await issueInvitation({
        customerId: id,
        emailFromAdmin: email,
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
  requirePermission('customer:create:admin'),
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

/**
 * Office flow: a walk-in customer has no account, so an admin opens one on their behalf. The
 * account carries no password yet (`passwordHash: null`) and cannot sign in until the customer
 * claims an invitation. The email is the login identity, so it must exist on the record first.
 */
customersRouter.post(
  '/:id/account',
  requireAuth,
  requirePermission('customer:create:admin'),
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const customer = await Customer.findById(id).exec();
      if (!customer) {
        throw new AppError(404, 'NOT_FOUND', 'Customer not found');
      }
      if (!customer.email) {
        throw new AppError(
          400,
          'EMAIL_REQUIRED',
          'Add an email to the customer before creating their account',
        );
      }
      const email = customer.email.toLowerCase();
      const existing = await User.findOne({ email }).select('+passwordHash').exec();
      if (existing) {
        // Idempotent when the account already belongs to this customer and is still unclaimed.
        if (existing.customerId?.toString() === customer._id.toString() && !existing.passwordHash) {
          res.json({ user: toPublicUser(existing) });
          return;
        }
        throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists');
      }

      const user = await User.create({
        email,
        passwordHash: null,
        role: 'customer',
        displayName: customer.fullName,
        customerId: customer._id,
        emailVerifiedAt: null,
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'customer.account_provisioned',
        entityType: 'Customer',
        entityId: customer._id.toString(),
        metadata: { userId: user._id.toString(), email },
      });
      res.status(201).json({ user: toPublicUser(user) });
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
      const managerRead = roleHasPermission(req.auth!.role, 'customer:read:admin');
      const selfRead = req.auth!.customerId === id;
      if (!managerRead && !selfRead) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      // The detail page names who is looking after this customer and whether a login account
      // is ready; the list stays lean and resolves nothing, so only this route pays for the lookups.
      const [manager, account] = await Promise.all([
        customer.assignedManagerUserId
          ? User.findById(customer.assignedManagerUserId).exec()
          : Promise.resolve(null),
        User.findOne({ customerId: customer._id }).select('+passwordHash').exec(),
      ]);
      const accountStatus: CustomerAccountStatus = !account
        ? 'none'
        : account.passwordHash
          ? 'active'
          : 'unclaimed';
      res.json({
        customer: {
          ...toPublicCustomer(customer),
          assignedManagerName: manager ? (manager.displayName ?? manager.email) : null,
          accountStatus,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
