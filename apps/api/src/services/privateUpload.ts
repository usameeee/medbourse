import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import multer from 'multer';
import { AppError } from '../errors/AppError.js';
import { config } from '../config.js';
import { uploadPrivateCloudinary } from '../storage/cloudinary.js';
import { getObjectStorage } from '../storage/index.js';

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

export interface PersistedPrivateFile {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  storageDriver: 'memory' | 'local' | 'cloudinary';
  resourceType: string | null;
}

function sanitizeFilename(raw: string): string {
  const base = basename(raw).replace(/[\u0000-\u001f]/g, '').trim();
  if (!base) {
    return 'upload.bin';
  }
  return base.slice(0, 180);
}

export async function persistPrivateFile(file: Express.Multer.File | undefined): Promise<PersistedPrivateFile> {
  if (!file?.buffer?.length) {
    throw new AppError(400, 'NO_FILE', 'A file field named file is required');
  }
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new AppError(400, 'UNSUPPORTED_TYPE', 'Only PDF, JPEG, PNG, and WebP files are accepted');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError(400, 'FILE_TOO_LARGE', 'File exceeds the 10MB limit');
  }
  const storageKey: string = randomUUID();
  let storedKey: string = storageKey;
  let resourceType: string | null = null;
  if (config.storageDriver === 'cloudinary') {
    const uploaded = await uploadPrivateCloudinary({
      key: storageKey,
      bytes: file.buffer,
      mimeType: file.mimetype,
    });
    storedKey = uploaded.key;
    resourceType = uploaded.resourceType;
  } else {
    await getObjectStorage().put({
      key: storageKey,
      bytes: file.buffer,
      mimeType: file.mimetype,
    });
  }
  return {
    originalFilename: sanitizeFilename(file.originalname || 'upload.bin'),
    mimeType: file.mimetype,
    sizeBytes: file.size,
    storageKey: storedKey,
    storageDriver: config.storageDriver,
    resourceType,
  };
}
