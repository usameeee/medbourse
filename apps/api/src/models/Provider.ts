import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PublicProvider, ServiceCategory } from '@medbourse/shared';
import { SERVICE_CATEGORIES } from '@medbourse/shared';
import { resolveMediaUrl } from './Media.js';

export interface ProviderFields {
  name: string;
  category: ServiceCategory;
  cityId: mongoose.Types.ObjectId;
  countryCode: string;
  website: string | null;
  logoMediaId: mongoose.Types.ObjectId | null;
  coverMediaId: mongoose.Types.ObjectId | null;
  isActive: boolean;
  partnershipVerified: boolean;
}

export type ProviderDocument = HydratedDocument<ProviderFields>;

const providerSchema = new mongoose.Schema<ProviderFields>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, required: true, enum: SERVICE_CATEGORIES },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
    countryCode: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    website: { type: String, default: null, trim: true },
    logoMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
    coverMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
    isActive: { type: Boolean, default: true },
    partnershipVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

providerSchema.index({ cityId: 1, name: 1 }, { unique: true });

export function toPublicProvider(
  provider: ProviderDocument,
  mediaUrls: Map<string, string> = new Map(),
): PublicProvider {
  return {
    id: provider._id.toString(),
    name: provider.name,
    category: provider.category,
    cityId: provider.cityId.toString(),
    countryCode: provider.countryCode,
    website: provider.website,
    logoMediaId: provider.logoMediaId ? provider.logoMediaId.toString() : null,
    logoUrl: resolveMediaUrl(provider.logoMediaId, mediaUrls),
    coverMediaId: provider.coverMediaId ? provider.coverMediaId.toString() : null,
    coverImageUrl: resolveMediaUrl(provider.coverMediaId, mediaUrls),
    isActive: provider.isActive,
    partnershipVerified: provider.partnershipVerified,
  };
}

export const Provider: Model<ProviderFields> =
  mongoose.models.Provider ?? mongoose.model<ProviderFields>('Provider', providerSchema);
