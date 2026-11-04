import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { Media, mediaPublicUrl, toPublicMedia } from '../models/Media.js';
import { writeAudit } from '../services/assignment.js';
import { persistPublicImage, publicImageUpload } from '../services/publicMedia.js';
import { getObjectStorage } from '../storage/index.js';

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

export const mediaRouter = Router();

/** Any signed-in user may upload their own profile photo; marketing media stays Super Admin only. */
mediaRouter.post(
  '/avatar',
  requireAuth,
  publicImageUpload.single('file'),
  async (req, res, next) => {
    try {
      const stored = await persistPublicImage(req.file);
      const media = await Media.create({
        storageKey: stored.storageKey,
        storageDriver: stored.storageDriver,
        publicUrl: stored.publicUrl,
        originalFilename: stored.originalFilename,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        uploadedByUserId: new mongoose.Types.ObjectId(req.auth!.userId),
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'media.avatar_uploaded',
        entityType: 'Media',
        entityId: media._id.toString(),
        metadata: { mimeType: stored.mimeType, sizeBytes: stored.sizeBytes },
      });
      res.status(201).json({ media: toPublicMedia(media) });
    } catch (err) {
      next(err);
    }
  },
);

mediaRouter.post(
  '/',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  publicImageUpload.single('file'),
  async (req, res, next) => {
    try {
      const stored = await persistPublicImage(req.file);
      const media = await Media.create({
        storageKey: stored.storageKey,
        storageDriver: stored.storageDriver,
        publicUrl: stored.publicUrl,
        originalFilename: stored.originalFilename,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        uploadedByUserId: new mongoose.Types.ObjectId(req.auth!.userId),
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'media.uploaded',
        entityType: 'Media',
        entityId: media._id.toString(),
        metadata: { mimeType: stored.mimeType, sizeBytes: stored.sizeBytes },
      });
      res.status(201).json({ media: toPublicMedia(media) });
    } catch (err) {
      next(err);
    }
  },
);

// Public read for marketing images; the bytes are not sensitive, so they are
// served unauthenticated with a long-lived immutable cache.
mediaRouter.get('/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    const media = await Media.findById(id).exec();
    if (!media) {
      throw new AppError(404, 'NOT_FOUND', 'Media not found');
    }
    if (media.storageDriver === 'cloudinary') {
      res.redirect(302, mediaPublicUrl(media));
      return;
    }
    const stored = await getObjectStorage().get(media.storageKey);
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(stored.bytes);
  } catch (err) {
    next(err);
  }
});
