import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { DOCUMENT_KINDS } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { CaseDocument, toPublicCaseDocument } from '../models/CaseDocument.js';
import { writeAudit } from '../services/assignment.js';
import { loadAuthorizedCase } from '../services/caseAccess.js';
import { notifyCaseEvent } from '../services/notifications.js';
import { memoryUpload, persistPrivateFile, removePrivateFile } from '../services/privateUpload.js';
import { assertDocumentAccess, documentContentPath, signDocumentAccess } from '../services/signedUrls.js';
import { signCloudinaryUrl } from '../storage/cloudinary.js';
import { getObjectStorage } from '../storage/index.js';

const caseParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

const documentParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
  documentId: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid document'),
});

const contentParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

const contentQuery = z.object({
  exp: z.string().min(1),
  sig: z.string().min(1),
});

const kindQuery = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  /** The case checklist entry this upload satisfies; omitted for a free-form upload. */
  requirementId: z
    .string()
    .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid requirement')
    .optional(),
});

/** Admin verdict on one upload; a rejection must say what the customer has to fix. */
const reviewBody = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().min(3).max(500).optional(),
});

export const caseDocumentsRouter = Router();

caseDocumentsRouter.post(
  '/:id/documents',
  requireAuth,
  requirePermission('case:read:self'),
  memoryUpload.single('file'),
  validate({ params: caseParams, query: kindQuery }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof caseParams>;
      const { kind, requirementId } = req.query as unknown as z.infer<typeof kindQuery>;
      const item = await loadAuthorizedCase(id, req.auth!, 'documents');
      // A checklist upload must match a required document frozen onto this case.
      let effectiveKind = kind;
      let requirementObjectId: mongoose.Types.ObjectId | null = null;
      if (requirementId) {
        const required = item.requiredDocuments.find(
          (entry) => entry.requirementId.toString() === requirementId,
        );
        if (!required) {
          throw new AppError(400, 'INVALID_REQUIREMENT', 'This document is not required for the case');
        }
        effectiveKind = required.kind;
        requirementObjectId = new mongoose.Types.ObjectId(requirementId);
      }
      const stored = await persistPrivateFile(req.file);

      // A checklist entry holds exactly one file: when the customer sends another one for the
      // same requirement, the previous upload — including a rejected one that blocked the case —
      // is dropped so the customer sees "their" file and the admin reviews what was sent last.
      let replacedRejected = false;
      if (requirementObjectId) {
        const previous = await CaseDocument.find({
          caseId: item._id,
          requirementId: requirementObjectId,
        }).exec();
        replacedRejected = previous.some((entry) => entry.reviewStatus === 'rejected');
        await Promise.all(previous.map((entry) => removePrivateFile(entry)));
        if (previous.length > 0) {
          await CaseDocument.deleteMany({
            _id: { $in: previous.map((entry) => entry._id) },
          }).exec();
        }
      }

      const doc = await CaseDocument.create({
        caseId: item._id,
        customerId: item.customerId,
        kind: effectiveKind,
        requirementId: requirementObjectId,
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
        action: 'document.uploaded',
        entityType: 'CaseDocument',
        entityId: doc._id.toString(),
        metadata: {
          caseId: item._id.toString(),
          kind: effectiveKind,
          requirementId: requirementObjectId?.toString() ?? null,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          replacedRejected,
        },
      });
      // A re-upload after a rejection is what unblocks the case, so the assigned admins have to
      // know it landed. A first upload stays quiet — otherwise every intake step would ping them.
      if (replacedRejected) {
        await notifyCaseEvent({
          caseId: item._id,
          customerId: item.customerId,
          createdByUserId: item.createdByUserId,
          actorUserId: req.auth!.userId,
          target: 'admin',
          type: 'case.document_reuploaded',
          metadata: {
            documentId: doc._id.toString(),
            requirementId: requirementObjectId?.toString() ?? null,
            kind: effectiveKind,
            filename: stored.originalFilename,
          },
        });
      }
      res.status(201).json({ document: toPublicCaseDocument(doc) });
    } catch (err) {
      next(err);
    }
  },
);

caseDocumentsRouter.get(
  '/:id/documents',
  requireAuth,
  requirePermission('case:read:self'),
  validate({ params: caseParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof caseParams>;
      const item = await loadAuthorizedCase(id, req.auth!, 'documents');
      const docs = await CaseDocument.find({ caseId: item._id }).sort({ createdAt: -1 }).exec();
      res.json({ data: docs.map(toPublicCaseDocument) });
    } catch (err) {
      next(err);
    }
  },
);

caseDocumentsRouter.get(
  '/:id/documents/:documentId/signed-url',
  requireAuth,
  requirePermission('case:read:self'),
  validate({ params: documentParams }),
  async (req, res, next) => {
    try {
      const { id, documentId } = req.params as z.infer<typeof documentParams>;
      await loadAuthorizedCase(id, req.auth!, 'documents');
      const doc = await CaseDocument.findOne({
        _id: documentId,
        caseId: id,
      }).exec();
      if (!doc) {
        throw new AppError(404, 'NOT_FOUND', 'Document not found');
      }
      const expiresAtUnix = Math.floor(Date.now() / 1000) + 60;
      if (doc.storageDriver === 'cloudinary') {
        const url = signCloudinaryUrl(doc.storageKey, doc.resourceType ?? 'raw', expiresAtUnix);
        res.json({ url, expiresAt: new Date(expiresAtUnix * 1000).toISOString() });
        return;
      }
      const { exp, sig } = signDocumentAccess(doc._id.toString());
      res.json({
        url: documentContentPath(doc._id.toString(), exp, sig),
        expiresAt: new Date(exp * 1000).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Admin verdict on one uploaded document. Approving clears it; rejecting records why so the
 * customer knows what to fix and re-upload. Admins may re-review an already-reviewed upload
 * (a mistake should be correctable), and the first look moves the case into `in_review`.
 */
caseDocumentsRouter.patch(
  '/:id/documents/:documentId/review',
  requireAuth,
  requirePermission('document:review:admin'),
  validate({ params: documentParams, body: reviewBody }),
  async (req, res, next) => {
    try {
      const { id, documentId } = req.params as z.infer<typeof documentParams>;
      const { decision, note } = req.body as z.infer<typeof reviewBody>;
      if (decision === 'rejected' && !note) {
        throw new AppError(400, 'REVIEW_NOTE_REQUIRED', 'A note is required when rejecting a document');
      }
      const item = await loadAuthorizedCase(id, req.auth!, 'documents');
      const doc = await CaseDocument.findOne({ _id: documentId, caseId: item._id }).exec();
      if (!doc) {
        throw new AppError(404, 'NOT_FOUND', 'Document not found');
      }
      doc.reviewStatus = decision;
      doc.reviewNote = note ?? null;
      doc.reviewedByUserId = new mongoose.Types.ObjectId(req.auth!.userId);
      doc.reviewedAt = new Date();
      await doc.save();

      // The first time the admin looks at a submitted file it leaves the "awaiting" queue, but a
      // decision (accepted/rejected) is never overwritten by a single document review.
      if (item.reviewStatus === 'awaiting') {
        item.reviewStatus = 'in_review';
        await item.save();
      }

      await writeAudit({
        actorUserId: req.auth!.userId,
        action: `document.${decision}`,
        entityType: 'CaseDocument',
        entityId: doc._id.toString(),
        metadata: {
          caseId: item._id.toString(),
          requirementId: doc.requirementId?.toString() ?? null,
          decision,
        },
      });
      await notifyCaseEvent({
        caseId: item._id,
        customerId: item.customerId,
        createdByUserId: item.createdByUserId,
        actorUserId: req.auth!.userId,
        target: 'customer',
        type: decision === 'approved' ? 'case.document_approved' : 'case.document_rejected',
        metadata: {
          documentId: doc._id.toString(),
          kind: doc.kind,
          note: doc.reviewNote,
        },
      });
      res.json({ document: toPublicCaseDocument(doc) });
    } catch (err) {
      next(err);
    }
  },
);

export const documentContentRouter = Router();

documentContentRouter.get(
  '/:id/content',
  validate({ params: contentParams, query: contentQuery }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof contentParams>;
      const { exp, sig } = req.query as unknown as z.infer<typeof contentQuery>;
      assertDocumentAccess(id, exp, sig);
      const doc = await CaseDocument.findById(id).exec();
      if (!doc) {
        throw new AppError(404, 'NOT_FOUND', 'Document not found');
      }
      if (doc.storageDriver === 'cloudinary') {
        throw new AppError(400, 'SIGNED_URL_ONLY', 'This document must be read from its Cloudinary signed URL');
      }
      const stored = await getObjectStorage().get(doc.storageKey);
      res.setHeader('Content-Type', doc.mimeType);
      res.setHeader('Cache-Control', 'private, no-store');
      // Served inline so the portal can render a preview from the short-lived signed URL;
      // the MIME allow-list keeps this to PDF/JPEG/PNG/WebP.
      res.setHeader('Content-Disposition', 'inline');
      res.send(stored.bytes);
    } catch (err) {
      next(err);
    }
  },
);
