import { createHash, randomBytes } from 'node:crypto';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
