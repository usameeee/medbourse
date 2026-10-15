import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { SERVICE_CATEGORIES } from '@medbourse/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { normalizeAmount, normalizeCurrency } from '../money.js';
import { Offering } from '../models/Offering.js';
import { PricingRule, toPublicPricingRule } from '../models/PricingRule.js';
import { writeAudit } from '../services/assignment.js';
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

export const pricingRulesRouter = Router();

pricingRulesRouter.get(
  '/',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  async (_req, res, next) => {
    try {
      const rules = await PricingRule.find().sort({ createdAt: -1 }).exec();
      res.json({ data: rules.map(toPublicPricingRule) });
    } catch (err) {
      next(err);
    }
  },
);

pricingRulesRouter.post(
  '/',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  validate({ body: ruleBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof ruleBody>;
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
        customerCountryCode: body.customerCountryCode ?? null,
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
        metadata: { amount: rule.amount, currency: rule.currency },
      });
      res.status(201).json({ rule: toPublicPricingRule(rule) });
    } catch (err) {
      next(err);
    }
  },
);
