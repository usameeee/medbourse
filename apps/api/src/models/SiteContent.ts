import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import {
  PAGE_CONTENT_KEYS,
  SOCIAL_NETWORKS,
  type LocalizedText,
  type PageContentKey,
  type PublicSiteContent,
  type SocialNetwork,
} from '@medbourse/shared';

export interface SocialAccountFields {
  id: string;
  network: SocialNetwork;
  url: string;
  order: number;
  isActive: boolean;
}

export interface PageSectionFields {
  id: string;
  title: LocalizedText;
  body: LocalizedText;
}

export interface PageContentFields {
  key: PageContentKey;
  isActive: boolean;
  eyebrow: LocalizedText;
  title: LocalizedText;
  lead: LocalizedText;
  updated: string;
  sections: PageSectionFields[];
}

export interface SiteContentFields {
  key: string;
  social: SocialAccountFields[];
  pages: PageContentFields[];
}

export type SiteContentRecord = HydratedDocument<SiteContentFields>;

/** The document is a singleton: one Super-Admin-owned config for the whole public site. */
export const SITE_CONTENT_KEY = 'site';

const localizedTextSchema = new mongoose.Schema<LocalizedText>(
  {
    en: { type: String, default: '', maxlength: 2000 },
    tr: { type: String, default: '', maxlength: 2000 },
    fr: { type: String, default: '', maxlength: 2000 },
    ar: { type: String, default: '', maxlength: 2000 },
  },
  { _id: false },
);

const emptyLocalized = () => ({ en: '', tr: '', fr: '', ar: '' });

const socialAccountSchema = new mongoose.Schema<SocialAccountFields>(
  {
    id: { type: String, required: true },
    network: { type: String, required: true, enum: SOCIAL_NETWORKS },
    url: { type: String, required: true, trim: true, maxlength: 500 },
    order: { type: Number, default: 0, min: 0, max: 999 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

const pageSectionSchema = new mongoose.Schema<PageSectionFields>(
  {
    id: { type: String, required: true },
    title: { type: localizedTextSchema, default: emptyLocalized },
    body: { type: localizedTextSchema, default: emptyLocalized },
  },
  { _id: false },
);

const pageContentSchema = new mongoose.Schema<PageContentFields>(
  {
    key: { type: String, enum: [...PAGE_CONTENT_KEYS], required: true },
    isActive: { type: Boolean, default: true },
    eyebrow: { type: localizedTextSchema, default: emptyLocalized },
    title: { type: localizedTextSchema, default: emptyLocalized },
    lead: { type: localizedTextSchema, default: emptyLocalized },
    updated: { type: String, default: '' },
    sections: { type: [pageSectionSchema], default: [] },
  },
  { _id: false },
);

const siteContentSchema = new mongoose.Schema<SiteContentFields>(
  {
    key: { type: String, unique: true, default: SITE_CONTENT_KEY },
    social: { type: [socialAccountSchema], default: [] },
    pages: { type: [pageContentSchema], default: [] },
  },
  { timestamps: true },
);

export const SiteContent: Model<SiteContentFields> =
  mongoose.models.SiteContent ??
  mongoose.model<SiteContentFields>('SiteContent', siteContentSchema);

function norm(value: LocalizedText | undefined): LocalizedText {
  return {
    en: value?.en ?? '',
    tr: value?.tr ?? '',
    fr: value?.fr ?? '',
    ar: value?.ar ?? '',
  };
}

/** Loads the singleton, creating an empty one on first access. */
export async function getSiteContentRecord(): Promise<SiteContentRecord> {
  const existing = await SiteContent.findOne({ key: SITE_CONTENT_KEY }).exec();
  return existing ?? (await SiteContent.create({ key: SITE_CONTENT_KEY }));
}

/**
 * Serialises the config. The public endpoint hides inactive entries; the Super Admin
 * endpoint returns everything so unpublished work stays editable.
 */
export function toPublicSiteContent(
  record: SiteContentRecord,
  options: { activeOnly: boolean },
): PublicSiteContent {
  const social = record.social
    .filter((account) => !options.activeOnly || account.isActive)
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((account) => ({
      id: account.id,
      network: account.network,
      url: account.url,
      order: account.order,
      isActive: account.isActive,
    }));

  const pages = record.pages
    .filter((page) => !options.activeOnly || page.isActive)
    .map((page) => ({
      key: page.key,
      isActive: page.isActive,
      eyebrow: norm(page.eyebrow),
      title: norm(page.title),
      lead: norm(page.lead),
      updated: page.updated,
      sections: page.sections.map((section) => ({
        id: section.id,
        title: norm(section.title),
        body: norm(section.body),
      })),
    }));

  return { social, pages };
}
