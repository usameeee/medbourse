export type UserRole = 'customer' | 'admin' | 'super_admin';

export const USER_ROLES: readonly UserRole[] = [
  'customer',
  'admin',
  'super_admin',
] as const;
