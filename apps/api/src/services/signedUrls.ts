import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../errors/AppError.js';

const TTL_SECONDS = 60;

function secret(): string {
  if (!config.jwtSecret) {
    throw new AppError(500, 'AUTH_MISCONFIGURED', 'Authentication is not configured');
  }
  return config.jwtSecret;
}

export function signDocumentAccess(documentId: string): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const sig = createHmac('sha256', secret()).update(`${documentId}.${exp}`).digest('hex');
  return { exp, sig };
}

export function assertDocumentAccess(documentId: string, expRaw: string, sigRaw: string): void {
  const exp = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    throw new AppError(401, 'SIGNED_URL_EXPIRED', 'This download link is no longer valid');
  }
  const expected = createHmac('sha256', secret()).update(`${documentId}.${exp}`).digest('hex');
  const sig = sigRaw.trim().toLowerCase();
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError(401, 'SIGNED_URL_INVALID', 'This download link is not valid');
  }
}

export function documentContentPath(documentId: string, exp: number, sig: string): string {
  return signedContentPath('documents', documentId, exp, sig);
}

export function signedContentPath(
  collection: 'documents' | 'payment-evidence',
  id: string,
  exp: number,
  sig: string,
): string {
  return `/api/v1/${collection}/${id}/content?exp=${exp}&sig=${sig}`;
}
