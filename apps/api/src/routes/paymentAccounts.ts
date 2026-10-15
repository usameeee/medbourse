import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { PAYMENT_METHODS } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { normalizeCurrency } from '../money.js';
import { ibanTail, PaymentAccount, toPublicPaymentAccount } from '../models/PaymentAccount.js';
import { writeAudit } from '../services/assignment.js';
import { normalizeIban, normalizeSwiftBic } from '../services/paymentAccounts.js';
import { countryCodeSchema } from '../validation/country.js';

const accountBody = z.object({
  customerCountryCode: countryCodeSchema.optional(),
  currency: z.string(),
  method: z.enum(PAYMENT_METHODS).optional(),
  label: z.string().trim().min(1).max(120),
  beneficiaryName: z.string().trim().min(1).max(160),
  bankName: z.string().trim().min(1).max(160),
  iban: z.string(),
  swiftBic: z.string().optional(),
  referenceHint: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(800).optional(),
  isActive: z.boolean().optional(),
});

const accountPatch = accountBody.partial();

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

export const paymentAccountsRouter = Router();

paymentAccountsRouter.get(
  '/',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  async (_req, res, next) => {
    try {
      const accounts = await PaymentAccount.find().sort({ createdAt: -1 }).exec();
      res.json({ data: accounts.map(toPublicPaymentAccount) });
    } catch (err) {
      next(err);
    }
  },
);

paymentAccountsRouter.post(
  '/',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  validate({ body: accountBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof accountBody>;
      const account = await PaymentAccount.create({
        customerCountryCode: body.customerCountryCode ?? null,
        currency: normalizeCurrency(body.currency),
        method: body.method ?? 'bank_transfer',
        label: body.label,
        beneficiaryName: body.beneficiaryName,
        bankName: body.bankName,
        iban: normalizeIban(body.iban),
        swiftBic: normalizeSwiftBic(body.swiftBic),
        referenceHint: body.referenceHint ?? null,
        notes: body.notes ?? null,
        isActive: body.isActive ?? true,
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'payment_account.created',
        entityType: 'PaymentAccount',
        entityId: account._id.toString(),
        metadata: {
          currency: account.currency,
          customerCountryCode: account.customerCountryCode,
          ibanTail: ibanTail(account.iban),
        },
      });
      res.status(201).json({ paymentAccount: toPublicPaymentAccount(account) });
    } catch (err) {
      next(err);
    }
  },
);

paymentAccountsRouter.patch(
  '/:id',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  validate({ params: idParams, body: accountPatch }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const body = req.body as z.infer<typeof accountPatch>;
      const account = await PaymentAccount.findById(id).exec();
      if (!account) {
        throw new AppError(404, 'NOT_FOUND', 'Payment account not found');
      }
      if (body.customerCountryCode !== undefined) {
        account.customerCountryCode = body.customerCountryCode;
      }
      if (body.currency !== undefined) {
        account.currency = normalizeCurrency(body.currency);
      }
      if (body.method !== undefined) {
        account.method = body.method;
      }
      if (body.label !== undefined) {
        account.label = body.label;
      }
      if (body.beneficiaryName !== undefined) {
        account.beneficiaryName = body.beneficiaryName;
      }
      if (body.bankName !== undefined) {
        account.bankName = body.bankName;
      }
      if (body.iban !== undefined) {
        account.iban = normalizeIban(body.iban);
      }
      if (body.swiftBic !== undefined) {
        account.swiftBic = normalizeSwiftBic(body.swiftBic);
      }
      if (body.referenceHint !== undefined) {
        account.referenceHint = body.referenceHint;
      }
      if (body.notes !== undefined) {
        account.notes = body.notes;
      }
      if (body.isActive !== undefined) {
        account.isActive = body.isActive;
      }
      await account.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'payment_account.updated',
        entityType: 'PaymentAccount',
        entityId: account._id.toString(),
        metadata: {
          currency: account.currency,
          ibanTail: ibanTail(account.iban),
        },
      });
      res.json({ paymentAccount: toPublicPaymentAccount(account) });
    } catch (err) {
      next(err);
    }
  },
);
