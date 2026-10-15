import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PublicCountryAssignment } from '@medbourse/shared';

export interface CountryAssignmentFields {
  countryCode: string;
  managerUserIds: mongoose.Types.ObjectId[];
  isActive: boolean;
}

export type CountryAssignmentDocument = HydratedDocument<CountryAssignmentFields>;

const countryAssignmentSchema = new mongoose.Schema<CountryAssignmentFields>(
  {
    countryCode: { type: String, required: true, unique: true, uppercase: true, minlength: 2, maxlength: 2 },
    managerUserIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      required: true,
      validate: [(ids: mongoose.Types.ObjectId[]) => ids.length > 0, 'At least one manager is required'],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export function toPublicCountryAssignment(doc: CountryAssignmentDocument): PublicCountryAssignment {
  return {
    id: doc._id.toString(),
    countryCode: doc.countryCode,
    managerUserIds: doc.managerUserIds.map((id) => id.toString()),
    isActive: doc.isActive,
  };
}

export const CountryAssignment: Model<CountryAssignmentFields> =
  mongoose.models.CountryAssignment ??
  mongoose.model<CountryAssignmentFields>('CountryAssignment', countryAssignmentSchema);
