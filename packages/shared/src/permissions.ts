import type { UserRole } from './roles.js';

export type Permission =
  | 'customer:read:self'
  | 'customer:read:staff'
  | 'case:read:self'
  | 'case:create:staff'
  | 'case:workflow:staff'
  | 'case:message:self'
  | 'notification:read:self'
  | 'customer:create:staff'
  | 'document:review:staff'
  | 'payment:verify:staff'
  | 'assignment:manage:admin'
  | 'catalog:manage:super_admin'
  | 'workflow:manage:super_admin'
  | 'audit:read:super_admin';

/** Least-privilege defaults; expand as features land. */
export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  customer: [
    'customer:read:self',
    'case:read:self',
    'case:message:self',
    'notification:read:self',
  ],
  staff: [
    'customer:read:self',
    'customer:read:staff',
    'case:read:self',
    'case:create:staff',
    'case:workflow:staff',
    'case:message:self',
    'notification:read:self',
    'customer:create:staff',
    'document:review:staff',
    'payment:verify:staff',
  ],
  admin: [
    'customer:read:self',
    'customer:read:staff',
    'case:read:self',
    'case:create:staff',
    'case:workflow:staff',
    'case:message:self',
    'notification:read:self',
    'customer:create:staff',
    'document:review:staff',
    'payment:verify:staff',
    'assignment:manage:admin',
  ],
  super_admin: [
    'customer:read:self',
    'customer:read:staff',
    'case:read:self',
    'case:create:staff',
    'case:workflow:staff',
    'case:message:self',
    'notification:read:self',
    'customer:create:staff',
    'document:review:staff',
    'payment:verify:staff',
    'assignment:manage:admin',
    'catalog:manage:super_admin',
    'workflow:manage:super_admin',
    'audit:read:super_admin',
  ],
};

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
