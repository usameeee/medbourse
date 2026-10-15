import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PublicProvider, ServiceCategory } from '@medbourse/shared';
import { SERVICE_CATEGORIES } from '@medbourse/shared';

export interface ProviderFields {
  name: string;
  category: ServiceCategory;
  cityId: mongoose.Types.ObjectId;
  countryCode: string;
  website: string | null;
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
    isActive: { type: Boolean, default: true },
    partnershipVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

providerSchema.index({ cityId: 1, name: 1 }, { unique: true });

export function toPublicProvider(provider: ProviderDocument): PublicProvider {
  return {
    id: provider._id.toString(),
    name: provider.name,
    category: provider.category,
    cityId: provider.cityId.toString(),
    countryCode: provider.countryCode,
    website: provider.website,
    isActive: provider.isActive,
    partnershipVerified: provider.partnershipVerified,
  };
}

export const Provider: Model<ProviderFields> =
  mongoose.models.Provider ?? mongoose.model<ProviderFields>('Provider', providerSchema);
