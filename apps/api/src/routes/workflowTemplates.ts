import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { SERVICE_CATEGORIES } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import {
  WorkflowTemplate,
  WorkflowTemplateVersion,
  toPublicWorkflowTemplate,
  toPublicWorkflowTemplateVersion,
  type WorkflowStageFields,
} from '../models/WorkflowTemplate.js';
import { writeAudit } from '../services/assignment.js';

const stageSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(800).optional(),
  order: z.number().int().min(0),
  optional: z.boolean().optional(),
});

const createBody = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(800).optional(),
  category: z.enum(SERVICE_CATEGORIES),
  isActive: z.boolean().optional(),
  stages: z.array(stageSchema).min(1),
});

const updateBody = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(800).optional().nullable(),
  isActive: z.boolean().optional(),
});

const versionBody = z.object({
  stages: z.array(stageSchema).min(1),
});

const listQuery = z.object({
  category: z.enum(SERVICE_CATEGORIES).optional(),
});

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

const versionParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
  versionNumber: z.coerce.number().int().min(1),
});

function normalizeStages(input: z.infer<typeof stageSchema>[]): WorkflowStageFields[] {
  const seen = new Set<string>();
  const stages = input.map((s) => {
    if (seen.has(s.id)) {
      throw new AppError(400, 'DUPLICATE_STAGE_ID', `Duplicate stage id: ${s.id}`);
    }
    seen.add(s.id);
    return {
      id: s.id,
      name: s.name.trim(),
      description: s.description?.trim() ?? null,
      order: s.order,
      optional: s.optional ?? false,
    };
  });
  stages.sort((a, b) => a.order - b.order);
  return stages;
}

export const workflowTemplatesRouter = Router();

workflowTemplatesRouter.get(
  '/',
  requireAuth,
  requirePermission('workflow:manage:super_admin'),
  validate({ query: listQuery }),
  async (req, res, next) => {
    try {
      const { category } = req.query as unknown as z.infer<typeof listQuery>;
      const filter: Record<string, unknown> = {};
      if (category) {
        filter.category = category;
      }
      const templates = await WorkflowTemplate.find(filter).sort({ createdAt: -1 }).exec();
      res.json({ data: templates.map(toPublicWorkflowTemplate) });
    } catch (err) {
      next(err);
    }
  },
);

workflowTemplatesRouter.post(
  '/',
  requireAuth,
  requirePermission('workflow:manage:super_admin'),
  validate({ body: createBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createBody>;
      const stages = normalizeStages(body.stages);
      const template = await WorkflowTemplate.create({
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        category: body.category,
        isActive: body.isActive ?? true,
        currentVersionNumber: 0,
      });
      const version = await WorkflowTemplateVersion.create({
        templateId: template._id,
        versionNumber: 1,
        stages,
        createdByUserId: new mongoose.Types.ObjectId(req.auth!.userId),
      });
      template.currentVersionId = version._id;
      template.currentVersionNumber = 1;
      await template.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'workflow_template.created',
        entityType: 'WorkflowTemplate',
        entityId: template._id.toString(),
        metadata: { category: template.category, version: 1, stageCount: stages.length },
      });
      res.status(201).json({
        template: toPublicWorkflowTemplate(template),
        version: toPublicWorkflowTemplateVersion(version),
      });
    } catch (err) {
      next(err);
    }
  },
);

workflowTemplatesRouter.get(
  '/:id',
  requireAuth,
  requirePermission('workflow:manage:super_admin'),
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const template = await WorkflowTemplate.findById(id).exec();
      if (!template) {
        throw new AppError(404, 'NOT_FOUND', 'Workflow template not found');
      }
      const version = template.currentVersionId
        ? await WorkflowTemplateVersion.findById(template.currentVersionId).exec()
        : null;
      res.json({
        template: toPublicWorkflowTemplate(template),
        version: version ? toPublicWorkflowTemplateVersion(version) : null,
      });
    } catch (err) {
      next(err);
    }
  },
);

workflowTemplatesRouter.patch(
  '/:id',
  requireAuth,
  requirePermission('workflow:manage:super_admin'),
  validate({ params: idParams, body: updateBody }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const body = req.body as z.infer<typeof updateBody>;
      const template = await WorkflowTemplate.findById(id).exec();
      if (!template) {
        throw new AppError(404, 'NOT_FOUND', 'Workflow template not found');
      }
      if (body.name !== undefined) {
        template.name = body.name.trim();
      }
      if (body.description !== undefined) {
        template.description = body.description?.trim() ?? null;
      }
      if (body.isActive !== undefined) {
        template.isActive = body.isActive;
      }
      await template.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'workflow_template.updated',
        entityType: 'WorkflowTemplate',
        entityId: template._id.toString(),
        metadata: { fields: Object.keys(body) },
      });
      res.json({ template: toPublicWorkflowTemplate(template) });
    } catch (err) {
      next(err);
    }
  },
);

workflowTemplatesRouter.get(
  '/:id/versions',
  requireAuth,
  requirePermission('workflow:manage:super_admin'),
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const template = await WorkflowTemplate.findById(id).exec();
      if (!template) {
        throw new AppError(404, 'NOT_FOUND', 'Workflow template not found');
      }
      const versions = await WorkflowTemplateVersion.find({ templateId: template._id })
        .sort({ versionNumber: -1 })
        .exec();
      res.json({ data: versions.map(toPublicWorkflowTemplateVersion) });
    } catch (err) {
      next(err);
    }
  },
);

workflowTemplatesRouter.post(
  '/:id/versions',
  requireAuth,
  requirePermission('workflow:manage:super_admin'),
  validate({ params: idParams, body: versionBody }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const body = req.body as z.infer<typeof versionBody>;
      const template = await WorkflowTemplate.findById(id).exec();
      if (!template) {
        throw new AppError(404, 'NOT_FOUND', 'Workflow template not found');
      }
      const stages = normalizeStages(body.stages);
      const nextVersion = template.currentVersionNumber + 1;
      const version = await WorkflowTemplateVersion.create({
        templateId: template._id,
        versionNumber: nextVersion,
        stages,
        createdByUserId: new mongoose.Types.ObjectId(req.auth!.userId),
      });
      template.currentVersionId = version._id;
      template.currentVersionNumber = nextVersion;
      await template.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'workflow_template.version_created',
        entityType: 'WorkflowTemplate',
        entityId: template._id.toString(),
        metadata: { version: nextVersion, stageCount: stages.length },
      });
      res.status(201).json({
        template: toPublicWorkflowTemplate(template),
        version: toPublicWorkflowTemplateVersion(version),
      });
    } catch (err) {
      next(err);
    }
  },
);

workflowTemplatesRouter.get(
  '/:id/versions/:versionNumber',
  requireAuth,
  requirePermission('workflow:manage:super_admin'),
  validate({ params: versionParams }),
  async (req, res, next) => {
    try {
      const { id, versionNumber } = req.params as unknown as z.infer<typeof versionParams>;
      const template = await WorkflowTemplate.findById(id).exec();
      if (!template) {
        throw new AppError(404, 'NOT_FOUND', 'Workflow template not found');
      }
      const version = await WorkflowTemplateVersion.findOne({
        templateId: template._id,
        versionNumber,
      }).exec();
      if (!version) {
        throw new AppError(404, 'NOT_FOUND', 'Workflow template version not found');
      }
      res.json({ version: toPublicWorkflowTemplateVersion(version) });
    } catch (err) {
      next(err);
    }
  },
);
