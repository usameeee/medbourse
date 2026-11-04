import type { CookieOptions, Response } from 'express';
import { config } from '../config.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './constants.js';

function baseCookieOptions(): Pick<
  CookieOptions,
  'httpOnly' | 'sameSite' | 'secure' | 'signed'
> {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    signed: false,
  };
}

function accessCookieOptions(): CookieOptions {
  return {
    ...baseCookieOptions(),
    path: '/',
    maxAge: config.accessCookieMaxAgeMs,
  };
}

// Scoped to the auth routes so the long-lived token is not sent on every request.
function refreshCookieOptions(): CookieOptions {
  return {
    ...baseCookieOptions(),
    path: '/api/v1/auth',
    maxAge: config.refreshCookieMaxAgeMs,
  };
}

export function setAccessCookie(res: Response, token: string): void {
  res.cookie(ACCESS_COOKIE, token, accessCookieOptions());
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

export function clearAccessCookie(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, accessCookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}
