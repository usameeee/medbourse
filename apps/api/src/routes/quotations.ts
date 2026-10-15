import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { roleHasPermission } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { toPublicPaymentAccount } from '../models/PaymentAccount.js';
import { Quotation, toPublicQuotation } from '../models/Quotation.js';
import { writeAudit } from '../services/assignment.js';
import { resolvePaymentAccountForQuotation } from '../services/paymentAccounts.js';
import { issueQuotation } from '../services/pricing.js';

const issueBody = z.object({
  customerId: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid customer'),
  offeringId: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid offering'),
});

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

export const quotationsRouter = Router();

quotationsRouter.post(
  '/',
  requireAuth,
  requirePermission('case:create:staff'),
  validate({ body: issueBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof issueBody>;
      const quotation = await issueQuotation({
        customerId: body.customerId,
        offeringId: body.offeringId,
        actorUserId: req.auth!.userId,
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'quotation.issued',
        entityType: 'Quotation',
        entityId: quotation._id.toString(),
        metadata: {
          amount: quotation.amount,
          currency: quotation.currency,
          customerId: body.customerId,
        },
      });
      res.status(201).json({ quotation: toPublicQuotation(quotation) });
    } catch (err) {
      next(err);
    }
  },
);

quotationsRouter.get(
  '/:id/payment-instructions',
  requireAuth,
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const quotation = await Quotation.findById(id).exec();
      if (!quotation) {
        throw new AppError(404, 'NOT_FOUND', 'Quotation not found');
      }
      const staffRead = roleHasPermission(req.auth!.role, 'customer:read:staff');
      const selfRead = req.auth!.customerId === quotation.customerId.toString();
      if (!staffRead && !selfRead) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      const account = await resolvePaymentAccountForQuotation(quotation);
      res.json({
        quotationId: quotation._id.toString(),
        amount: quotation.amount,
        currency: quotation.currency,
        paymentAccount: toPublicPaymentAccount(account),
      });
    } catch (err) {
      next(err);
    }
  },
);

quotationsRouter.get(
  '/:id',
  requireAuth,
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const quotation = await Quotation.findById(id).exec();
      if (!quotation) {
        throw new AppError(404, 'NOT_FOUND', 'Quotation not found');
      }
      const staffRead = roleHasPermission(req.auth!.role, 'customer:read:staff');
      const selfRead = req.auth!.customerId === quotation.customerId.toString();
      if (!staffRead && !selfRead) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      res.json({ quotation: toPublicQuotation(quotation) });
    } catch (err) {
      next(err);
    }
  },
);
