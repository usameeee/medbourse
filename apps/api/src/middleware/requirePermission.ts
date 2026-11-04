import type { RequestHandler } from 'express';
import type { Permission } from '@medbourse/shared';
import { roleHasPermission } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const role = req.auth?.role;
    if (!role) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
      return;
    }
    if (!roleHasPermission(role, permission)) {
      next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));
      return;
    }
    next();
  };
}

/** Passes when the caller holds at least one of the listed permissions. */
export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    const role = req.auth?.role;
    if (!role) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
      return;
    }
    if (!permissions.some((permission) => roleHasPermission(role, permission))) {
      next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));
      return;
    }
    next();
  };
}
