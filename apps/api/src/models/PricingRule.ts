import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PublicPricingRule, ServiceCategory } from '@medbourse/shared';

export interface PricingRuleFields {
  customerCountryCode: string | null;
  category: ServiceCategory | null;
  offeringId: mongoose.Types.ObjectId | null;
  amount: string;
  currency: string;
  isActive: boolean;
}

export type PricingRuleDocument = HydratedDocument<PricingRuleFields>;

const pricingRuleSchema = new mongoose.Schema<PricingRuleFields>(
  {
    customerCountryCode: { type: String, default: null, uppercase: true, minlength: 2, maxlength: 2 },
    category: { type: String, default: null },
    offeringId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offering', default: null },
    amount: { type: String, required: true },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export function pricingSpecificity(rule: PricingRuleFields): number {
  let score = 0;
  if (rule.offeringId) {
    score += 4;
  }
  if (rule.category) {
    score += 2;
  }
  if (rule.customerCountryCode) {
    score += 1;
  }
  return score;
}

export function toPublicPricingRule(rule: PricingRuleDocument): PublicPricingRule {
  return {
    id: rule._id.toString(),
    customerCountryCode: rule.customerCountryCode,
    category: rule.category,
    offeringId: rule.offeringId ? rule.offeringId.toString() : null,
    amount: rule.amount,
    currency: rule.currency,
    isActive: rule.isActive,
  };
}

export const PricingRule: Model<PricingRuleFields> =
  mongoose.models.PricingRule ?? mongoose.model<PricingRuleFields>('PricingRule', pricingRuleSchema);
