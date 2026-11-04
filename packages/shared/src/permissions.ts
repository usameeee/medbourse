import type { UserRole } from './roles.js';

export type Permission =
  | 'customer:read:self'
  | 'customer:read:admin'
  | 'case:read:self'
  | 'case:create:admin'
  | 'case:create:self'
  | 'case:workflow:admin'
  | 'case:message:self'
  | 'notification:read:self'
  | 'customer:create:admin'
  | 'document:review:admin'
  | 'payment:verify:admin'
  /** Read the country → manager maps (an admin's Payments scope reads them). */
  | 'assignment:manage:admin'
  /** Binding a country to its managers, and reassigning a customer — Super Admin only. */
  | 'assignment:manage:super_admin'
  /** Prices and receiving accounts for the countries this admin is assigned to. */
  | 'payment:manage:assigned'
  | 'catalog:manage:super_admin'
  | 'document:manage:super_admin'
  | 'workflow:manage:super_admin'
  | 'site:manage:super_admin'
  | 'audit:read:super_admin'
  | 'user:manage:super_admin';

/** Least-privilege defaults; expand as features land. */
export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  customer: [
    'customer:read:self',
    'case:read:self',
    'case:create:self',
    'case:message:self',
    'notification:read:self',
  ],
  admin: [
    'customer:read:self',
    'customer:read:admin',
    'case:read:self',
    'case:create:admin',
    'case:workflow:admin',
    'case:message:self',
    'notification:read:self',
    'customer:create:admin',
    'document:review:admin',
    'payment:verify:admin',
    'assignment:manage:admin',
    'payment:manage:assigned',
  ],
  super_admin: [
    'customer:read:self',
    'customer:read:admin',
    'case:read:self',
    'case:create:admin',
    'case:workflow:admin',
    'case:message:self',
    'notification:read:self',
    'customer:create:admin',
    'document:review:admin',
    'payment:verify:admin',
    'assignment:manage:admin',
    'assignment:manage:super_admin',
    'catalog:manage:super_admin',
    'document:manage:super_admin',
    'workflow:manage:super_admin',
    'site:manage:super_admin',
    'audit:read:super_admin',
    'user:manage:super_admin',
  ],
};

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
