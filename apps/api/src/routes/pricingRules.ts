import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { SERVICE_CATEGORIES } from '@medbourse/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAnyPermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { normalizeAmount, normalizeCurrency } from '../money.js';
import { Offering } from '../models/Offering.js';
import { PricingRule, toPublicPricingRule } from '../models/PricingRule.js';
import { writeAudit } from '../services/assignment.js';
import {
  assertPaymentCountryAllowed,
  paymentScopeCountries,
} from '../services/paymentScope.js';
import { countryCodeSchema } from '../validation/country.js';
import { AppError } from '../errors/AppError.js';

const ruleBody = z.object({
  customerCountryCode: countryCodeSchema.optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  offeringId: z.string().optional(),
  amount: z.string(),
  currency: z.string(),
  isActive: z.boolean().optional(),
});

const rulePatch = ruleBody.partial();

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

/** Super admins manage any scope; a country admin only the countries they are assigned to. */
const ruleManagers = requireAnyPermission('catalog:manage:super_admin', 'payment:manage:assigned');

export const pricingRulesRouter = Router();

pricingRulesRouter.get('/', requireAuth, ruleManagers, async (req, res, next) => {
  try {
    const countries = await paymentScopeCountries(req);
    // A country admin still sees the global defaults (rows with no country) so they
    // know what applies when they have not priced their own country yet.
    const filter =
      countries === null
        ? {}
        : { $or: [{ customerCountryCode: { $in: countries } }, { customerCountryCode: null }] };
    const rules = await PricingRule.find(filter).sort({ createdAt: -1 }).exec();
    res.json({ data: rules.map(toPublicPricingRule) });
  } catch (err) {
    next(err);
  }
});

pricingRulesRouter.post(
  '/',
  requireAuth,
  ruleManagers,
  validate({ body: ruleBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof ruleBody>;
      const customerCountryCode = body.customerCountryCode ?? null;
      await assertPaymentCountryAllowed(req, customerCountryCode);
      let offeringId: mongoose.Types.ObjectId | null = null;
      if (body.offeringId) {
        if (!mongoose.Types.ObjectId.isValid(body.offeringId)) {
          throw new AppError(400, 'INVALID_OFFERING', 'Offering id is not valid');
        }
        const offering = await Offering.findById(body.offeringId).exec();
        if (!offering) {
          throw new AppError(400, 'INVALID_OFFERING', 'Offering does not exist');
        }
        offeringId = offering._id;
      }
      const rule = await PricingRule.create({
        customerCountryCode,
        category: body.category ?? null,
        offeringId,
        amount: normalizeAmount(body.amount),
        currency: normalizeCurrency(body.currency),
        isActive: body.isActive ?? true,
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'pricing_rule.created',
        entityType: 'PricingRule',
        entityId: rule._id.toString(),
        metadata: {
          amount: rule.amount,
          currency: rule.currency,
          customerCountryCode: rule.customerCountryCode,
        },
      });
      res.status(201).json({ rule: toPublicPricingRule(rule) });
    } catch (err) {
      next(err);
    }
  },
);

pricingRulesRouter.patch(
  '/:id',
  requireAuth,
  ruleManagers,
  validate({ params: idParams, body: rulePatch }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const body = req.body as z.infer<typeof rulePatch>;
      const rule = await PricingRule.findById(id).exec();
      if (!rule) {
        throw new AppError(404, 'NOT_FOUND', 'Pricing rule not found');
      }
      // The caller must already own the rule's scope, and the new scope must stay theirs.
      await assertPaymentCountryAllowed(req, rule.customerCountryCode);
      if (body.customerCountryCode !== undefined) {
        await assertPaymentCountryAllowed(req, body.customerCountryCode);
        rule.customerCountryCode = body.customerCountryCode;
      }
      if (body.category !== undefined) {
        rule.category = body.category;
      }
      if (body.offeringId !== undefined) {
        if (!mongoose.Types.ObjectId.isValid(body.offeringId)) {
          throw new AppError(400, 'INVALID_OFFERING', 'Offering id is not valid');
        }
        const offering = await Offering.findById(body.offeringId).exec();
        if (!offering) {
          throw new AppError(400, 'INVALID_OFFERING', 'Offering does not exist');
        }
        rule.offeringId = offering._id;
      }
      if (body.amount !== undefined) {
        rule.amount = normalizeAmount(body.amount);
      }
      if (body.currency !== undefined) {
        rule.currency = normalizeCurrency(body.currency);
      }
      if (body.isActive !== undefined) {
        rule.isActive = body.isActive;
      }
      await rule.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'pricing_rule.updated',
        entityType: 'PricingRule',
        entityId: rule._id.toString(),
        metadata: {
          amount: rule.amount,
          currency: rule.currency,
          customerCountryCode: rule.customerCountryCode,
        },
      });
      res.json({ rule: toPublicPricingRule(rule) });
    } catch (err) {
      next(err);
    }
  },
);
