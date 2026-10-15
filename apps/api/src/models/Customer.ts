import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { AssignmentStatus, PublicCustomer } from '@medbourse/shared';

export interface CustomerFields {
  fullName: string;
  email: string | null;
  phone: string | null;
  countryCode: string;
  assignedManagerUserId: mongoose.Types.ObjectId | null;
  assignmentStatus: AssignmentStatus;
  assignmentSource: 'country_map' | 'manual' | 'none';
  createdByUserId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CustomerDocument = HydratedDocument<CustomerFields>;

const customerSchema = new mongoose.Schema<CustomerFields>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null, trim: true, maxlength: 32 },
    countryCode: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    assignedManagerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignmentStatus: {
      type: String,
      enum: ['unassigned', 'assigned', 'exception'],
      default: 'unassigned',
    },
    assignmentSource: { type: String, enum: ['country_map', 'manual', 'none'], default: 'none' },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

customerSchema.index({ assignmentStatus: 1, countryCode: 1 });

customerSchema.index(
  { email: 1 },
  { unique: true, sparse: true, partialFilterExpression: { email: { $type: 'string' } } },
);

export function toPublicCustomer(customer: CustomerDocument): PublicCustomer {
  return {
    id: customer._id.toString(),
    fullName: customer.fullName,
    email: customer.email,
    phone: customer.phone,
    countryCode: customer.countryCode,
    assignedManagerUserId: customer.assignedManagerUserId
      ? customer.assignedManagerUserId.toString()
      : null,
    assignmentStatus: customer.assignmentStatus,
    createdByUserId: customer.createdByUserId ? customer.createdByUserId.toString() : null,
    createdAt: customer.createdAt.toISOString(),
  };
}

export const Customer: Model<CustomerFields> =
  mongoose.models.Customer ?? mongoose.model<CustomerFields>('Customer', customerSchema);
