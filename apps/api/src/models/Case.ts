import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import {
  CASE_REVIEW_STATUSES,
  CASE_STATUSES,
  DOCUMENT_KINDS,
  PAYMENT_METHODS,
  WORKFLOW_STAGE_STATUSES,
  type CaseRequiredDocument,
  type CaseReviewStatus,
  type CaseStatus,
  type CaseWorkflowSnapshot,
  type CaseWorkflowStage,
  type DocumentKind,
  type LocalizedText,
  type PaymentMethod,
  type PublicCase,
  type ServiceCategory,
  type WorkflowStageStatus,
} from '@medbourse/shared';

export interface CaseWorkflowStageFields {
  id: string;
  name: string;
  description: string | null;
  order: number;
  optional: boolean;
  status: WorkflowStageStatus;
}

export interface CaseWorkflowSnapshotFields {
  templateId: mongoose.Types.ObjectId;
  versionNumber: number;
  stages: CaseWorkflowStageFields[];
}

/** A document checklist row frozen onto the case so it never drifts from the offering. */
export interface CaseRequiredDocumentFields {
  requirementId: mongoose.Types.ObjectId;
  key: string;
  title: LocalizedText;
  description: LocalizedText | null;
  kind: DocumentKind;
  order: number;
}

export interface CaseFields {
  customerId: mongoose.Types.ObjectId;
  offeringId: mongoose.Types.ObjectId;
  quotationId: mongoose.Types.ObjectId | null;
  status: CaseStatus;
  category: ServiceCategory;
  offeringTitle: string;
  workflow: CaseWorkflowSnapshotFields | null;
  requiredDocuments: CaseRequiredDocumentFields[];
  /** The receiving rail the customer pays through, or `null` before one is chosen. */
  paymentAccountId: mongoose.Types.ObjectId | null;
  paymentMethod: PaymentMethod | null;
  /** Set when the customer submitted the completed file; `null` while still a draft. */
  submittedAt: Date | null;
  /** Admin verdict on the whole file, tracked separately from the open/closed status. */
  reviewStatus: CaseReviewStatus;
  reviewNote: string | null;
  reviewedByUserId: mongoose.Types.ObjectId | null;
  reviewedAt: Date | null;
  createdByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type CaseDocument = HydratedDocument<CaseFields>;

const caseWorkflowStageSchema = new mongoose.Schema<CaseWorkflowStageFields>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: null, trim: true, maxlength: 800 },
    order: { type: Number, required: true, min: 0 },
    optional: { type: Boolean, default: false },
    status: { type: String, enum: WORKFLOW_STAGE_STATUSES, default: 'pending' },
  },
  { _id: false },
);

const caseWorkflowSnapshotSchema = new mongoose.Schema<CaseWorkflowSnapshotFields>(
  {
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowTemplate', required: true },
    versionNumber: { type: Number, required: true, min: 1 },
    stages: { type: [caseWorkflowStageSchema], required: true, default: [] },
  },
  { _id: false },
);

const localizedTextSchema = new mongoose.Schema<LocalizedText>(
  {
    en: { type: String, default: '', trim: true, maxlength: 800 },
    tr: { type: String, default: '', trim: true, maxlength: 800 },
    fr: { type: String, default: '', trim: true, maxlength: 800 },
    ar: { type: String, default: '', trim: true, maxlength: 800 },
  },
  { _id: false },
);

const caseRequiredDocumentSchema = new mongoose.Schema<CaseRequiredDocumentFields>(
  {
    requirementId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentRequirement', required: true },
    key: { type: String, required: true, trim: true, maxlength: 60 },
    title: { type: localizedTextSchema, required: true },
    description: { type: localizedTextSchema, default: null },
    kind: { type: String, required: true, enum: DOCUMENT_KINDS },
    order: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const caseSchema = new mongoose.Schema<CaseFields>(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    offeringId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offering', required: true },
    quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', default: null },
    status: { type: String, enum: CASE_STATUSES, default: 'open' },
    category: { type: String, required: true },
    offeringTitle: { type: String, required: true, trim: true, maxlength: 160 },
    workflow: { type: caseWorkflowSnapshotSchema, default: null },
    requiredDocuments: { type: [caseRequiredDocumentSchema], default: [] },
    paymentAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAccount', default: null },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: null },
    submittedAt: { type: Date, default: null },
    reviewStatus: { type: String, enum: CASE_REVIEW_STATUSES, default: 'awaiting' },
    reviewNote: { type: String, default: null, trim: true, maxlength: 800 },
    reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

caseSchema.index({ customerId: 1, createdAt: -1 });
caseSchema.index({ submittedAt: 1, createdAt: -1 });

function toPublicWorkflowStage(stage: CaseWorkflowStageFields): CaseWorkflowStage {
  return {
    id: stage.id,
    name: stage.name,
    description: stage.description,
    order: stage.order,
    optional: stage.optional,
    status: stage.status,
  };
}

function toPublicWorkflowSnapshot(snapshot: CaseWorkflowSnapshotFields | null): CaseWorkflowSnapshot | null {
  if (!snapshot) {
    return null;
  }
  return {
    templateId: snapshot.templateId.toString(),
    versionNumber: snapshot.versionNumber,
    stages: snapshot.stages.map(toPublicWorkflowStage),
  };
}

export function toPublicCase(doc: CaseDocument): PublicCase {
  return {
    id: doc._id.toString(),
    customerId: doc.customerId.toString(),
    offeringId: doc.offeringId.toString(),
    quotationId: doc.quotationId ? doc.quotationId.toString() : null,
    status: doc.status,
    category: doc.category,
    offeringTitle: doc.offeringTitle,
    workflow: toPublicWorkflowSnapshot(doc.workflow),
    requiredDocuments: doc.requiredDocuments.map(toPublicRequiredDocument),
    paymentAccountId: doc.paymentAccountId ? doc.paymentAccountId.toString() : null,
    paymentMethod: doc.paymentMethod ?? null,
    submittedAt: doc.submittedAt ? doc.submittedAt.toISOString() : null,
    reviewStatus: doc.reviewStatus ?? 'awaiting',
    reviewNote: doc.reviewNote ?? null,
    reviewedAt: doc.reviewedAt ? doc.reviewedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
  };
}

function toPublicRequiredDocument(doc: CaseRequiredDocumentFields): CaseRequiredDocument {
  return {
    requirementId: doc.requirementId.toString(),
    key: doc.key,
    title: {
      en: doc.title?.en ?? '',
      tr: doc.title?.tr ?? '',
      fr: doc.title?.fr ?? '',
      ar: doc.title?.ar ?? '',
    },
    description: doc.description
      ? {
          en: doc.description.en ?? '',
          tr: doc.description.tr ?? '',
          fr: doc.description.fr ?? '',
          ar: doc.description.ar ?? '',
        }
      : null,
    kind: doc.kind,
    order: doc.order,
  };
}

export const Case: Model<CaseFields> =
  mongoose.models.Case ?? mongoose.model<CaseFields>('Case', caseSchema);
