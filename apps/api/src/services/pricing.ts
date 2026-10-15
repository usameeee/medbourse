import { OFFERING_DISCLAIMERS } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { Customer } from '../models/Customer.js';
import { Offering, toPublicOffering } from '../models/Offering.js';
import { PricingRule, pricingSpecificity, type PricingRuleDocument } from '../models/PricingRule.js';
import { Quotation } from '../models/Quotation.js';
import mongoose from 'mongoose';

export function ruleMatches(
  rule: PricingRuleDocument,
  input: { countryCode: string; category: string; offeringId: string },
): boolean {
  if (!rule.isActive) {
    return false;
  }
  if (rule.customerCountryCode && rule.customerCountryCode !== input.countryCode) {
    return false;
  }
  if (rule.category && rule.category !== input.category) {
    return false;
  }
  if (rule.offeringId && rule.offeringId.toString() !== input.offeringId) {
    return false;
  }
  return true;
}

export async function resolvePricingRule(input: {
  countryCode: string;
  category: string;
  offeringId: string;
}): Promise<PricingRuleDocument> {
  const rules = await PricingRule.find({ isActive: true }).exec();
  const matches = rules.filter((rule) => ruleMatches(rule, input));
  if (matches.length === 0) {
    throw new AppError(404, 'NO_PRICE', 'No pricing rule matches this offering and country');
  }
  const scored = matches.map((rule) => ({ rule, score: pricingSpecificity(rule) }));
  const best = Math.max(...scored.map((row) => row.score));
  const winners = scored.filter((row) => row.score === best);
  if (winners.length !== 1) {
    throw new AppError(409, 'AMBIGUOUS_PRICING', 'Multiple pricing rules have the same specificity', {
      ruleIds: winners.map((row) => row.rule._id.toString()),
    });
  }
  return winners[0]!.rule;
}

export async function issueQuotation(input: {
  customerId: string;
  offeringId: string;
  actorUserId: string;
}) {
  const customer = await Customer.findById(input.customerId).exec();
  if (!customer) {
    throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  }
  const offering = await Offering.findById(input.offeringId).exec();
  if (!offering || !offering.isActive) {
    throw new AppError(400, 'INVALID_OFFERING', 'Offering does not exist or is inactive');
  }
  const rule = await resolvePricingRule({
    countryCode: customer.countryCode,
    category: offering.category,
    offeringId: offering._id.toString(),
  });
  const publicOffering = toPublicOffering(offering);
  const quotation = await Quotation.create({
    customerId: customer._id,
    offeringId: offering._id,
    amount: rule.amount,
    currency: rule.currency,
    pricingRuleId: rule._id,
    snapshot: {
      offeringTitle: publicOffering.title,
      offeringSlug: publicOffering.slug,
      category: publicOffering.category,
      disclaimer: OFFERING_DISCLAIMERS[publicOffering.category],
      customerCountryCode: customer.countryCode,
    },
    issuedByUserId: new mongoose.Types.ObjectId(input.actorUserId),
  });
  return quotation;
}
