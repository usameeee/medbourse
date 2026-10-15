import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function readPort(): number {
  const raw = process.env.API_PORT ?? '4000';
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    return 4000;
  }
  return port;
}

function readSmtpPort(): number {
  const raw = process.env.SMTP_PORT ?? '587';
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    return 587;
  }
  return port;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: readPort(),
  host: process.env.API_HOST ?? '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  serviceName: 'medbourse-api',
  version: '0.0.1',
  mongodbUri: process.env.MONGODB_URI ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  cookieSecret: process.env.COOKIE_SECRET ?? '',
  bcryptRounds: process.env.VITEST === 'true' ? 4 : 12,
  storageDriver: (process.env.VITEST === 'true'
    ? 'memory'
    : (process.env.STORAGE_DRIVER ?? 'local')) as 'memory' | 'local' | 'cloudinary',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
    folder: process.env.CLOUDINARY_FOLDER_SENSITIVE ?? 'medbourse/private',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: readSmtpPort(),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.EMAIL_FROM ?? 'MEDBOURSE <noreply@example.com>',
  },
} as const;
