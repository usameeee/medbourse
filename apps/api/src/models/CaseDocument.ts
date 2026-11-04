import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import {
  DOCUMENT_KINDS,
  DOCUMENT_REVIEW_STATUSES,
  type DocumentKind,
  type DocumentReviewStatus,
  type PublicCaseDocument,
} from '@medbourse/shared';

export interface CaseDocumentFields {
  caseId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  kind: DocumentKind;
  /** Library entry this upload satisfies, or `null` for a free-form upload. */
  requirementId: mongoose.Types.ObjectId | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  storageDriver: 'memory' | 'local' | 'cloudinary';
  resourceType: string | null;
  uploadedByUserId: mongoose.Types.ObjectId;
  /** Admin verdict; a rejected upload is what the customer must re-upload. */
  reviewStatus: DocumentReviewStatus;
  reviewNote: string | null;
  reviewedByUserId: mongoose.Types.ObjectId | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export type CaseDocumentRecord = HydratedDocument<CaseDocumentFields>;

const caseDocumentSchema = new mongoose.Schema<CaseDocumentFields>(
  {
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    kind: { type: String, required: true, enum: DOCUMENT_KINDS },
    requirementId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentRequirement', default: null },
    originalFilename: { type: String, required: true, trim: true, maxlength: 180 },
    mimeType: { type: String, required: true, maxlength: 80 },
    sizeBytes: { type: Number, required: true, min: 1 },
    storageKey: { type: String, required: true },
    storageDriver: { type: String, required: true },
    resourceType: { type: String, default: null },
    uploadedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewStatus: { type: String, enum: DOCUMENT_REVIEW_STATUSES, default: 'pending' },
    reviewNote: { type: String, default: null, trim: true, maxlength: 500 },
    reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

caseDocumentSchema.index({ caseId: 1, createdAt: -1 });

export function toPublicCaseDocument(doc: CaseDocumentRecord): PublicCaseDocument {
  return {
    id: doc._id.toString(),
    caseId: doc.caseId.toString(),
    customerId: doc.customerId.toString(),
    kind: doc.kind,
    requirementId: doc.requirementId ? doc.requirementId.toString() : null,
    originalFilename: doc.originalFilename,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    reviewStatus: doc.reviewStatus ?? 'pending',
    reviewNote: doc.reviewNote ?? null,
    reviewedAt: doc.reviewedAt ? doc.reviewedAt.toISOString() : null,
    reviewedByName: null,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const CaseDocument: Model<CaseDocumentFields> =
  mongoose.models.CaseDocument ??
  mongoose.model<CaseDocumentFields>('CaseDocument', caseDocumentSchema);
