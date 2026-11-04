import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { PAGE_CONTENT_KEYS, SOCIAL_NETWORKS, type LocalizedText } from '@medbourse/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import {
  getSiteContentRecord,
  toPublicSiteContent,
  type PageContentFields,
} from '../models/SiteContent.js';
import { writeAudit } from '../services/assignment.js';

const localizedText = z.object({
  en: z.string().trim().max(2000),
  tr: z.string().trim().max(2000),
  fr: z.string().trim().max(2000),
  ar: z.string().trim().max(2000),
});

const socialBody = z.object({
  id: z.string().trim().max(64).optional(),
  network: z.enum(SOCIAL_NETWORKS),
  url: z.string().trim().min(1).max(500),
  order: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

const sectionBody = z.object({
  id: z.string().trim().max(64).optional(),
  title: localizedText,
  body: localizedText,
});

const pageBody = z.object({
  key: z.enum(PAGE_CONTENT_KEYS),
  isActive: z.boolean().optional(),
  eyebrow: localizedText.optional(),
  title: localizedText.optional(),
  lead: localizedText.optional(),
  updated: z.string().trim().max(40).optional(),
  sections: z.array(sectionBody).max(50).optional(),
});

const contentBody = z.object({
  social: z.array(socialBody).max(30).optional(),
  pages: z.array(pageBody).max(PAGE_CONTENT_KEYS.length).optional(),
});

function norm(value: LocalizedText | undefined): LocalizedText {
  return {
    en: value?.en ?? '',
    tr: value?.tr ?? '',
    fr: value?.fr ?? '',
    ar: value?.ar ?? '',
  };
}

export const siteContentRouter = Router();

/** Public: the active social accounts and page copy the site renders. */
siteContentRouter.get('/', async (_req, res, next) => {
  try {
    const record = await getSiteContentRecord();
    res.json(toPublicSiteContent(record, { activeOnly: true }));
  } catch (err) {
    next(err);
  }
});

/** Super Admin: every entry, including inactive and empty ones, for editing. */
siteContentRouter.get(
  '/all',
  requireAuth,
  requirePermission('site:manage:super_admin'),
  async (_req, res, next) => {
    try {
      const record = await getSiteContentRecord();
      res.json(toPublicSiteContent(record, { activeOnly: false }));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Super Admin: replaces the provided collections. Social is taken as a full list;
 * pages merge by key so editing one page never clears the others.
 */
siteContentRouter.put(
  '/',
  requireAuth,
  requirePermission('site:manage:super_admin'),
  validate({ body: contentBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof contentBody>;
      const record = await getSiteContentRecord();

      if (body.social !== undefined) {
        record.social = body.social.map((account, index) => ({
          id: account.id?.trim() || randomUUID(),
          network: account.network,
          url: account.url,
          order: account.order ?? index,
          isActive: account.isActive ?? true,
        }));
      }

      for (const incoming of body.pages ?? []) {
        const existing = record.pages.find((page) => page.key === incoming.key);
        const sections = incoming.sections?.map((section) => ({
          id: section.id?.trim() || randomUUID(),
          title: norm(section.title),
          body: norm(section.body),
        }));

        if (existing) {
          if (incoming.isActive !== undefined) existing.isActive = incoming.isActive;
          if (incoming.eyebrow) existing.eyebrow = norm(incoming.eyebrow);
          if (incoming.title) existing.title = norm(incoming.title);
          if (incoming.lead) existing.lead = norm(incoming.lead);
          if (incoming.updated !== undefined) existing.updated = incoming.updated;
          if (sections) existing.sections = sections;
        } else {
          const page: PageContentFields = {
            key: incoming.key,
            isActive: incoming.isActive ?? true,
            eyebrow: norm(incoming.eyebrow),
            title: norm(incoming.title),
            lead: norm(incoming.lead),
            updated: incoming.updated ?? '',
            sections: sections ?? [],
          };
          record.pages.push(page);
        }
      }

      await record.save();

      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'siteContent.updated',
        entityType: 'SiteContent',
        entityId: String(record._id),
        metadata: {
          social: body.social?.length,
          pages: body.pages?.map((page) => page.key),
        },
      });

      res.json(toPublicSiteContent(record, { activeOnly: false }));
    } catch (err) {
      next(err);
    }
  },
);
