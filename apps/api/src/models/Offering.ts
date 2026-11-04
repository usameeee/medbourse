import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { LocalizedText, PublicOffering, ServiceCategory } from '@medbourse/shared';
import { OFFERING_DISCLAIMERS, SERVICE_CATEGORIES } from '@medbourse/shared';
import { resolveMediaUrl } from './Media.js';

export interface OfferingFields {
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  requirementsSummary: LocalizedText | null;
  /** Library documents a customer must provide for this package. */
  requiredDocumentIds: mongoose.Types.ObjectId[];
  category: ServiceCategory;
  providerId: mongoose.Types.ObjectId | null;
  cityId: mongoose.Types.ObjectId;
  countryCode: string;
  logoMediaId: mongoose.Types.ObjectId | null;
  coverMediaId: mongoose.Types.ObjectId | null;
  isActive: boolean;
}

export type OfferingDocument = HydratedDocument<OfferingFields>;

/** Localized sub-document matching the pattern used by SiteContent and ShowcaseSlide. */
const localizedSchema = (maxlength: number) =>
  new mongoose.Schema<LocalizedText>(
    {
      en: { type: String, default: '', trim: true, maxlength },
      tr: { type: String, default: '', trim: true, maxlength },
      fr: { type: String, default: '', trim: true, maxlength },
      ar: { type: String, default: '', trim: true, maxlength },
    },
    { _id: false },
  );

const titleSchema = localizedSchema(160);
const longTextSchema = localizedSchema(800);

const emptyLocalized = () => ({ en: '', tr: '', fr: '', ar: '' });

const offeringSchema = new mongoose.Schema<OfferingFields>(
  {
    slug: { type: String, required: true, lowercase: true, trim: true },
    title: { type: titleSchema, default: emptyLocalized },
    summary: { type: longTextSchema, default: emptyLocalized },
    requirementsSummary: { type: longTextSchema, default: null },
    requiredDocumentIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'DocumentRequirement',
      default: [],
    },
    category: { type: String, required: true, enum: SERVICE_CATEGORIES },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', default: null },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
    countryCode: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    logoMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
    coverMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

offeringSchema.index({ slug: 1 }, { unique: true });
offeringSchema.index({ providerId: 1, category: 1 });

function normalizeLocalized(value: LocalizedText | null | undefined): LocalizedText {
  return {
    en: value?.en ?? '',
    tr: value?.tr ?? '',
    fr: value?.fr ?? '',
    ar: value?.ar ?? '',
  };
}

export function toPublicOffering(
  offering: OfferingDocument,
  mediaUrls: Map<string, string> = new Map(),
): PublicOffering {
  return {
    id: offering._id.toString(),
    slug: offering.slug,
    title: normalizeLocalized(offering.title),
    summary: normalizeLocalized(offering.summary),
    requirementsSummary: offering.requirementsSummary ? normalizeLocalized(offering.requirementsSummary) : null,
    requiredDocumentIds: offering.requiredDocumentIds.map((id) => id.toString()),
    category: offering.category,
    providerId: offering.providerId ? offering.providerId.toString() : null,
    cityId: offering.cityId.toString(),
    countryCode: offering.countryCode,
    logoMediaId: offering.logoMediaId ? offering.logoMediaId.toString() : null,
    logoUrl: resolveMediaUrl(offering.logoMediaId, mediaUrls),
    coverMediaId: offering.coverMediaId ? offering.coverMediaId.toString() : null,
    coverImageUrl: resolveMediaUrl(offering.coverMediaId, mediaUrls),
    isActive: offering.isActive,
    disclaimer: OFFERING_DISCLAIMERS[offering.category],
  };
}

export const Offering: Model<OfferingFields> =
  mongoose.models.Offering ?? mongoose.model<OfferingFields>('Offering', offeringSchema);
