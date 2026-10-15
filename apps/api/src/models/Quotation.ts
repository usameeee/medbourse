import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PublicQuotation, ServiceCategory } from '@medbourse/shared';

export interface QuotationSnapshot {
  offeringTitle: string;
  offeringSlug: string;
  category: ServiceCategory;
  disclaimer: string;
  customerCountryCode: string;
}

export interface QuotationFields {
  customerId: mongoose.Types.ObjectId;
  offeringId: mongoose.Types.ObjectId;
  amount: string;
  currency: string;
  pricingRuleId: mongoose.Types.ObjectId;
  snapshot: QuotationSnapshot;
  issuedByUserId: mongoose.Types.ObjectId;
  issuedAt: Date;
}

export type QuotationDocument = HydratedDocument<QuotationFields>;

const quotationSchema = new mongoose.Schema<QuotationFields>(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    offeringId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offering', required: true },
    amount: { type: String, required: true },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    pricingRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'PricingRule', required: true },
    snapshot: {
      offeringTitle: { type: String, required: true },
      offeringSlug: { type: String, required: true },
      category: { type: String, required: true },
      disclaimer: { type: String, required: true },
      customerCountryCode: { type: String, required: true },
    },
    issuedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'issuedAt', updatedAt: false } },
);

quotationSchema.index({ customerId: 1, issuedAt: -1 });

export function toPublicQuotation(doc: QuotationDocument): PublicQuotation {
  return {
    id: doc._id.toString(),
    customerId: doc.customerId.toString(),
    offeringId: doc.offeringId.toString(),
    amount: doc.amount,
    currency: doc.currency,
    pricingRuleId: doc.pricingRuleId.toString(),
    snapshot: {
      offeringTitle: doc.snapshot.offeringTitle,
      offeringSlug: doc.snapshot.offeringSlug,
      category: doc.snapshot.category as ServiceCategory,
      disclaimer: doc.snapshot.disclaimer,
      customerCountryCode: doc.snapshot.customerCountryCode,
    },
    issuedAt: doc.issuedAt.toISOString(),
  };
}

export const Quotation: Model<QuotationFields> =
  mongoose.models.Quotation ?? mongoose.model<QuotationFields>('Quotation', quotationSchema);
