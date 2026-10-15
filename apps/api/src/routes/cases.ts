import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  CASE_STATUSES,
  SERVICE_CATEGORIES,
  WORKFLOW_STAGE_STATUSES,
  type WorkflowStageStatus,
} from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { Case, toPublicCase, type CaseWorkflowSnapshotFields } from '../models/Case.js';
import { CaseDocument, toPublicCaseDocument } from '../models/CaseDocument.js';
import { Customer } from '../models/Customer.js';
import { Message, toPublicMessage } from '../models/Message.js';
import { Offering } from '../models/Offering.js';
import { PaymentEvidence, toPublicPaymentEvidence } from '../models/PaymentEvidence.js';
import { Quotation, toPublicQuotation } from '../models/Quotation.js';
import {
  WorkflowTemplate,
  WorkflowTemplateVersion,
} from '../models/WorkflowTemplate.js';
import { writeAudit } from '../services/assignment.js';
import { canReadCase, getAccessibleCustomerScope } from '../services/caseAccess.js';
import { notifyCaseEvent } from '../services/notifications.js';
import { closeCase, transitionStage } from '../services/workflow.js';

const createBody = z.object({
  customerId: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid customer'),
  offeringId: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid offering'),
  quotationId: z
    .string()
    .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid quotation')
    .optional(),
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  customerId: z.string().optional(),
  status: z.enum(CASE_STATUSES as unknown as [string, ...string[]]).optional(),
  category: z.enum(SERVICE_CATEGORIES as unknown as [string, ...string[]]).optional(),
});

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

const stageParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
  stageId: z.string().min(1).max(64),
});

const stageTransitionBody = z.object({
  status: z.enum(WORKFLOW_STAGE_STATUSES as unknown as [string, ...string[]]),
});

const messageBody = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const casesRouter = Router();

casesRouter.post(
  '/',
  requireAuth,
  requirePermission('case:create:staff'),
  validate({ body: createBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createBody>;
      const customer = await Customer.findById(body.customerId).exec();
      if (!customer) {
        throw new AppError(404, 'NOT_FOUND', 'Customer not found');
      }
      const offering = await Offering.findById(body.offeringId).exec();
      if (!offering || !offering.isActive) {
        throw new AppError(400, 'INVALID_OFFERING', 'Offering is missing or inactive');
      }
      let quotationId: mongoose.Types.ObjectId | null = null;
      if (body.quotationId) {
        const quotation = await Quotation.findById(body.quotationId).exec();
        if (!quotation) {
          throw new AppError(400, 'INVALID_QUOTATION', 'Quotation does not exist');
        }
        if (
          quotation.customerId.toString() !== customer._id.toString() ||
          quotation.offeringId.toString() !== offering._id.toString()
        ) {
          throw new AppError(400, 'QUOTATION_MISMATCH', 'Quotation does not match this customer and offering');
        }
        quotationId = quotation._id;
      }
      let workflow: CaseWorkflowSnapshotFields | null = null;
      const workflowTemplate = await WorkflowTemplate.findOne({
        category: offering.category,
        isActive: true,
      }).exec();
      if (workflowTemplate && workflowTemplate.currentVersionId) {
        const version = await WorkflowTemplateVersion.findById(
          workflowTemplate.currentVersionId,
        ).exec();
        if (version) {
          workflow = {
            templateId: workflowTemplate._id,
            versionNumber: version.versionNumber,
            stages: version.stages.map((stage) => ({
              id: stage.id,
              name: stage.name,
              description: stage.description,
              order: stage.order,
              optional: stage.optional,
              status: 'pending',
            })),
          };
        }
      }
      const item = await Case.create({
        customerId: customer._id,
        offeringId: offering._id,
        quotationId,
        status: 'open',
        category: offering.category,
        offeringTitle: offering.title,
        workflow,
        createdByUserId: new mongoose.Types.ObjectId(req.auth!.userId),
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'case.created',
        entityType: 'Case',
        entityId: item._id.toString(),
        metadata: {
          customerId: customer._id.toString(),
          offeringId: offering._id.toString(),
          quotationId: quotationId?.toString() ?? null,
        },
      });
      res.status(201).json({ case: toPublicCase(item) });
    } catch (err) {
      next(err);
    }
  },
);

casesRouter.get(
  '/',
  requireAuth,
  requirePermission('case:read:self'),
  validate({ query: listQuery }),
  async (req, res, next) => {
    try {
      const { page, limit, customerId, status, category } =
        req.query as unknown as z.infer<typeof listQuery>;
      const scope = await getAccessibleCustomerScope(req.auth!);
      const filter: Record<string, unknown> = {};
      if (scope.type === 'all') {
        if (customerId) {
          if (!mongoose.Types.ObjectId.isValid(customerId)) {
            throw new AppError(400, 'INVALID_CUSTOMER', 'Customer id is not valid');
          }
          filter.customerId = customerId;
        }
      } else {
        if (scope.customerIds.length === 0) {
          res.json({ data: [], meta: { page, limit, total: 0 } });
          return;
        }
        if (customerId) {
          if (!mongoose.Types.ObjectId.isValid(customerId)) {
            throw new AppError(400, 'INVALID_CUSTOMER', 'Customer id is not valid');
          }
          filter.customerId = { $in: [customerId] };
          const requested = new mongoose.Types.ObjectId(customerId);
          const inScope = scope.customerIds.some((id) => id.equals(requested));
          if (!inScope) {
            res.json({ data: [], meta: { page, limit, total: 0 } });
            return;
          }
        } else {
          filter.customerId = { $in: scope.customerIds };
        }
      }
      if (status) {
        filter.status = status;
      }
      if (category) {
        filter.category = category;
      }
      const [total, items] = await Promise.all([
        Case.countDocuments(filter),
        Case.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .exec(),
      ]);
      res.json({
        data: items.map(toPublicCase),
        meta: { page, limit, total },
      });
    } catch (err) {
      next(err);
    }
  },
);

casesRouter.get(
  '/:id',
  requireAuth,
  requirePermission('case:read:self'),
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const item = await Case.findById(id).exec();
      if (!item) {
        throw new AppError(404, 'NOT_FOUND', 'Case not found');
      }
      if (!(await canReadCase(req.auth!, item.customerId.toString()))) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      const documents = await CaseDocument.find({ caseId: item._id })
        .sort({ createdAt: -1 })
        .exec();
      let quotation = null;
      let paymentEvidence: unknown[] = [];
      if (item.quotationId) {
        const quoted = await Quotation.findById(item.quotationId).exec();
        if (quoted) {
          quotation = toPublicQuotation(quoted);
          const evidence = await PaymentEvidence.find({ quotationId: quoted._id })
            .sort({ createdAt: -1 })
            .exec();
          paymentEvidence = evidence.map(toPublicPaymentEvidence);
        }
      }
      res.json({
        case: toPublicCase(item),
        documents: documents.map(toPublicCaseDocument),
        quotation,
        paymentEvidence,
      });
    } catch (err) {
      next(err);
    }
  },
);

casesRouter.get(
  '/:id/messages',
  requireAuth,
  requirePermission('case:message:self'),
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const item = await Case.findById(id).exec();
      if (!item) {
        throw new AppError(404, 'NOT_FOUND', 'Case not found');
      }
      if (!(await canReadCase(req.auth!, item.customerId.toString()))) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      const messages = await Message.find({ caseId: item._id })
        .sort({ createdAt: 1, _id: 1 })
        .exec();
      res.json({ data: messages.map(toPublicMessage) });
    } catch (err) {
      next(err);
    }
  },
);

casesRouter.post(
  '/:id/messages',
  requireAuth,
  requirePermission('case:message:self'),
  validate({ params: idParams, body: messageBody }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const { body } = req.body as z.infer<typeof messageBody>;
      const item = await Case.findById(id).exec();
      if (!item) {
        throw new AppError(404, 'NOT_FOUND', 'Case not found');
      }
      if (!(await canReadCase(req.auth!, item.customerId.toString()))) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      const message = await Message.create({
        caseId: item._id,
        authorUserId: new mongoose.Types.ObjectId(req.auth!.userId),
        authorRole: req.auth!.role,
        body,
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'case.message_created',
        entityType: 'Case',
        entityId: item._id.toString(),
        metadata: { messageId: message._id.toString() },
      });
      await notifyCaseEvent({
        caseId: item._id,
        customerId: item.customerId,
        createdByUserId: item.createdByUserId,
        actorUserId: req.auth!.userId,
        target: req.auth!.role === 'customer' ? 'staff' : 'customer',
        type: 'case.message_created',
        metadata: { messageId: message._id.toString(), authorRole: req.auth!.role },
      });
      res.status(201).json({ message: toPublicMessage(message) });
    } catch (err) {
      next(err);
    }
  },
);

casesRouter.patch(
  '/:id/workflow/stages/:stageId',
  requireAuth,
  requirePermission('case:workflow:staff'),
  validate({ params: stageParams, body: stageTransitionBody }),
  async (req, res, next) => {
    try {
      const { id, stageId } = req.params as unknown as z.infer<typeof stageParams>;
      const { status } = req.body as z.infer<typeof stageTransitionBody>;
      const result = await transitionStage({
        caseId: id,
        stageId,
        targetStatus: status as WorkflowStageStatus,
        actorUserId: req.auth!.userId,
      });
      res.json({ stage: result.stage, previousStatus: result.previousStatus });
    } catch (err) {
      next(err);
    }
  },
);

casesRouter.patch(
  '/:id/close',
  requireAuth,
  requirePermission('case:workflow:staff'),
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as unknown as z.infer<typeof idParams>;
      const closed = await closeCase({
        caseId: id,
        actorUserId: req.auth!.userId,
      });
      res.json({ case: toPublicCase(closed) });
    } catch (err) {
      next(err);
    }
  },
);
