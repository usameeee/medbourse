import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  SERVICE_CATEGORIES,
  type LocalizedText,
  type ServiceCategory,
} from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { optionalAuth } from '../middleware/optionalAuth.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { City, toPublicCity } from '../models/City.js';
import { DocumentRequirement } from '../models/DocumentRequirement.js';
import { Media, mediaUrlsForIds } from '../models/Media.js';
import { Offering, toPublicOffering } from '../models/Offering.js';
import { Provider, toPublicProvider } from '../models/Provider.js';
import { writeAudit } from '../services/assignment.js';
import { countryCodeSchema } from '../validation/country.js';

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .min(2)
  .max(60);

const mediaIdField = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid media')
  .nullable();

/** Validates that a referenced media row exists; `null`/`undefined` clears the image. */
async function resolveMediaId(
  value: string | null | undefined,
): Promise<mongoose.Types.ObjectId | null> {
  if (!value) {
    return null;
  }
  const media = await Media.findById(value).exec();
  if (!media) {
    throw new AppError(400, 'INVALID_MEDIA', 'Media does not exist');
  }
  return media._id;
}

const cityBody = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(80),
  countryCode: countryCodeSchema,
  isActive: z.boolean().optional(),
});

const cityPatch = cityBody.partial();

const providerBody = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.enum(SERVICE_CATEGORIES),
  cityId: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid city'),
  website: z.string().trim().url().max(300).optional(),
  logoMediaId: mediaIdField.optional(),
  coverMediaId: mediaIdField.optional(),
  isActive: z.boolean().optional(),
  partnershipVerified: z.boolean().optional(),
});

const providerPatch = providerBody.partial();

const idParams = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid id'),
});

/** Validates that every referenced library document exists; returns the deduplicated ids. */
async function resolveRequiredDocumentIds(
  value: string[] | undefined,
): Promise<mongoose.Types.ObjectId[]> {
  if (!value || value.length === 0) {
    return [];
  }
  const unique = [...new Set(value)];
  const found = await DocumentRequirement.find({ _id: { $in: unique } }).exec();
  if (found.length !== unique.length) {
    throw new AppError(400, 'INVALID_DOCUMENT_REQUIREMENT', 'One or more documents do not exist');
  }
  return found.map((doc) => doc._id);
}

const listQuery = z.object({
  includeInactive: z.enum(['true', 'false']).optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  providerId: z.string().optional(),
  cityId: z.string().optional(),
});

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

const offeringBody = z.object({
  slug: slugSchema,
  title: requiredLocalized(160),
  summary: requiredLocalized(800),
  requirementsSummary: localizedField(800).nullable().optional(),
  /** Library documents a customer must provide; chosen from the Super Admin document library. */
  requiredDocumentIds: z
    .array(z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid document'))
    .max(50)
    .optional(),
  /** Optional: an offering may stand alone with no partner provider. */
  providerId: z
    .string()
    .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid provider')
    .nullable()
    .optional(),
  /** Required only when no provider is set (otherwise derived from the provider). */
  category: z.enum(SERVICE_CATEGORIES).optional(),
  cityId: z
    .string()
    .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid city')
    .optional(),
  logoMediaId: mediaIdField.optional(),
  coverMediaId: mediaIdField.optional(),
  isActive: z.boolean().optional(),
});

const offeringPatch = offeringBody.partial();

const GUARANTEE_PATTERN = /guarante|garanti|garantit|يضمن/i;

function assertNoGuaranteeCopy(...texts: Array<LocalizedText | null | undefined>) {
  const joined = texts
    .filter((value): value is LocalizedText => Boolean(value))
    .flatMap((value) => [value.en, value.tr, value.fr, value.ar])
    .join(' ');
  if (GUARANTEE_PATTERN.test(joined)) {
    throw new AppError(
      400,
      'GUARANTEE_LANGUAGE',
      'Offerings must not promise admission, visa, or clinical results',
    );
  }
}

export const catalogRouter = Router();

function showInactive(query: { includeInactive?: string }, isSuperAdmin: boolean) {
  return isSuperAdmin && query.includeInactive === 'true';
}

catalogRouter.get('/cities', optionalAuth, validate({ query: listQuery }), async (req, res, next) => {
  try {
    const isSuperAdmin = req.auth?.role === 'super_admin';
    const { includeInactive } = req.query as { includeInactive?: string };
    const filter = showInactive({ includeInactive }, isSuperAdmin) ? {} : { isActive: true };
    const cities = await City.find(filter).sort({ name: 1 }).exec();
    res.json({ data: cities.map(toPublicCity) });
  } catch (err) {
    next(err);
  }
});

catalogRouter.post(
  '/cities',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  validate({ body: cityBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof cityBody>;
      const existing = await City.findOne({ slug: body.slug }).exec();
      if (existing) {
        throw new AppError(409, 'CITY_SLUG_IN_USE', 'A city with this slug already exists');
      }
      const city = await City.create({
        slug: body.slug,
        name: body.name,
        countryCode: body.countryCode,
        isActive: body.isActive ?? true,
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'city.created',
        entityType: 'City',
        entityId: city._id.toString(),
        metadata: { slug: city.slug },
      });
      res.status(201).json({ city: toPublicCity(city) });
    } catch (err) {
      next(err);
    }
  },
);

catalogRouter.patch(
  '/cities/:id',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  validate({ params: idParams, body: cityPatch }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const city = await City.findById(id).exec();
      if (!city) {
        throw new AppError(404, 'NOT_FOUND', 'City not found');
      }
      const body = req.body as z.infer<typeof cityPatch>;
      if (body.slug && body.slug !== city.slug) {
        const clash = await City.findOne({ slug: body.slug }).exec();
        if (clash) {
          throw new AppError(409, 'CITY_SLUG_IN_USE', 'A city with this slug already exists');
        }
      }
      Object.assign(city, body);
      await city.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'city.updated',
        entityType: 'City',
        entityId: city._id.toString(),
        metadata: body,
      });
      res.json({ city: toPublicCity(city) });
    } catch (err) {
      next(err);
    }
  },
);

catalogRouter.get('/providers', optionalAuth, validate({ query: listQuery }), async (req, res, next) => {
  try {
    const isSuperAdmin = req.auth?.role === 'super_admin';
    const { includeInactive, category } = req.query as { includeInactive?: string; category?: ServiceCategory };
    const filter: Record<string, unknown> = showInactive({ includeInactive }, isSuperAdmin)
      ? {}
      : { isActive: true };
    if (category) {
      filter.category = category;
    }
    const providers = await Provider.find(filter).sort({ name: 1 }).exec();
    const urls = await mediaUrlsForIds([
      ...providers.map((provider) => provider.logoMediaId),
      ...providers.map((provider) => provider.coverMediaId),
    ]);
    res.json({ data: providers.map((provider) => toPublicProvider(provider, urls)) });
  } catch (err) {
    next(err);
  }
});

catalogRouter.post(
  '/providers',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  validate({ body: providerBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof providerBody>;
      const city = await City.findById(body.cityId).exec();
      if (!city) {
        throw new AppError(400, 'INVALID_CITY', 'City does not exist');
      }
      const provider = await Provider.create({
        name: body.name,
        category: body.category,
        cityId: city._id,
        countryCode: city.countryCode,
        website: body.website ?? null,
        logoMediaId: await resolveMediaId(body.logoMediaId),
        coverMediaId: await resolveMediaId(body.coverMediaId),
        isActive: body.isActive ?? true,
        partnershipVerified: body.partnershipVerified ?? false,
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'provider.created',
        entityType: 'Provider',
        entityId: provider._id.toString(),
        metadata: { name: provider.name, partnershipVerified: provider.partnershipVerified },
      });
      const urls = await mediaUrlsForIds([provider.logoMediaId, provider.coverMediaId]);
      res.status(201).json({ provider: toPublicProvider(provider, urls) });
    } catch (err) {
      next(err);
    }
  },
);

catalogRouter.patch(
  '/providers/:id',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  validate({ params: idParams, body: providerPatch }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const provider = await Provider.findById(id).exec();
      if (!provider) {
        throw new AppError(404, 'NOT_FOUND', 'Provider not found');
      }
      const body = req.body as z.infer<typeof providerPatch>;
      if (body.cityId) {
        const city = await City.findById(body.cityId).exec();
        if (!city) {
          throw new AppError(400, 'INVALID_CITY', 'City does not exist');
        }
        provider.cityId = city._id;
        provider.countryCode = city.countryCode;
      }
      if (body.name !== undefined) {
        provider.name = body.name;
      }
      if (body.category !== undefined) {
        provider.category = body.category;
      }
      if (body.website !== undefined) {
        provider.website = body.website;
      }
      if (body.isActive !== undefined) {
        provider.isActive = body.isActive;
      }
      if (body.partnershipVerified !== undefined) {
        provider.partnershipVerified = body.partnershipVerified;
      }
      if (body.logoMediaId !== undefined) {
        provider.logoMediaId = await resolveMediaId(body.logoMediaId);
      }
      if (body.coverMediaId !== undefined) {
        provider.coverMediaId = await resolveMediaId(body.coverMediaId);
      }
      await provider.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'provider.updated',
        entityType: 'Provider',
        entityId: provider._id.toString(),
        metadata: body,
      });
      const urls = await mediaUrlsForIds([provider.logoMediaId, provider.coverMediaId]);
      res.json({ provider: toPublicProvider(provider, urls) });
    } catch (err) {
      next(err);
    }
  },
);

catalogRouter.get('/offerings', optionalAuth, validate({ query: listQuery }), async (req, res, next) => {
  try {
    const isSuperAdmin = req.auth?.role === 'super_admin';
    const query = req.query as z.infer<typeof listQuery>;
    const filter: Record<string, unknown> = {};
    if (!showInactive(query, isSuperAdmin)) {
      filter.isActive = true;
    }
    if (query.category) {
      filter.category = query.category;
    }
    if (query.providerId && mongoose.Types.ObjectId.isValid(query.providerId)) {
      filter.providerId = query.providerId;
    }
    if (query.cityId && mongoose.Types.ObjectId.isValid(query.cityId)) {
      filter.cityId = query.cityId;
    }
    const offerings = await Offering.find(filter).sort({ 'title.en': 1 }).exec();
    const urls = await mediaUrlsForIds([
      ...offerings.map((offering) => offering.logoMediaId),
      ...offerings.map((offering) => offering.coverMediaId),
    ]);
    res.json({ data: offerings.map((offering) => toPublicOffering(offering, urls)) });
  } catch (err) {
    next(err);
  }
});

catalogRouter.post(
  '/offerings',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  validate({ body: offeringBody }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof offeringBody>;
      assertNoGuaranteeCopy(body.title, body.summary, body.requirementsSummary);

      let providerId: mongoose.Types.ObjectId | null = null;
      let category: ServiceCategory;
      let cityId: mongoose.Types.ObjectId;
      let countryCode: string;
      if (body.providerId) {
        const provider = await Provider.findById(body.providerId).exec();
        if (!provider || !provider.isActive) {
          throw new AppError(400, 'INVALID_PROVIDER', 'Provider does not exist or is inactive');
        }
        providerId = provider._id;
        category = provider.category;
        cityId = provider.cityId;
        countryCode = provider.countryCode;
      } else {
        if (!body.category) {
          throw new AppError(400, 'CATEGORY_REQUIRED', 'A category is required when no provider is set');
        }
        if (!body.cityId) {
          throw new AppError(400, 'CITY_REQUIRED', 'A city is required when no provider is set');
        }
        const city = await City.findById(body.cityId).exec();
        if (!city) {
          throw new AppError(400, 'INVALID_CITY', 'City does not exist');
        }
        category = body.category;
        cityId = city._id;
        countryCode = city.countryCode;
      }

      const slugTaken = await Offering.findOne({ slug: body.slug }).exec();
      if (slugTaken) {
        throw new AppError(409, 'OFFERING_SLUG_IN_USE', 'An offering with this slug already exists');
      }
      const offering = await Offering.create({
        slug: body.slug,
        title: body.title,
        summary: body.summary,
        requirementsSummary: body.requirementsSummary ?? null,
        requiredDocumentIds: await resolveRequiredDocumentIds(body.requiredDocumentIds),
        category,
        providerId,
        cityId,
        countryCode,
        logoMediaId: await resolveMediaId(body.logoMediaId),
        coverMediaId: await resolveMediaId(body.coverMediaId),
        isActive: body.isActive ?? true,
      });
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'offering.created',
        entityType: 'Offering',
        entityId: offering._id.toString(),
        metadata: { slug: offering.slug, category: offering.category },
      });
      const urls = await mediaUrlsForIds([offering.logoMediaId, offering.coverMediaId]);
      res.status(201).json({ offering: toPublicOffering(offering, urls) });
    } catch (err) {
      next(err);
    }
  },
);

catalogRouter.patch(
  '/offerings/:id',
  requireAuth,
  requirePermission('catalog:manage:super_admin'),
  validate({ params: idParams, body: offeringPatch }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const offering = await Offering.findById(id).exec();
      if (!offering) {
        throw new AppError(404, 'NOT_FOUND', 'Offering not found');
      }
      const body = req.body as z.infer<typeof offeringPatch>;
      assertNoGuaranteeCopy(body.title, body.summary, body.requirementsSummary);
      if (body.providerId) {
        const provider = await Provider.findById(body.providerId).exec();
        if (!provider || !provider.isActive) {
          throw new AppError(400, 'INVALID_PROVIDER', 'Provider does not exist or is inactive');
        }
        offering.providerId = provider._id;
        offering.category = provider.category;
        offering.cityId = provider.cityId;
        offering.countryCode = provider.countryCode;
      } else {
        // No provider: an explicit null detaches it, and the caller supplies category/city.
        if (body.providerId === null) {
          offering.providerId = null;
        }
        if (body.category !== undefined) {
          offering.category = body.category;
        }
        if (body.cityId !== undefined) {
          const city = await City.findById(body.cityId).exec();
          if (!city) {
            throw new AppError(400, 'INVALID_CITY', 'City does not exist');
          }
          offering.cityId = city._id;
          offering.countryCode = city.countryCode;
        }
      }
      if (body.slug && body.slug !== offering.slug) {
        const clash = await Offering.findOne({ slug: body.slug }).exec();
        if (clash) {
          throw new AppError(409, 'OFFERING_SLUG_IN_USE', 'An offering with this slug already exists');
        }
        offering.slug = body.slug;
      }
      if (body.title !== undefined) {
        offering.title = body.title;
      }
      if (body.summary !== undefined) {
        offering.summary = body.summary;
      }
      if (body.requirementsSummary !== undefined) {
        offering.requirementsSummary = body.requirementsSummary;
      }
      if (body.requiredDocumentIds !== undefined) {
        offering.requiredDocumentIds = await resolveRequiredDocumentIds(body.requiredDocumentIds);
      }
      if (body.isActive !== undefined) {
        offering.isActive = body.isActive;
      }
      if (body.logoMediaId !== undefined) {
        offering.logoMediaId = await resolveMediaId(body.logoMediaId);
      }
      if (body.coverMediaId !== undefined) {
        offering.coverMediaId = await resolveMediaId(body.coverMediaId);
      }
      await offering.save();
      await writeAudit({
        actorUserId: req.auth!.userId,
        action: 'offering.updated',
        entityType: 'Offering',
        entityId: offering._id.toString(),
        metadata: body,
      });
      const urls = await mediaUrlsForIds([offering.logoMediaId, offering.coverMediaId]);
      res.json({ offering: toPublicOffering(offering, urls) });
    } catch (err) {
      next(err);
    }
  },
);
