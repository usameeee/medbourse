import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import {
  DEFAULT_FOCAL_POINT,
  SERVICE_CATEGORIES,
  type LocalizedText,
  type PublicShowcaseFrame,
  type PublicShowcaseSlide,
  type ServiceCategory,
} from '@medbourse/shared';

/** One photo in a scene, with the focal point the hero camera should hold (0–100 %). */
export interface ShowcaseFrameFields {
  mediaId: mongoose.Types.ObjectId | null;
  focalX: number;
  focalY: number;
}

export interface ShowcaseSlideFields {
  order: number;
  isActive: boolean;
  category: ServiceCategory | null;
  /** Legacy single image; kept so older slides (and non-hero banners) keep working. */
  mediaId: mongoose.Types.ObjectId | null;
  frames: ShowcaseFrameFields[];
  name: LocalizedText;
  eyebrow: LocalizedText;
  headline: LocalizedText;
  narrative: LocalizedText;
  altText: LocalizedText;
}

export type ShowcaseSlideRecord = HydratedDocument<ShowcaseSlideFields>;

const localizedTextSchema = new mongoose.Schema<LocalizedText>(
  {
    en: { type: String, default: '', maxlength: 400 },
    tr: { type: String, default: '', maxlength: 400 },
    fr: { type: String, default: '', maxlength: 400 },
    ar: { type: String, default: '', maxlength: 400 },
  },
  { _id: false },
);

const showcaseFrameSchema = new mongoose.Schema<ShowcaseFrameFields>(
  {
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
    focalX: { type: Number, default: DEFAULT_FOCAL_POINT, min: 0, max: 100 },
    focalY: { type: Number, default: DEFAULT_FOCAL_POINT, min: 0, max: 100 },
  },
  { _id: false },
);

const emptyLocalized = () => ({ en: '', tr: '', fr: '', ar: '' });

const showcaseSlideSchema = new mongoose.Schema<ShowcaseSlideFields>(
  {
    order: { type: Number, default: 0, min: 0, max: 999 },
    isActive: { type: Boolean, default: true },
    category: { type: String, enum: [...SERVICE_CATEGORIES, null], default: null },
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
    frames: { type: [showcaseFrameSchema], default: [] },
    name: { type: localizedTextSchema, default: emptyLocalized },
    eyebrow: { type: localizedTextSchema, default: emptyLocalized },
    headline: { type: localizedTextSchema, default: emptyLocalized },
    narrative: { type: localizedTextSchema, default: emptyLocalized },
    altText: { type: localizedTextSchema, default: emptyLocalized },
  },
  { timestamps: true },
);

/** Ordering is per category, so the carousel query sorts and pages within a category. */
showcaseSlideSchema.index({ isActive: 1, category: 1, order: 1, _id: 1 });

function normalizeLocalized(value: LocalizedText | undefined): LocalizedText {
  return {
    en: value?.en ?? '',
    tr: value?.tr ?? '',
    fr: value?.fr ?? '',
    ar: value?.ar ?? '',
  };
}

/** Every media id a slide references, so the route can resolve their URLs in one query. */
export function showcaseMediaIds(slide: ShowcaseSlideRecord): mongoose.Types.ObjectId[] {
  const ids: mongoose.Types.ObjectId[] = [];
  for (const frame of slide.frames) {
    if (frame.mediaId) {
      ids.push(frame.mediaId);
    }
  }
  // A slide with no frames still falls back to its legacy single image.
  if (ids.length === 0 && slide.mediaId) {
    ids.push(slide.mediaId);
  }
  return ids;
}

export function toPublicShowcaseSlide(
  slide: ShowcaseSlideRecord,
  urls: Map<string, string> = new Map(),
): PublicShowcaseSlide {
  const frames: PublicShowcaseFrame[] = slide.frames
    .map((frame) => {
      const id = frame.mediaId ? frame.mediaId.toString() : null;
      return {
        mediaId: id,
        imageUrl: id ? urls.get(id) ?? null : null,
        focalX: frame.focalX ?? DEFAULT_FOCAL_POINT,
        focalY: frame.focalY ?? DEFAULT_FOCAL_POINT,
      };
    })
    .filter((frame) => frame.imageUrl !== null);

  // Backward compatibility: a slide created before frames existed still shows its image.
  if (frames.length === 0 && slide.mediaId) {
    const id = slide.mediaId.toString();
    frames.push({
      mediaId: id,
      imageUrl: urls.get(id) ?? null,
      focalX: DEFAULT_FOCAL_POINT,
      focalY: DEFAULT_FOCAL_POINT,
    });
  }

  const primary = frames[0] ?? null;

  return {
    id: slide._id.toString(),
    order: slide.order,
    isActive: slide.isActive,
    category: slide.category,
    mediaId: primary?.mediaId ?? null,
    imageUrl: primary?.imageUrl ?? null,
    frames,
    name: normalizeLocalized(slide.name),
    eyebrow: normalizeLocalized(slide.eyebrow),
    headline: normalizeLocalized(slide.headline),
    narrative: normalizeLocalized(slide.narrative),
    altText: normalizeLocalized(slide.altText),
  };
}

export const ShowcaseSlide: Model<ShowcaseSlideFields> =
  mongoose.models.ShowcaseSlide ??
  mongoose.model<ShowcaseSlideFields>('ShowcaseSlide', showcaseSlideSchema);
