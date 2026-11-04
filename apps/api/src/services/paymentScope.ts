import type { Request } from 'express';
import { roleHasPermission } from '@medbourse/shared';
import { AppError } from '../errors/AppError.js';
import { listAssignedCountryCodes } from './assignment.js';

/**
 * Super admins own the global defaults (a rule with no country and the shared
 * receiving account); country admins only touch the countries assigned to them.
 * See `payment:manage:assigned`.
 */
export function isPaymentSuperAdmin(req: Request): boolean {
  return roleHasPermission(req.auth!.role, 'catalog:manage:super_admin');
}

/** Country codes the caller may price/pay for; `null` means every country (super admin). */
export async function paymentScopeCountries(req: Request): Promise<string[] | null> {
  if (isPaymentSuperAdmin(req)) {
    return null;
  }
  return listAssignedCountryCodes(req.auth!.userId);
}

/** Rejects a country the caller does not manage, and a global `null` for a non-super-admin. */
export async function assertPaymentCountryAllowed(
  req: Request,
  countryCode: string | null,
): Promise<void> {
  if (isPaymentSuperAdmin(req)) {
    return;
  }
  if (!countryCode) {
    throw new AppError(
      403,
      'GLOBAL_SCOPE_FORBIDDEN',
      'Only a super admin can manage the global default',
    );
  }
  const assigned = await listAssignedCountryCodes(req.auth!.userId);
  if (!assigned.includes(countryCode)) {
    throw new AppError(403, 'COUNTRY_NOT_ASSIGNED', 'You can only manage countries assigned to you');
  }
}
