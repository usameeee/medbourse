import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { PAYMENT_METHODS, defaultPaymentProfile } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAnyPermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { normalizeCurrency } from '../money.js';
import { accountTail, PaymentAccount, toPublicPaymentAccount } from '../models/PaymentAccount.js';
import { writeAudit } from '../services/assignment.js';
import { assertPaymentIdentifiers } from '../services/paymentAccounts.js';
import { assertPaymentCountryAllowed, paymentScopeCountries } from '../services/paymentScope.js';
import { countryCodeSchema } from '../validation/country.js';

const identifierBody = z.object({
  key: z.string().trim().min(1).max(40),
  value: z.string(),
});

const accountBody = z.object({
  customerCountryCode: countryCodeSchema.optional(),
  currency: z.string(),
  method: z.enum(PAYMENT_METHODS).optional(),
  /** Which way of paying into the method; defaults to its first profile. */
  profile: z.string().trim().min(1).max(40).optional(),
  label: z.string().trim().min(1).max(120),
  beneficiaryName: z.string().trim().min(1).max(160),
  /** The bank, mobile-money operator, wallet, exchange or desk the money lands in. */
  providerName: z.string().trim().min(1).max(160),
  /** Only the identifiers the chosen profile declares; validated against the library. */
  identifiers: z.array(identifierBody).optional(),
  referenceHint: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(800).optional(),
  /** Lower sorts first when several rails serve the same country and currency. */
  priority: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

const accountPatch = accountBody.partial();

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

export const paymentAccountsRouter = Router();

/** Super admins own the global account; a country admin only their assigned countries' accounts. */
const accountManagers = requireAnyPermission(
  'catalog:manage:super_admin',
  'payment:manage:assigned',
);

paymentAccountsRouter.get('/', requireAuth, accountManagers, async (req, res, next) => {
  try {
    const countries = await paymentScopeCountries(req);
    const filter =
      countries === null
        ? {}
        : { $or: [{ customerCountryCode: { $in: countries } }, { customerCountryCode: null }] };
    const accounts = await PaymentAccount.find(filter).sort({ createdAt: -1 }).exec();
    res.json({ data: accounts.map(toPublicPaymentAccount) });
  } catch (err) {
    next(err);
  }
});

paymentAccountsRouter.post(
  '/',
  requireAuth,
  accountManagers,
  validate({ body: accountBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof accountBody>;
      const customerCountryCode = body.customerCountryCode ?? null;
      await assertPaymentCountryAllowed(req, customerCountryCode);
      // The rail decides the profile, and the profile decides which identifiers are
      // required — a bank transfer or a wallet simply follows the shared library.
      const method = body.method ?? 'bank_transfer';
      const profile = body.profile ?? defaultPaymentProfile(method).id;
      const identifiers = assertPaymentIdentifiers({
        method,
        profile,
        identifiers: body.identifiers ?? [],
      });
      const account = await PaymentAccount.create({
        customerCountryCode,
        currency: normalizeCurrency(body.currency),
        method,
        profile,
        label: body.label,
        beneficiaryName: body.beneficiaryName,
        providerName: body.providerName,
        identifiers,
        referenceHint: body.referenceHint ?? null,
        notes: body.notes ?? null,
        priority: body.priority ?? 0,
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
          method: account.method,
          profile: account.profile,
          accountTail: accountTail(account),
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
  accountManagers,
  validate({ params: idParams, body: accountPatch }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const body = req.body as z.infer<typeof accountPatch>;
      const account = await PaymentAccount.findById(id).exec();
      if (!account) {
        throw new AppError(404, 'NOT_FOUND', 'Payment account not found');
      }
      // The caller must already own the account's scope, and the new scope must stay theirs.
      await assertPaymentCountryAllowed(req, account.customerCountryCode);
      if (body.customerCountryCode !== undefined) {
        await assertPaymentCountryAllowed(req, body.customerCountryCode);
        account.customerCountryCode = body.customerCountryCode;
      }
      if (body.currency !== undefined) {
        account.currency = normalizeCurrency(body.currency);
      }
      const method = body.method ?? account.method;
      const profile =
        body.profile ??
        (method === account.method ? account.profile : defaultPaymentProfile(method).id);
      // Moving an account to another rail or profile means the old identifiers no longer
      // apply, so the caller has to send the new set instead of leaving a half account.
      if (body.identifiers === undefined && (method !== account.method || profile !== account.profile)) {
        throw new AppError(
          400,
          'PAYMENT_IDENTIFIERS_REQUIRED',
          'Changing the payment method or profile requires the new identifiers',
          { method, profile },
        );
      }
      const identifiers =
        body.identifiers === undefined
          ? account.identifiers
          : assertPaymentIdentifiers({ method, profile, identifiers: body.identifiers });
      if (body.label !== undefined) {
        account.label = body.label;
      }
      if (body.beneficiaryName !== undefined) {
        account.beneficiaryName = body.beneficiaryName;
      }
      if (body.providerName !== undefined) {
        account.providerName = body.providerName;
      }
      account.method = method;
      account.profile = profile;
      account.identifiers = identifiers;
      if (body.referenceHint !== undefined) {
        account.referenceHint = body.referenceHint;
      }
      if (body.notes !== undefined) {
        account.notes = body.notes;
      }
      if (body.priority !== undefined) {
        account.priority = body.priority;
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
          method: account.method,
          profile: account.profile,
          accountTail: accountTail(account),
        },
      });
      res.json({ paymentAccount: toPublicPaymentAccount(account) });
    } catch (err) {
      next(err);
    }
  },
);
