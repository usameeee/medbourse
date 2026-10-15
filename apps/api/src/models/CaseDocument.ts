import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import {
  DOCUMENT_KINDS,
  type DocumentKind,
  type PublicCaseDocument,
} from '@medbourse/shared';

export interface CaseDocumentFields {
  caseId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  kind: DocumentKind;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  storageDriver: 'memory' | 'local' | 'cloudinary';
  resourceType: string | null;
  uploadedByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
}

export type CaseDocumentRecord = HydratedDocument<CaseDocumentFields>;

const caseDocumentSchema = new mongoose.Schema<CaseDocumentFields>(
  {
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    kind: { type: String, required: true, enum: DOCUMENT_KINDS },
    originalFilename: { type: String, required: true, trim: true, maxlength: 180 },
    mimeType: { type: String, required: true, maxlength: 80 },
    sizeBytes: { type: Number, required: true, min: 1 },
    storageKey: { type: String, required: true },
    storageDriver: { type: String, required: true },
    resourceType: { type: String, default: null },
    uploadedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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
    originalFilename: doc.originalFilename,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const CaseDocument: Model<CaseDocumentFields> =
  mongoose.models.CaseDocument ??
  mongoose.model<CaseDocumentFields>('CaseDocument', caseDocumentSchema);
