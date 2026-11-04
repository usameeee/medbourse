import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '../errors/AppError.js';
import { config } from '../config.js';

function configure() {
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
    throw new AppError(503, 'STORAGE_MISCONFIGURED', 'Cloudinary is not configured');
  }
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
}

export async function uploadPrivateCloudinary(input: {
  key: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<{ key: string; resourceType: string }> {
  configure();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: input.key,
        folder: config.cloudinary.folder,
        type: 'private',
        resource_type: 'auto',
        access_mode: 'authenticated',
      },
      (err, result) => {
        if (err || !result?.public_id) {
          reject(err ?? new AppError(502, 'STORAGE_FAILED', 'Cloudinary upload failed'));
          return;
        }
        resolve({ key: result.public_id, resourceType: result.resource_type ?? 'raw' });
      },
    );
    stream.end(input.bytes);
  });
}

export function signCloudinaryUrl(key: string, resourceType: string, expiresAtUnix: number): string {
  configure();
  // The delivery type must match how the asset was stored. Sensitive files are uploaded
  // with `type: 'private'` (see uploadPrivateCloudinary), so signing an `authenticated`
  // URL resolves to a non-existent asset and Cloudinary answers 404.
  return cloudinary.url(key, {
    resource_type: resourceType,
    type: 'private',
    sign_url: true,
    expires_at: expiresAtUnix,
    secure: true,
  });
}

/**
 * Removes a sensitive asset. The delivery type has to match the upload (see
 * `uploadPrivateCloudinary`), otherwise Cloudinary would look for the public id under a
 * different type and silently report it as not found.
 */
export async function deletePrivateCloudinary(key: string, resourceType: string): Promise<void> {
  configure();
  await cloudinary.uploader.destroy(key, {
    type: 'private',
    resource_type: resourceType,
    invalidate: true,
  });
}

/**
 * Uploads a marketing image as a publicly deliverable asset. Unlike sensitive
 * case documents these are meant to be served without authentication, so they
 * are stored under an `upload` (public) type and read back via their CDN URL.
 */
export async function uploadPublicCloudinary(input: {
  key: string;
  bytes: Buffer;
}): Promise<{ key: string; url: string }> {
  configure();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: input.key,
        folder: config.cloudinary.publicFolder,
        type: 'upload',
        resource_type: 'image',
      },
      (err, result) => {
        if (err || !result?.secure_url) {
          reject(err ?? new AppError(502, 'STORAGE_FAILED', 'Cloudinary upload failed'));
          return;
        }
        resolve({ key: result.public_id, url: result.secure_url });
      },
    );
    stream.end(input.bytes);
  });
}
