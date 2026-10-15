export type UserRole = 'customer' | 'staff' | 'admin' | 'super_admin';

export const USER_ROLES: readonly UserRole[] = [
  'customer',
  'staff',
  'admin',
  'super_admin',
] as const;
