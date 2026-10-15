import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import {
  CASE_STATUSES,
  WORKFLOW_STAGE_STATUSES,
  type CaseStatus,
  type CaseWorkflowSnapshot,
  type CaseWorkflowStage,
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

export interface CaseFields {
  customerId: mongoose.Types.ObjectId;
  offeringId: mongoose.Types.ObjectId;
  quotationId: mongoose.Types.ObjectId | null;
  status: CaseStatus;
  category: ServiceCategory;
  offeringTitle: string;
  workflow: CaseWorkflowSnapshotFields | null;
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

const caseSchema = new mongoose.Schema<CaseFields>(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    offeringId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offering', required: true },
    quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', default: null },
    status: { type: String, enum: CASE_STATUSES, default: 'open' },
    category: { type: String, required: true },
    offeringTitle: { type: String, required: true, trim: true, maxlength: 160 },
    workflow: { type: caseWorkflowSnapshotSchema, default: null },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

caseSchema.index({ customerId: 1, createdAt: -1 });

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
    createdAt: doc.createdAt.toISOString(),
  };
}

export const Case: Model<CaseFields> =
  mongoose.models.Case ?? mongoose.model<CaseFields>('Case', caseSchema);
