import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PublicMedia } from '@medbourse/shared';

export interface MediaFields {
  storageKey: string;
  storageDriver: 'memory' | 'local' | 'cloudinary';
  publicUrl: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
}

export type MediaRecord = HydratedDocument<MediaFields>;

const mediaSchema = new mongoose.Schema<MediaFields>(
  {
    storageKey: { type: String, required: true },
    storageDriver: { type: String, required: true, enum: ['memory', 'local', 'cloudinary'] },
    publicUrl: { type: String, default: null },
    originalFilename: { type: String, required: true, trim: true, maxlength: 180 },
    mimeType: { type: String, required: true, maxlength: 80 },
    sizeBytes: { type: Number, required: true, min: 1 },
    uploadedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/** Public URL for a stored image: the CDN URL when hosted, otherwise the API read endpoint. */
export function mediaPublicUrl(media: MediaRecord): string {
  return media.publicUrl ?? `/media/${media._id.toString()}`;
}

/** Batch-resolves media ids to public URLs, used to denormalise images onto public payloads. */
export async function mediaUrlsForIds(
  ids: Array<mongoose.Types.ObjectId | null | undefined>,
): Promise<Map<string, string>> {
  const unique = ids.filter((value): value is mongoose.Types.ObjectId => Boolean(value));
  if (unique.length === 0) {
    return new Map();
  }
  const medias = await Media.find({ _id: { $in: unique } }).exec();
  return new Map(medias.map((media) => [media._id.toString(), mediaPublicUrl(media)]));
}

/** Reads one media id out of a resolved URL map; returns `null` when unset or missing. */
export function resolveMediaUrl(
  mediaId: mongoose.Types.ObjectId | null | undefined,
  urls: Map<string, string>,
): string | null {
  if (!mediaId) {
    return null;
  }
  return urls.get(mediaId.toString()) ?? null;
}

export function toPublicMedia(media: MediaRecord): PublicMedia {
  return {
    id: media._id.toString(),
    url: mediaPublicUrl(media),
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    createdAt: media.createdAt.toISOString(),
  };
}

export const Media: Model<MediaFields> =
  mongoose.models.Media ?? mongoose.model<MediaFields>('Media', mediaSchema);
