import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PublicCity } from '@medbourse/shared';

export interface CityFields {
  slug: string;
  name: string;
  countryCode: string;
  isActive: boolean;
}

export type CityDocument = HydratedDocument<CityFields>;

const citySchema = new mongoose.Schema<CityFields>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    countryCode: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export function toPublicCity(city: CityDocument): PublicCity {
  return {
    id: city._id.toString(),
    slug: city.slug,
    name: city.name,
    countryCode: city.countryCode,
    isActive: city.isActive,
  };
}

export const City: Model<CityFields> = mongoose.models.City ?? mongoose.model<CityFields>('City', citySchema);
