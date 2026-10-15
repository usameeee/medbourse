import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { roleHasPermission, type UserRole } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { PaymentEvidence, toPublicPaymentEvidence } from '../models/PaymentEvidence.js';
import { Quotation, toPublicQuotation } from '../models/Quotation.js';
import { Case } from '../models/Case.js';
import { writeAudit } from '../services/assignment.js';
import { notifyCaseEvent } from '../services/notifications.js';
import { memoryUpload, persistPrivateFile } from '../services/privateUpload.js';
import { assertDocumentAccess, signDocumentAccess, signedContentPath } from '../services/signedUrls.js';
import { signCloudinaryUrl } from '../storage/cloudinary.js';
import { getObjectStorage } from '../storage/index.js';

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

const reviewBody = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().min(3).max(500).optional(),
});

function canAccessQuotation(
  auth: { role: UserRole; customerId: string | null },
  customerId: string,
): boolean {
  return roleHasPermission(auth.role, 'customer:read:staff') || auth.customerId === customerId;
}

const contentQuery = z.object({
  exp: z.string().min(1),
  sig: z.string().min(1),
});

export const quotationPaymentEvidenceRouter = Router();

quotationPaymentEvidenceRouter.post(
  '/:id/payment-evidence',
  requireAuth,
  requirePermission('case:read:self'),
  memoryUpload.single('file'),
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const quotation = await Quotation.findById(id).exec();
      if (!quotation) {
        throw new AppError(404, 'NOT_FOUND', 'Quotation not found');
      }
      if (!canAccessQuotation(req.auth!, quotation.customerId.toString())) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      const stored = await persistPrivateFile(req.file);
      const evidence = await PaymentEvidence.create({
        quotationId: quotation._id,
        customerId: quotation.customerId,
        status: 'submitted',
        originalFilename: stored.originalFilename,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        storageDriver: stored.storageDriver,
        resourceType: stored.resourceType,
        uploadedByUserId: new mongoose.Types.ObjectId(req.auth!.userId),
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'payment_evidence.submitted',
        entityType: 'PaymentEvidence',
        entityId: evidence._id.toString(),
        metadata: {
          quotationId: quotation._id.toString(),
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          amount: quotation.amount,
          currency: quotation.currency,
        },
      });
      const relatedCase = await Case.findOne({ quotationId: quotation._id }).exec();
      if (relatedCase) {
        await notifyCaseEvent({
          caseId: relatedCase._id,
          customerId: relatedCase.customerId,
          createdByUserId: relatedCase.createdByUserId,
          actorUserId: req.auth!.userId,
          target: 'staff',
          type: 'payment_evidence.submitted',
          metadata: {
            evidenceId: evidence._id.toString(),
            quotationId: quotation._id.toString(),
          },
        });
      }
      res.status(201).json({
        evidence: toPublicPaymentEvidence(evidence),
        quotation: toPublicQuotation(quotation),
      });
    } catch (err) {
      next(err);
    }
  },
);

quotationPaymentEvidenceRouter.get(
  '/:id/payment-evidence',
  requireAuth,
  requirePermission('case:read:self'),
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const quotation = await Quotation.findById(id).exec();
      if (!quotation) {
        throw new AppError(404, 'NOT_FOUND', 'Quotation not found');
      }
      if (!canAccessQuotation(req.auth!, quotation.customerId.toString())) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      const items = await PaymentEvidence.find({ quotationId: quotation._id }).sort({ createdAt: -1 }).exec();
      res.json({
        quotation: toPublicQuotation(quotation),
        data: items.map(toPublicPaymentEvidence),
      });
    } catch (err) {
      next(err);
    }
  },
);

export const paymentEvidenceRouter = Router();

paymentEvidenceRouter.get(
  '/:id/content',
  validate({ params: idParams, query: contentQuery }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const { exp, sig } = req.query as unknown as z.infer<typeof contentQuery>;
      assertDocumentAccess(id, exp, sig);
      const evidence = await PaymentEvidence.findById(id).exec();
      if (!evidence) {
        throw new AppError(404, 'NOT_FOUND', 'Payment evidence not found');
      }
      if (evidence.storageDriver === 'cloudinary') {
        throw new AppError(400, 'SIGNED_URL_ONLY', 'This receipt must be read from its Cloudinary signed URL');
      }
      const stored = await getObjectStorage().get(evidence.storageKey);
      res.setHeader('Content-Type', evidence.mimeType);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Disposition', 'attachment');
      res.send(stored.bytes);
    } catch (err) {
      next(err);
    }
  },
);

paymentEvidenceRouter.post(
  '/:id/review',
  requireAuth,
  requirePermission('payment:verify:staff'),
  validate({ params: idParams, body: reviewBody }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const body = req.body as z.infer<typeof reviewBody>;
      if (body.decision === 'rejected' && !body.note) {
        throw new AppError(400, 'REVIEW_NOTE_REQUIRED', 'A note is required when rejecting payment evidence');
      }
      const evidence = await PaymentEvidence.findById(id).exec();
      if (!evidence) {
        throw new AppError(404, 'NOT_FOUND', 'Payment evidence not found');
      }
      if (evidence.status !== 'submitted') {
        throw new AppError(409, 'ALREADY_REVIEWED', 'This receipt has already been reviewed');
      }
      evidence.status = body.decision;
      evidence.reviewNote = body.note ?? null;
      evidence.reviewedByUserId = new mongoose.Types.ObjectId(req.auth!.userId);
      evidence.reviewedAt = new Date();
      await evidence.save();
      const quotation = await Quotation.findById(evidence.quotationId).exec();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: `payment_evidence.${body.decision}`,
        entityType: 'PaymentEvidence',
        entityId: evidence._id.toString(),
        metadata: {
          quotationId: evidence.quotationId.toString(),
          amount: quotation?.amount ?? null,
          currency: quotation?.currency ?? null,
        },
      });
      const relatedCase = quotation
        ? await Case.findOne({ quotationId: quotation._id }).exec()
        : null;
      if (relatedCase) {
        await notifyCaseEvent({
          caseId: relatedCase._id,
          customerId: relatedCase.customerId,
          createdByUserId: relatedCase.createdByUserId,
          actorUserId: req.auth!.userId,
          target: 'customer',
          type:
            body.decision === 'approved'
              ? 'payment_evidence.approved'
              : 'payment_evidence.rejected',
          metadata: { evidenceId: evidence._id.toString(), decision: body.decision },
        });
      }
      res.json({
        evidence: toPublicPaymentEvidence(evidence),
        quotation: quotation ? toPublicQuotation(quotation) : null,
      });
    } catch (err) {
      next(err);
    }
  },
);

paymentEvidenceRouter.get(
  '/:id/signed-url',
  requireAuth,
  requirePermission('case:read:self'),
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const evidence = await PaymentEvidence.findById(id).exec();
      if (!evidence) {
        throw new AppError(404, 'NOT_FOUND', 'Payment evidence not found');
      }
      if (!canAccessQuotation(req.auth!, evidence.customerId.toString())) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }
      const expiresAtUnix = Math.floor(Date.now() / 1000) + 60;
      if (evidence.storageDriver === 'cloudinary') {
        const url = signCloudinaryUrl(evidence.storageKey, evidence.resourceType ?? 'raw', expiresAtUnix);
        res.json({ url, expiresAt: new Date(expiresAtUnix * 1000).toISOString() });
        return;
      }
      const { exp, sig } = signDocumentAccess(evidence._id.toString());
      res.json({
        url: signedContentPath('payment-evidence', evidence._id.toString(), exp, sig),
        expiresAt: new Date(exp * 1000).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);
