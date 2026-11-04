import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import multer from 'multer';
import { SHOWCASE_IMAGE_MAX_BYTES, SHOWCASE_IMAGE_MIME_TYPES } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { config } from '../config.js';
import { uploadPublicCloudinary } from '../storage/cloudinary.js';
import { getObjectStorage } from '../storage/index.js';

const ALLOWED_MIME = new Set<string>(SHOWCASE_IMAGE_MIME_TYPES);

/** Memory upload for public marketing images; the file is streamed to storage, never to disk. */
export const publicImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SHOWCASE_IMAGE_MAX_BYTES, files: 1 },
});

export interface PersistedPublicImage {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  storageDriver: 'memory' | 'local' | 'cloudinary';
  publicUrl: string | null;
}

function sanitizeFilename(raw: string): string {
  const base = basename(raw).replace(/[\u0000-\u001f]/g, '').trim();
  return base ? base.slice(0, 180) : 'image';
}

export async function persistPublicImage(
  file: Express.Multer.File | undefined,
): Promise<PersistedPublicImage> {
  if (!file?.buffer?.length) {
    throw new AppError(400, 'NO_FILE', 'A file field named file is required');
  }
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new AppError(400, 'UNSUPPORTED_TYPE', 'Only JPEG, PNG, WebP, and AVIF images are accepted');
  }
  if (file.size > SHOWCASE_IMAGE_MAX_BYTES) {
    throw new AppError(400, 'FILE_TOO_LARGE', 'Image exceeds the 8MB limit');
  }

  const key = `public/${randomUUID()}`;
  let storageKey: string = key;
  let publicUrl: string | null = null;

  if (config.storageDriver === 'cloudinary') {
    const uploaded = await uploadPublicCloudinary({ key, bytes: file.buffer });
    storageKey = uploaded.key;
    publicUrl = uploaded.url;
  } else {
    await getObjectStorage().put({ key, bytes: file.buffer, mimeType: file.mimetype });
  }

  return {
    originalFilename: sanitizeFilename(file.originalname || 'image'),
    mimeType: file.mimetype,
    sizeBytes: file.size,
    storageKey,
    storageDriver: config.storageDriver,
    publicUrl,
  };
}
