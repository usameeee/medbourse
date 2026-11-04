import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  DEFAULT_FOCAL_POINT,
  SERVICE_CATEGORIES,
  SHOWCASE_SCENE_MAX_FRAMES,
  emptyLocalizedText,
  type LocalizedText,
  type ServiceCategory,
} from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { Media, mediaPublicUrl } from '../models/Media.js';
import {
  ShowcaseSlide,
  showcaseMediaIds,
  toPublicShowcaseSlide,
  type ShowcaseFrameFields,
  type ShowcaseSlideRecord,
} from '../models/ShowcaseSlide.js';
import { writeAudit } from '../services/assignment.js';

const localizedText = z.object({
  en: z.string().trim().max(400),
  tr: z.string().trim().max(400),
  fr: z.string().trim().max(400),
  ar: z.string().trim().max(400),
});

const requiredLocalized = localizedText.extend({ en: z.string().trim().min(1).max(400) });

const focalPoint = z.number().min(0).max(100);

const frameBody = z.object({
  mediaId: z
    .string()
    .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid media')
    .nullable(),
  focalX: focalPoint.optional(),
  focalY: focalPoint.optional(),
});

const slideBody = z.object({
  mediaId: z
    .string()
    .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid media')
    .nullable()
    .optional(),
  frames: z.array(frameBody).max(SHOWCASE_SCENE_MAX_FRAMES).optional(),
  category: z.enum(SERVICE_CATEGORIES).nullable().optional(),
  order: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
  name: localizedText.optional(),
  eyebrow: localizedText.optional(),
  headline: requiredLocalized,
  narrative: requiredLocalized,
  altText: localizedText.optional(),
});

const slidePatch = slideBody.partial();

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

const GUARANTEE_PATTERN = /guarante|garanti|garantit|يضمن/i;

function assertNoGuaranteeCopy(...texts: Array<LocalizedText | undefined>) {
  const joined = texts
    .filter((value): value is LocalizedText => Boolean(value))
    .flatMap((value) => [value.en, value.tr, value.fr, value.ar])
    .join(' ');
  if (GUARANTEE_PATTERN.test(joined)) {
    throw new AppError(
      400,
      'GUARANTEE_LANGUAGE',
      'Showcase copy must not promise admission, visa, or clinical results',
    );
  }
}

/**
 * Ordering is scoped per category: each category (and the uncategorised bucket)
 * owns its own sequence, so `order: 1` may exist once in every category.
 */
async function assertOrderAvailable(
  category: ServiceCategory | null,
  order: number,
  excludeId?: string,
): Promise<void> {
  const filter: Record<string, unknown> = { category, order };
  if (excludeId) {
    filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
  }
  const clash = await ShowcaseSlide.findOne(filter).exec();
  if (clash) {
    throw new AppError(
      409,
      'ORDER_TAKEN',
      'Another slide already uses this order in the same category',
    );
  }
}

/** Next free position in a category, used when the admin does not pick one. */
async function nextOrderFor(category: ServiceCategory | null): Promise<number> {
  const last = await ShowcaseSlide.findOne({ category }).sort({ order: -1 }).exec();
  return last ? Math.min(last.order + 1, 999) : 0;
}

async function imageUrlsFor(slides: ShowcaseSlideRecord[]): Promise<Map<string, string>> {
  const ids = slides.flatMap((slide) => showcaseMediaIds(slide));
  if (ids.length === 0) {
    return new Map();
  }
  const medias = await Media.find({ _id: { $in: ids } }).exec();
  return new Map(medias.map((media) => [media._id.toString(), mediaPublicUrl(media)]));
}

/** Validates each frame's media and normalises the focal point, dropping empty frames. */
async function resolveFrames(
  frames: Array<{ mediaId: string | null; focalX?: number; focalY?: number }>,
): Promise<ShowcaseFrameFields[]> {
  const resolved: ShowcaseFrameFields[] = [];
  for (const frame of frames) {
    if (!frame.mediaId) {
      continue;
    }
    const media = await Media.findById(frame.mediaId).exec();
    if (!media) {
      throw new AppError(400, 'INVALID_MEDIA', 'Media does not exist');
    }
    resolved.push({
      mediaId: media._id,
      focalX: frame.focalX ?? DEFAULT_FOCAL_POINT,
      focalY: frame.focalY ?? DEFAULT_FOCAL_POINT,
    });
  }
  return resolved;
}

function serialize(slide: ShowcaseSlideRecord, urls: Map<string, string>) {
  return toPublicShowcaseSlide(slide, urls);
}

export const showcaseRouter = Router();

showcaseRouter.get('/', async (_req, res, next) => {
  try {
    const slides = await ShowcaseSlide.find({ isActive: true })
      .sort({ category: 1, order: 1, _id: 1 })
      .exec();
    const urls = await imageUrlsFor(slides);
    res.json({ data: slides.map((slide) => serialize(slide, urls)) });
  } catch (err) {
    next(err);
  }
});

showcaseRouter.get(
  '/all',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  async (_req, res, next) => {
    try {
      const slides = await ShowcaseSlide.find({})
        .sort({ category: 1, order: 1, _id: 1 })
        .exec();
      const urls = await imageUrlsFor(slides);
      res.json({ data: slides.map((slide) => serialize(slide, urls)) });
    } catch (err) {
      next(err);
    }
  },
);

showcaseRouter.post(
  '/',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  validate({ body: slideBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof slideBody>;
      assertNoGuaranteeCopy(body.name, body.eyebrow, body.headline, body.narrative);

      let legacyMediaId: mongoose.Types.ObjectId | null = null;
      if (body.mediaId) {
        const media = await Media.findById(body.mediaId).exec();
        if (!media) {
          throw new AppError(400, 'INVALID_MEDIA', 'Media does not exist');
        }
        legacyMediaId = media._id;
      }

      const frames = await resolveFrames(body.frames ?? []);

      const category = body.category ?? null;
      const order = body.order ?? (await nextOrderFor(category));
      if (body.order !== undefined) {
        await assertOrderAvailable(category, order);
      }

      const slide = await ShowcaseSlide.create({
        order,
        isActive: body.isActive ?? true,
        category,
        // The first frame doubles as the legacy single image for non-hero banners.
        mediaId: frames[0]?.mediaId ?? legacyMediaId,
        frames,
        name: body.name ?? emptyLocalizedText(),
        eyebrow: body.eyebrow ?? emptyLocalizedText(),
        headline: body.headline,
        narrative: body.narrative,
        altText: body.altText ?? emptyLocalizedText(),
      });

      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'showcase.created',
        entityType: 'ShowcaseSlide',
        entityId: slide._id.toString(),
        metadata: { order: slide.order, category: slide.category },
      });

      const urls = await imageUrlsFor([slide]);
      res.status(201).json({ slide: serialize(slide, urls) });
    } catch (err) {
      next(err);
    }
  },
);

showcaseRouter.patch(
  '/:id',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  validate({ params: idParams, body: slidePatch }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const slide = await ShowcaseSlide.findById(id).exec();
      if (!slide) {
        throw new AppError(404, 'NOT_FOUND', 'Showcase slide not found');
      }
      const body = req.body as z.infer<typeof slidePatch>;
      assertNoGuaranteeCopy(body.name, body.eyebrow, body.headline, body.narrative);

      const movingCategory = body.category !== undefined && body.category !== slide.category;
      // Moving a slide to another category appends it there unless an order is given.
      const nextCategory = body.category !== undefined ? body.category : slide.category;
      const nextOrder =
        body.order ??
        (movingCategory ? await nextOrderFor(nextCategory) : slide.order);
      if (body.order !== undefined || movingCategory) {
        await assertOrderAvailable(nextCategory, nextOrder, id);
      }

      if (body.mediaId !== undefined) {
        if (body.mediaId === null) {
          slide.mediaId = null;
        } else {
          const media = await Media.findById(body.mediaId).exec();
          if (!media) {
            throw new AppError(400, 'INVALID_MEDIA', 'Media does not exist');
          }
          slide.mediaId = media._id;
        }
      }
      if (body.category !== undefined) {
        slide.category = body.category;
      }
      if (body.order !== undefined || movingCategory) {
        slide.order = nextOrder;
      }
      if (body.isActive !== undefined) {
        slide.isActive = body.isActive;
      }
      if (body.eyebrow !== undefined) {
        slide.eyebrow = body.eyebrow;
      }
      if (body.headline !== undefined) {
        slide.headline = body.headline;
      }
      if (body.narrative !== undefined) {
        slide.narrative = body.narrative;
      }
      if (body.altText !== undefined) {
        slide.altText = body.altText;
      }
      if (body.frames !== undefined) {
        const frames = await resolveFrames(body.frames);
        slide.frames = frames;
        // Keep the legacy single image in step with the first frame.
        slide.mediaId = frames[0]?.mediaId ?? null;
      }
      if (body.name !== undefined) {
        slide.name = body.name;
      }

      await slide.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'showcase.updated',
        entityType: 'ShowcaseSlide',
        entityId: slide._id.toString(),
        metadata: body as Record<string, unknown>,
      });

      const urls = await imageUrlsFor([slide]);
      res.json({ slide: serialize(slide, urls) });
    } catch (err) {
      next(err);
    }
  },
);

showcaseRouter.delete(
  '/:id',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  validate({ params: idParams }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const slide = await ShowcaseSlide.findById(id).exec();
      if (!slide) {
        throw new AppError(404, 'NOT_FOUND', 'Showcase slide not found');
      }
      await slide.deleteOne();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'showcase.deleted',
        entityType: 'ShowcaseSlide',
        entityId: id,
        metadata: {},
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
