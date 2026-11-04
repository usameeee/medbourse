import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function readPort(): number {
  // Hosting platforms (Render, Railway, Heroku) inject `PORT`; an explicit API_PORT wins.
  const raw = process.env.API_PORT ?? process.env.PORT ?? '4000';
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    return 4000;
  }
  return port;
}

/** Cookie SameSite policy. Pass `none` when web and API live on different registrable domains. */
function readSameSite(): 'lax' | 'strict' | 'none' {
  const raw = (process.env.COOKIE_SAMESITE ?? 'lax').trim().toLowerCase();
  return raw === 'strict' || raw === 'none' ? raw : 'lax';
}

function readSmtpPort(): number {
  const raw = process.env.SMTP_PORT ?? '587';
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    return 587;
  }
  return port;
}

function readCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  const origins = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : ['http://localhost:5173'];
}

/** Parses a `jsonwebtoken`-style duration (`15m`, `7d`, `3600s`) into milliseconds. */
function readDurationMs(raw: string | undefined, fallbackLiteral: string): number {
  const value = (raw ?? fallbackLiteral).trim();
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/.exec(value);
  if (!match) {
    return readDurationMs(undefined, fallbackLiteral);
  }
  const amount = Number.parseFloat(match[1]);
  const unit = match[2] as 'ms' | 's' | 'm' | 'h' | 'd';
  const factors: Record<typeof unit, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Math.round(amount * factors[unit]);
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: readPort(),
  host: process.env.API_HOST ?? '0.0.0.0',
  corsOrigins: readCorsOrigins(),
  serviceName: 'medbourse-api',
  version: '0.0.1',
  mongodbUri: process.env.MONGODB_URI ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  accessCookieMaxAgeMs: readDurationMs(process.env.JWT_ACCESS_EXPIRES, '15m'),
  refreshCookieMaxAgeMs: readDurationMs(process.env.JWT_REFRESH_EXPIRES, '7d'),
  cookieSecret: process.env.COOKIE_SECRET ?? '',
  cookieSameSite: readSameSite(),
  bcryptRounds: process.env.VITEST === 'true' ? 4 : 12,
  storageDriver: (process.env.VITEST === 'true'
    ? 'memory'
    : (process.env.STORAGE_DRIVER ?? 'local')) as 'memory' | 'local' | 'cloudinary',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
    folder: process.env.CLOUDINARY_FOLDER_SENSITIVE ?? 'medbourse/private',
    publicFolder: process.env.CLOUDINARY_FOLDER_PUBLIC ?? 'medbourse/public',
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
