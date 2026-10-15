import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type {
  PublicWorkflowTemplate,
  PublicWorkflowTemplateVersion,
  ServiceCategory,
  WorkflowStageDefinition,
} from '@medbourse/shared';
import { SERVICE_CATEGORIES } from '@medbourse/shared';

export interface WorkflowStageFields {
  id: string;
  name: string;
  description: string | null;
  order: number;
  optional: boolean;
}

export interface WorkflowTemplateVersionFields {
  templateId: mongoose.Types.ObjectId;
  versionNumber: number;
  stages: WorkflowStageFields[];
  createdByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
}

export type WorkflowTemplateVersionDocument = HydratedDocument<WorkflowTemplateVersionFields>;

const workflowStageSchema = new mongoose.Schema<WorkflowStageFields>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: null, trim: true, maxlength: 800 },
    order: { type: Number, required: true, min: 0 },
    optional: { type: Boolean, default: false },
  },
  { _id: false },
);

const workflowTemplateVersionSchema = new mongoose.Schema<WorkflowTemplateVersionFields>(
  {
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkflowTemplate',
      required: true,
    },
    versionNumber: { type: Number, required: true, min: 1 },
    stages: { type: [workflowStageSchema], required: true, default: [] },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

workflowTemplateVersionSchema.index({ templateId: 1, versionNumber: 1 }, { unique: true });

export function toStageDefinition(stage: WorkflowStageFields): WorkflowStageDefinition {
  return {
    id: stage.id,
    name: stage.name,
    description: stage.description,
    order: stage.order,
    optional: stage.optional,
  };
}

export function toPublicWorkflowTemplateVersion(
  doc: WorkflowTemplateVersionDocument,
): PublicWorkflowTemplateVersion {
  return {
    id: doc._id.toString(),
    templateId: doc.templateId.toString(),
    versionNumber: doc.versionNumber,
    stages: doc.stages.map(toStageDefinition),
    createdByUserId: doc.createdByUserId.toString(),
    createdAt: doc.createdAt.toISOString(),
  };
}

export const WorkflowTemplateVersion: Model<WorkflowTemplateVersionFields> =
  mongoose.models.WorkflowTemplateVersion ??
  mongoose.model<WorkflowTemplateVersionFields>('WorkflowTemplateVersion', workflowTemplateVersionSchema);

export interface WorkflowTemplateFields {
  name: string;
  description: string | null;
  category: ServiceCategory;
  isActive: boolean;
  currentVersionId: mongoose.Types.ObjectId | null;
  currentVersionNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkflowTemplateDocument = HydratedDocument<WorkflowTemplateFields>;

const workflowTemplateSchema = new mongoose.Schema<WorkflowTemplateFields>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: null, trim: true, maxlength: 800 },
    category: { type: String, required: true, enum: SERVICE_CATEGORIES },
    isActive: { type: Boolean, default: true },
    currentVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkflowTemplateVersion',
      default: null,
    },
    currentVersionNumber: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

workflowTemplateSchema.index({ category: 1, isActive: 1 });
workflowTemplateSchema.index({ name: 1, category: 1 }, { unique: true });

export function toPublicWorkflowTemplate(doc: WorkflowTemplateDocument): PublicWorkflowTemplate {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description,
    category: doc.category,
    isActive: doc.isActive,
    currentVersionNumber: doc.currentVersionNumber,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const WorkflowTemplate: Model<WorkflowTemplateFields> =
  mongoose.models.WorkflowTemplate ??
  mongoose.model<WorkflowTemplateFields>('WorkflowTemplate', workflowTemplateSchema);
