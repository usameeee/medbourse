import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../errors/AppError.js';
import { RefreshSession } from '../models/RefreshSession.js';

/** The raw refresh token is opaque and random; only its hash is persisted. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Issues a new refresh token for a user and records the session. Returns the raw token. */
export async function createRefreshSession(userId: string): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  await RefreshSession.create({
    userId,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + config.refreshCookieMaxAgeMs),
    revokedAt: null,
  });
  return token;
}

/**
 * Exchanges a valid refresh token for a fresh one (rotation). The old session is
 * revoked so a leaked token can only be used once.
 */
export async function rotateRefreshSession(
  rawToken: string,
): Promise<{ userId: string; refreshToken: string }> {
  const session = await RefreshSession.findOne({ tokenHash: hashRefreshToken(rawToken) }).exec();
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Session expired');
  }
  session.revokedAt = new Date();
  await session.save();

  const userId = session.userId.toString();
  const refreshToken = await createRefreshSession(userId);
  return { userId, refreshToken };
}

/** Revokes a single refresh session (used on logout). Unknown tokens are ignored. */
export async function revokeRefreshSession(rawToken: string): Promise<void> {
  await RefreshSession.updateOne(
    { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  ).exec();
}

/** Revokes every active session for a user; used after a password reset so old devices are signed out. */
export async function revokeAllRefreshSessions(userId: string): Promise<void> {
  await RefreshSession.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  ).exec();
}
