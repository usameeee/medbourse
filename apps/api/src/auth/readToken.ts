import type { Request } from 'express';
import { ACCESS_COOKIE } from './constants.js';

export function readAccessToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const bearer = header.slice('Bearer '.length).trim();
    if (bearer) {
      return bearer;
    }
  }
  const cookieToken = req.cookies?.[ACCESS_COOKIE];
  return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : undefined;
}
