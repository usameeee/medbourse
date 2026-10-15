import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PublicOffering, ServiceCategory } from '@medbourse/shared';
import { OFFERING_DISCLAIMERS, SERVICE_CATEGORIES } from '@medbourse/shared';

export interface OfferingFields {
  slug: string;
  title: string;
  summary: string;
  requirementsSummary: string | null;
  category: ServiceCategory;
  providerId: mongoose.Types.ObjectId;
  cityId: mongoose.Types.ObjectId;
  countryCode: string;
  isActive: boolean;
}

export type OfferingDocument = HydratedDocument<OfferingFields>;

const offeringSchema = new mongoose.Schema<OfferingFields>(
  {
    slug: { type: String, required: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    summary: { type: String, required: true, trim: true, maxlength: 800 },
    requirementsSummary: { type: String, default: null, trim: true, maxlength: 800 },
    category: { type: String, required: true, enum: SERVICE_CATEGORIES },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
    countryCode: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

offeringSchema.index({ slug: 1 }, { unique: true });
offeringSchema.index({ providerId: 1, category: 1 });

export function toPublicOffering(offering: OfferingDocument): PublicOffering {
  return {
    id: offering._id.toString(),
    slug: offering.slug,
    title: offering.title,
    summary: offering.summary,
    requirementsSummary: offering.requirementsSummary,
    category: offering.category,
    providerId: offering.providerId.toString(),
    cityId: offering.cityId.toString(),
    countryCode: offering.countryCode,
    isActive: offering.isActive,
    disclaimer: OFFERING_DISCLAIMERS[offering.category],
  };
}

export const Offering: Model<OfferingFields> =
  mongoose.models.Offering ?? mongoose.model<OfferingFields>('Offering', offeringSchema);
