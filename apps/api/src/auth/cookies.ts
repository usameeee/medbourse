import type { CookieOptions, Response } from 'express';
import { config } from '../config.js';
import { ACCESS_COOKIE } from './constants.js';

function accessCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    signed: false,
  };
}

export function setAccessCookie(res: Response, token: string): void {
  res.cookie(ACCESS_COOKIE, token, accessCookieOptions());
}

export function clearAccessCookie(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, accessCookieOptions());
}
