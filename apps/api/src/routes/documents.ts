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
import { memoryUpload, persistPrivateFile } from '../services/privateUpload.js';
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
      const { kind } = req.query as unknown as z.infer<typeof kindQuery>;
      const item = await loadAuthorizedCase(id, req.auth!, 'documents');
      const stored = await persistPrivateFile(req.file);
      const doc = await CaseDocument.create({
        caseId: item._id,
        customerId: item.customerId,
        kind,
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
          kind,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
        },
      });
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
      res.setHeader('Content-Disposition', 'attachment');
      res.send(stored.bytes);
    } catch (err) {
      next(err);
    }
  },
);
