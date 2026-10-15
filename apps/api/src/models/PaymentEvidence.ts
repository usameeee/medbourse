import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import {
  PAYMENT_EVIDENCE_STATUSES,
  type PaymentEvidenceStatus,
  type PublicPaymentEvidence,
} from '@medbourse/shared';

export interface PaymentEvidenceFields {
  quotationId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  status: PaymentEvidenceStatus;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  storageDriver: 'memory' | 'local' | 'cloudinary';
  resourceType: string | null;
  uploadedByUserId: mongoose.Types.ObjectId;
  reviewedByUserId: mongoose.Types.ObjectId | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export type PaymentEvidenceDocument = HydratedDocument<PaymentEvidenceFields>;

const paymentEvidenceSchema = new mongoose.Schema<PaymentEvidenceFields>(
  {
    quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    status: { type: String, enum: PAYMENT_EVIDENCE_STATUSES, default: 'submitted' },
    originalFilename: { type: String, required: true, trim: true, maxlength: 180 },
    mimeType: { type: String, required: true, maxlength: 80 },
    sizeBytes: { type: Number, required: true, min: 1 },
    storageKey: { type: String, required: true },
    storageDriver: { type: String, required: true },
    resourceType: { type: String, default: null },
    uploadedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewNote: { type: String, default: null, trim: true, maxlength: 500 },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

paymentEvidenceSchema.index({ quotationId: 1, createdAt: -1 });

export function toPublicPaymentEvidence(doc: PaymentEvidenceDocument): PublicPaymentEvidence {
  return {
    id: doc._id.toString(),
    quotationId: doc.quotationId.toString(),
    customerId: doc.customerId.toString(),
    status: doc.status,
    originalFilename: doc.originalFilename,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    reviewNote: doc.reviewNote,
    reviewedAt: doc.reviewedAt ? doc.reviewedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const PaymentEvidence: Model<PaymentEvidenceFields> =
  mongoose.models.PaymentEvidence ??
  mongoose.model<PaymentEvidenceFields>('PaymentEvidence', paymentEvidenceSchema);
