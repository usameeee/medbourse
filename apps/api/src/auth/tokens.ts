import jwt from 'jsonwebtoken';
import type { UserRole } from '@medbourse/shared';
import { USER_ROLES } from '@medbourse/shared';
import { config } from '../config.js';
import { AppError } from '../errors/AppError.js';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

function requireJwtSecret(): string {
  if (!config.jwtSecret || config.jwtSecret === 'change-me-use-long-random-string') {
    if (config.nodeEnv === 'production') {
      throw new AppError(500, 'AUTH_MISCONFIGURED', 'Authentication is not configured');
    }
  }
  if (!config.jwtSecret) {
    throw new AppError(500, 'AUTH_MISCONFIGURED', 'Authentication is not configured');
  }
  return config.jwtSecret;
}

export function signAccessToken(userId: string, role: UserRole): string {
  return jwt.sign({ sub: userId, role } satisfies AccessTokenPayload, requireJwtSecret(), {
    expiresIn: config.jwtAccessExpires as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, requireJwtSecret());
    if (typeof decoded !== 'object' || decoded === null) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Invalid session');
    }
    const sub = 'sub' in decoded ? decoded.sub : undefined;
    const role = 'role' in decoded ? decoded.role : undefined;
    if (typeof sub !== 'string' || typeof role !== 'string' || !USER_ROLES.includes(role as UserRole)) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Invalid session');
    }
    return { sub, role: role as UserRole };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid session');
  }
}
