import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  CASE_STATUSES,
  SERVICE_CATEGORIES,
  WORKFLOW_STAGE_STATUSES,
  roleHasPermission,
  type ServiceCategory,
  type WorkflowStageStatus,
} from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { Case, toPublicCase, type CaseWorkflowSnapshotFields } from '../models/Case.js';
import { CaseDocument, toPublicCaseDocument, type CaseDocumentRecord } from '../models/CaseDocument.js';
import { Customer } from '../models/Customer.js';
import { Message, toPublicMessage } from '../models/Message.js';
import { Offering } from '../models/Offering.js';
import { PaymentAccount } from '../models/PaymentAccount.js';
import { PaymentEvidence, toPublicPaymentEvidence, type PaymentEvidenceDocument } from '../models/PaymentEvidence.js';
import { Quotation, toPublicQuotation } from '../models/Quotation.js';
import { User, type UserDocument } from '../models/User.js';
import {
  WorkflowTemplate,
  WorkflowTemplateVersion,
} from '../models/WorkflowTemplate.js';
import { countryCodeSchema } from '../validation/country.js';
import { resolveCountryAssignment, writeAudit } from '../services/assignment.js';
import { canReadCase, getAccessibleCustomerScope } from '../services/caseAccess.js';
import { buildRequiredDocuments, syncDraftCase } from '../services/draftConfig.js';
import { notifyCaseEvent } from '../services/notifications.js';
import { paymentAccountMatches, resolvePaymentAccounts } from '../services/paymentAccounts.js';
import { issueQuotation } from '../services/pricing.js';
import { closeCase, transitionStage } from '../services/workflow.js';

const createBody = z.object({
  customerId: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid customer'),
  offeringId: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid offering'),
  quotationId: z
    .string()
    .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid quotation')
    .optional(),
});

/**
 * The customer's own application: no `customerId` here — the caller is the customer.
 * Country and phone are collected because a self-registered account has no customer
 * record yet (see `POST /cases/apply`).
 */
const applyBody = z.object({
  offeringId: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid offering'),
  countryCode: countryCodeSchema,
  phone: z.string().trim().min(3).max(32).optional(),
  message: z.string().trim().min(1).max(2000).optional(),
});

/** Freezes the active workflow template for a category into the case's snapshot. */
async function buildWorkflowSnapshot(
  category: ServiceCategory,
): Promise<CaseWorkflowSnapshotFields | null> {
  const workflowTemplate = await WorkflowTemplate.findOne({ category, isActive: true }).exec();
  if (!workflowTemplate?.currentVersionId) {
    return null;
  }
  const version = await WorkflowTemplateVersion.findById(workflowTemplate.currentVersionId).exec();
  if (!version) {
    return null;
  }
  return {
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

/** Best available human name for a self-registered account, falling back to the address. */
function customerFullName(user: UserDocument): string {
  const composed = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return (user.displayName?.trim() || composed || user.email).slice(0, 120);
}

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

/** The rail the customer pays through; `null` clears the choice. */
const paymentAccountBody = z.object({
  paymentAccountId: z
    .string()
    .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid payment account')
    .nullable(),
});

/** Admin verdict on the whole file; a rejection must say why. */
const caseReviewBody = z.object({
  decision: z.enum(['accepted', 'rejected']),
  note: z.string().trim().min(3).max(800).optional(),
});

export const casesRouter = Router();

/**
 * An admin opens a case on the customer's behalf — the office/walk-in intake. It is created as a
 * draft so whoever completes it (the linked customer, or the admin who opened it)
 * uploads the same checklist, picks the receiving rail, attaches the receipt, and submits;
 * only then does it reach the admin queues (see `/:id/submit`).
 */
casesRouter.post(
  '/',
  requireAuth,
  requirePermission('case:create:admin'),
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
      let quotation: Awaited<ReturnType<typeof issueQuotation>> | null = null;
      if (body.quotationId) {
        const existing = await Quotation.findById(body.quotationId).exec();
        if (!existing) {
          throw new AppError(400, 'INVALID_QUOTATION', 'Quotation does not exist');
        }
        if (
          existing.customerId.toString() !== customer._id.toString() ||
          existing.offeringId.toString() !== offering._id.toString()
        ) {
          throw new AppError(400, 'QUOTATION_MISMATCH', 'Quotation does not match this customer and offering');
        }
        quotation = existing;
      } else {
        // The quotation is frozen right away (against the customer's own country) so the
        // intake shows the exact amount and where to pay from the first screen. A service
        // that has no general price yet still opens and asks for the team instead.
        try {
          quotation = await issueQuotation({
            customerId: customer._id.toString(),
            offeringId: offering._id.toString(),
            actorUserId: req.auth!.userId,
          });
        } catch (err) {
          if (!(err instanceof AppError) || err.code !== 'NO_PRICE') {
            throw err;
          }
        }
      }
      // Default the receiving rail to the best account for the customer's country and the
      // quoted currency; the person completing the draft can switch it before submitting.
      const defaultAccount = quotation
        ? ((await resolvePaymentAccounts({
            countryCode: customer.countryCode,
            currency: quotation.currency,
          }))[0] ?? null)
        : null;
      const item = await Case.create({
        customerId: customer._id,
        offeringId: offering._id,
        quotationId: quotation?._id ?? null,
        status: 'open',
        category: offering.category,
        offeringTitle: offering.title.en,
        workflow: await buildWorkflowSnapshot(offering.category),
        requiredDocuments: await buildRequiredDocuments(offering),
        paymentAccountId: defaultAccount?._id ?? null,
        paymentMethod: defaultAccount?.method ?? null,
        submittedAt: null,
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
          quotationId: quotation?._id.toString() ?? null,
          onBehalf: true,
        },
      });
      // No admin notification yet: the draft stays out of the queues until it is submitted
      // with every document and the payment receipt attached.
      res.status(201).json({ case: toPublicCase(item) });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Self-service intake: a signed-in customer opens their own case from a catalog
 * offering. The first application also materialises the `Customer` row (a
 * self-registered account has none), resolving the country-based manager so the
 * case lands in someone's queue instead of nowhere.
 */
casesRouter.post(
  '/apply',
  requireAuth,
  requirePermission('case:create:self'),
  validate({ body: applyBody }),
  async (req, res, next) => {
    try {
      const { offeringId, countryCode, phone, message } = req.body as z.infer<typeof applyBody>;
      const offering = await Offering.findById(offeringId).exec();
      if (!offering || !offering.isActive) {
        throw new AppError(400, 'INVALID_OFFERING', 'Offering is missing or inactive');
      }
      const user = await User.findById(req.auth!.userId).exec();
      if (!user) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
      }

      let customer = user.customerId ? await Customer.findById(user.customerId).exec() : null;
      if (!customer) {
        const assignment = await resolveCountryAssignment(countryCode);
        customer = await Customer.create({
          fullName: customerFullName(user),
          email: user.email,
          phone: phone ?? null,
          countryCode,
          assignedManagerUserId: assignment.assignedManagerUserId,
          assignmentStatus: assignment.assignmentStatus,
          assignmentSource: assignment.assignmentSource,
          createdByUserId: user._id,
        });
        user.customerId = customer._id;
        await user.save();
        await writeAudit({
          actorUserId: user._id.toString(),
          action: 'customer.self_registered',
          entityType: 'Customer',
          entityId: customer._id.toString(),
          metadata: {
            countryCode: customer.countryCode,
            assignmentStatus: customer.assignmentStatus,
            assignedManagerUserId: customer.assignedManagerUserId?.toString() ?? null,
          },
        });
      }

      // The self-service application opens as a draft. The quotation is frozen right
      // away (against the country the applicant chose) so the wizard can show the exact
      // amount, currency, and receiving account while the file is still being completed.
      // It is handed to the admin only once the customer submits it (see `/:id/submit`).
      // A service that has no general price yet cannot be quoted; the draft still opens
      // and the wizard asks the customer to contact the team instead of failing outright.
      let quotation: Awaited<ReturnType<typeof issueQuotation>> | null = null;
      try {
        quotation = await issueQuotation({
          customerId: customer._id.toString(),
          offeringId: offering._id.toString(),
          actorUserId: user._id.toString(),
          countryCode,
        });
      } catch (err) {
        if (!(err instanceof AppError) || err.code !== 'NO_PRICE') {
          throw err;
        }
      }
      // Default the receiving rail to the best account for the applicant's country and
      // the quoted currency — a country-specific account beats the global default, then
      // the lower priority. The customer can switch it from the wizard before submitting.
      const defaultAccount = quotation
        ? ((await resolvePaymentAccounts({ countryCode, currency: quotation.currency }))[0] ?? null)
        : null;
      const item = await Case.create({
        customerId: customer._id,
        offeringId: offering._id,
        quotationId: quotation?._id ?? null,
        status: 'open',
        category: offering.category,
        offeringTitle: offering.title.en,
        workflow: await buildWorkflowSnapshot(offering.category),
        requiredDocuments: await buildRequiredDocuments(offering),
        paymentAccountId: defaultAccount?._id ?? null,
        paymentMethod: defaultAccount?.method ?? null,
        submittedAt: null,
        createdByUserId: user._id,
      });
      if (message) {
        await Message.create({
          caseId: item._id,
          authorUserId: user._id,
          authorRole: user.role,
          body: message,
        });
      }
      await writeAudit({
        actorUserId: user._id.toString(),
        action: 'case.created',
        entityType: 'Case',
        entityId: item._id.toString(),
        metadata: {
          customerId: customer._id.toString(),
          offeringId: offering._id.toString(),
          quotationId: quotation?._id.toString() ?? null,
          selfService: true,
          draft: true,
        },
      });
      // No admin notification yet: the draft stays out of the queues until the
      // customer submits it with all documents and the payment receipt attached.
      res.status(201).json({ case: toPublicCase(item) });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Records which receiving rail the customer pays through. The account must serve the
 * quoted currency and the customer's country, so a case can never point at a rail it
 * could not actually be paid into. Admins may set it on the files they opened on the
 * customer's behalf.
 */
casesRouter.patch(
  '/:id/payment-account',
  requireAuth,
  requireAnyPermission('case:create:self', 'case:create:admin'),
  validate({ params: idParams, body: paymentAccountBody }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const { paymentAccountId } = req.body as z.infer<typeof paymentAccountBody>;
      const item = await Case.findById(id).exec();
      if (!item) {
        throw new AppError(404, 'NOT_FOUND', 'Case not found');
      }
      const isOwner = req.auth!.customerId === item.customerId.toString();
      if (!isOwner && !roleHasPermission(req.auth!.role, 'case:create:admin')) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      if (item.submittedAt) {
        throw new AppError(409, 'ALREADY_SUBMITTED', 'This application has already been submitted');
      }
      if (paymentAccountId === null) {
        item.paymentAccountId = null;
        item.paymentMethod = null;
      } else {
        const account = await PaymentAccount.findById(paymentAccountId).exec();
        const quotation = item.quotationId
          ? await Quotation.findById(item.quotationId).exec()
          : null;
        if (
          !account ||
          !quotation ||
          !paymentAccountMatches(account, quotation.snapshot.customerCountryCode, quotation.currency)
        ) {
          throw new AppError(
            400,
            'INVALID_PAYMENT_ACCOUNT',
            'That payment account does not serve this application',
          );
        }
        item.paymentAccountId = account._id;
        item.paymentMethod = account.method;
      }
      await item.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'case.payment_account_selected',
        entityType: 'Case',
        entityId: item._id.toString(),
        metadata: {
          paymentAccountId: item.paymentAccountId?.toString() ?? null,
          paymentMethod: item.paymentMethod,
        },
      });
      res.json({ case: toPublicCase(item) });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Hands a finished application over to the admin. It may only be submitted once every required
 * document is uploaded and the payment receipt has been attached; until then the case stays
 * a draft. The customer submits their own, and an admin submits the draft they opened on the
 * customer's behalf.
 */
casesRouter.post(
  '/:id/submit',
  requireAuth,
  requireAnyPermission('case:create:self', 'case:create:admin'),
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const item = await Case.findById(id).exec();
      if (!item) {
        throw new AppError(404, 'NOT_FOUND', 'Case not found');
      }
      const isOwner = req.auth!.customerId === item.customerId.toString();
      if (!isOwner && !roleHasPermission(req.auth!.role, 'case:create:admin')) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      if (item.submittedAt) {
        throw new AppError(409, 'ALREADY_SUBMITTED', 'This application has already been submitted');
      }
      // Re-align the draft before judging it, so a document the team added while the file was
      // being filled is still required before it can be handed over (FU-T41).
      await syncDraftCase(item);
      const uploads = await CaseDocument.find({
        caseId: item._id,
        requirementId: { $ne: null },
      }).exec();
      const satisfied = new Set(uploads.map((doc) => doc.requirementId!.toString()));
      const missing = item.requiredDocuments.filter(
        (req) => !satisfied.has(req.requirementId.toString()),
      );
      if (missing.length > 0) {
        throw new AppError(
          400,
          'REQUIRED_DOCUMENTS_MISSING',
          'Upload every required document before submitting',
          { missing: missing.map((req) => req.requirementId.toString()) },
        );
      }
      if (!item.quotationId) {
        throw new AppError(400, 'NO_QUOTATION', 'A quotation is required before submitting');
      }
      // The file is only complete once the customer has a rail to pay into, and that rail
      // must still serve the quoted currency and the customer's country.
      if (!item.paymentAccountId) {
        throw new AppError(
          400,
          'PAYMENT_ACCOUNT_REQUIRED',
          'Choose how you will pay before submitting',
        );
      }
      const quotation = await Quotation.findById(item.quotationId).exec();
      const account = await PaymentAccount.findById(item.paymentAccountId).exec();
      if (
        !quotation ||
        !account ||
        !paymentAccountMatches(account, quotation.snapshot.customerCountryCode, quotation.currency)
      ) {
        throw new AppError(
          400,
          'INVALID_PAYMENT_ACCOUNT',
          'The selected payment account no longer serves this application',
        );
      }
      const evidenceCount = await PaymentEvidence.countDocuments({ quotationId: item.quotationId });
      if (evidenceCount === 0) {
        throw new AppError(
          400,
          'PAYMENT_EVIDENCE_REQUIRED',
          'Upload the payment receipt before submitting',
        );
      }
      item.submittedAt = new Date();
      await item.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'case.submitted',
        entityType: 'Case',
        entityId: item._id.toString(),
        metadata: {
          customerId: item.customerId.toString(),
          quotationId: item.quotationId.toString(),
          requiredDocuments: item.requiredDocuments.length,
        },
      });
      await notifyCaseEvent({
        caseId: item._id,
        customerId: item.customerId,
        createdByUserId: item.createdByUserId,
        actorUserId: req.auth!.userId,
        target: 'admin',
        type: 'case.created',
        metadata: {
          offeringId: item.offeringId.toString(),
          category: item.category,
          submittedAt: item.submittedAt.toISOString(),
        },
      });
      res.json({ case: toPublicCase(item) });
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
      // A draft stays out of the admin queues until it is handed over, so a queue only ever
      // sees completed files. The exception is a file an admin opened on the customer's
      // behalf: they must still find their own unfinished drafts in order to complete them.
      // Super Admin oversees every file, drafts included.
      if (req.auth!.role === 'admin') {
        const mine = new mongoose.Types.ObjectId(req.auth!.userId);
        filter.$or = [{ submittedAt: { $ne: null } }, { createdByUserId: mine }];
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
      // An unfinished draft is read through the team's current configuration: a document
      // added, a price changed, or a rail opened since it was created shows up here (FU-T41).
      await syncDraftCase(item);
      const documents = await CaseDocument.find({ caseId: item._id })
        .sort({ createdAt: -1 })
        .exec();
      let quotation = null;
      let evidenceDocs: PaymentEvidenceDocument[] = [];
      if (item.quotationId) {
        const quoted = await Quotation.findById(item.quotationId).exec();
        if (quoted) {
          quotation = toPublicQuotation(quoted);
          evidenceDocs = await PaymentEvidence.find({ quotationId: quoted._id })
            .sort({ createdAt: -1 })
            .exec();
        }
      }
      // The file detail view names who signed each item off, so resolve every reviewer once.
      const reviewerIds = new Set<string>();
      for (const doc of documents) {
        if (doc.reviewedByUserId) reviewerIds.add(doc.reviewedByUserId.toString());
      }
      for (const ev of evidenceDocs) {
        if (ev.reviewedByUserId) reviewerIds.add(ev.reviewedByUserId.toString());
      }
      const reviewers = reviewerIds.size
        ? await User.find({ _id: { $in: [...reviewerIds] } }).exec()
        : [];
      const reviewerName = new Map(
        reviewers.map((user) => [user._id.toString(), user.displayName ?? user.email]),
      );
      const nameFor = (reviewedByUserId: mongoose.Types.ObjectId | null): string | null =>
        reviewedByUserId ? (reviewerName.get(reviewedByUserId.toString()) ?? null) : null;
      res.json({
        case: toPublicCase(item),
        documents: documents.map((doc) => ({
          ...toPublicCaseDocument(doc),
          reviewedByName: nameFor(doc.reviewedByUserId),
        })),
        quotation,
        paymentEvidence: evidenceDocs.map((ev) => ({
          ...toPublicPaymentEvidence(ev),
          reviewedByName: nameFor(ev.reviewedByUserId),
        })),
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
        target: req.auth!.role === 'customer' ? 'admin' : 'customer',
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
  requirePermission('case:workflow:admin'),
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
  requirePermission('case:workflow:admin'),
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

/**
 * Admin decision on a submitted file. Accepting is gated so a case can never be approved on
 * an unchecked file: every required document must have an approved upload and the payment
 * receipt must be approved too. Rejecting requires a note explaining what to fix.
 */
casesRouter.patch(
  '/:id/review',
  requireAuth,
  requirePermission('case:workflow:admin'),
  validate({ params: idParams, body: caseReviewBody }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const { decision, note } = req.body as z.infer<typeof caseReviewBody>;
      const item = await Case.findById(id).exec();
      if (!item) {
        throw new AppError(404, 'NOT_FOUND', 'Case not found');
      }
      if (!(await canReadCase(req.auth!, item.customerId.toString()))) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      if (!item.submittedAt) {
        throw new AppError(409, 'NOT_SUBMITTED', 'This application has not been submitted yet');
      }
      if (item.status === 'closed') {
        throw new AppError(409, 'CASE_ALREADY_CLOSED', 'Case is already closed');
      }
      if (decision === 'rejected' && !note) {
        throw new AppError(400, 'REVIEW_NOTE_REQUIRED', 'A note is required when rejecting a case');
      }
      if (decision === 'accepted') {
        // For every checklist entry, only the newest upload counts — a re-upload after a
        // rejection replaces the earlier one, so an old approval never masks a fresh file.
        const uploads = await CaseDocument.find({
          caseId: item._id,
          requirementId: { $ne: null },
        }).exec();
        const latestByRequirement = new Map<string, CaseDocumentRecord>();
        for (const upload of uploads) {
          const key = upload.requirementId!.toString();
          const current = latestByRequirement.get(key);
          if (!current || upload.createdAt > current.createdAt) {
            latestByRequirement.set(key, upload);
          }
        }
        const pending = item.requiredDocuments.filter((req) => {
          const latest = latestByRequirement.get(req.requirementId.toString());
          return !latest || latest.reviewStatus !== 'approved';
        });
        if (pending.length > 0) {
          throw new AppError(
            400,
            'REQUIRED_DOCUMENTS_NOT_APPROVED',
            'Every required document must be approved before accepting the case',
            { pending: pending.map((req) => req.requirementId.toString()) },
          );
        }
        if (!item.quotationId) {
          throw new AppError(400, 'NO_QUOTATION', 'A quotation is required before accepting the case');
        }
        const approvedPayments = await PaymentEvidence.countDocuments({
          quotationId: item.quotationId,
          status: 'approved',
        });
        if (approvedPayments === 0) {
          throw new AppError(
            400,
            'PAYMENT_NOT_APPROVED',
            'Approve the payment receipt before accepting the case',
          );
        }
      }
      item.reviewStatus = decision;
      item.reviewNote = note ?? null;
      item.reviewedByUserId = new mongoose.Types.ObjectId(req.auth!.userId);
      item.reviewedAt = new Date();
      if (decision === 'accepted') {
        // Accepting the hand-over closes the case in one step, so the file never lingers
        // as "open" after the admin has signed it off.
        item.status = 'closed';
      }
      await item.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: decision === 'accepted' ? 'case.accepted' : 'case.rejected',
        entityType: 'Case',
        entityId: item._id.toString(),
        metadata: { note: item.reviewNote },
      });
      await notifyCaseEvent({
        caseId: item._id,
        customerId: item.customerId,
        createdByUserId: item.createdByUserId,
        actorUserId: req.auth!.userId,
        target: 'customer',
        type: decision === 'accepted' ? 'case.accepted' : 'case.rejected',
        metadata: { decision, note: item.reviewNote },
      });
      res.json({ case: toPublicCase(item) });
    } catch (err) {
      next(err);
    }
  },
);
