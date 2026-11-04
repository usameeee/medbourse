import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { DOCUMENT_KINDS } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import {
  DocumentRequirement,
  toPublicDocumentRequirement,
} from '../models/DocumentRequirement.js';
import { writeAudit } from '../services/assignment.js';

const keySchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .min(2)
  .max(60);

/** Localized payloads carry all four locales; only `en` is mandatory so it can back frozen snapshots. */
const localizedField = (max: number) =>
  z.object({
    en: z.string().trim().max(max),
    tr: z.string().trim().max(max),
    fr: z.string().trim().max(max),
    ar: z.string().trim().max(max),
  });

const requiredLocalized = (max: number) =>
  localizedField(max).extend({ en: z.string().trim().min(1).max(max) });

const requirementBody = z.object({
  key: keySchema,
  title: requiredLocalized(160),
  description: localizedField(800).nullable().optional(),
  kind: z.enum(DOCUMENT_KINDS),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const requirementPatch = requirementBody.partial();

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

/** The document library is a Super Admin asset: defined once and reused by every service. */
export const documentRequirementsRouter = Router();

const libraryManagers = requirePermission('document:manage:super_admin');

documentRequirementsRouter.get('/', requireAuth, libraryManagers, async (_req, res, next) => {
  try {
    const items = await DocumentRequirement.find({}).sort({ order: 1, key: 1 }).exec();
    res.json({ data: items.map(toPublicDocumentRequirement) });
  } catch (err) {
    next(err);
  }
});

documentRequirementsRouter.post(
  '/',
  requireAuth,
  libraryManagers,
  validate({ body: requirementBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof requirementBody>;
      const clash = await DocumentRequirement.findOne({ key: body.key }).exec();
      if (clash) {
        throw new AppError(409, 'DOCUMENT_KEY_IN_USE', 'A document with this key already exists');
      }
      const item = await DocumentRequirement.create({
        key: body.key,
        title: body.title,
        description: body.description ?? null,
        kind: body.kind,
        order: body.order ?? 0,
        isActive: body.isActive ?? true,
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'document_requirement.created',
        entityType: 'DocumentRequirement',
        entityId: item._id.toString(),
        metadata: { key: item.key, kind: item.kind },
      });
      res.status(201).json({ requirement: toPublicDocumentRequirement(item) });
    } catch (err) {
      next(err);
    }
  },
);

documentRequirementsRouter.patch(
  '/:id',
  requireAuth,
  libraryManagers,
  validate({ params: idParams, body: requirementPatch }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const body = req.body as z.infer<typeof requirementPatch>;
      const item = await DocumentRequirement.findById(id).exec();
      if (!item) {
        throw new AppError(404, 'NOT_FOUND', 'Document requirement not found');
      }
      if (body.key && body.key !== item.key) {
        const clash = await DocumentRequirement.findOne({ key: body.key }).exec();
        if (clash) {
          throw new AppError(409, 'DOCUMENT_KEY_IN_USE', 'A document with this key already exists');
        }
        item.key = body.key;
      }
      if (body.title !== undefined) {
        item.title = body.title;
      }
      if (body.description !== undefined) {
        item.description = body.description;
      }
      if (body.kind !== undefined) {
        item.kind = body.kind;
      }
      if (body.order !== undefined) {
        item.order = body.order;
      }
      if (body.isActive !== undefined) {
        item.isActive = body.isActive;
      }
      await item.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'document_requirement.updated',
        entityType: 'DocumentRequirement',
        entityId: item._id.toString(),
        metadata: { key: item.key, kind: item.kind },
      });
      res.json({ requirement: toPublicDocumentRequirement(item) });
    } catch (err) {
      next(err);
    }
  },
);
