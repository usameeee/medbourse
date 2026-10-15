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
  return cloudinary.url(key, {
    resource_type: resourceType,
    type: 'authenticated',
    sign_url: true,
    expires_at: expiresAtUnix,
    secure: true,
  });
}
