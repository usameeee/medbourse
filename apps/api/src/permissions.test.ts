import { describe, expect, it } from 'vitest';
import { roleHasPermission } from '@medbourse/shared';

describe('roleHasPermission', () => {
  it('denies customer catalog management', () => {
    expect(roleHasPermission('customer', 'catalog:manage:super_admin')).toBe(false);
  });

  it('allows super_admin catalog management', () => {
    expect(roleHasPermission('super_admin', 'catalog:manage:super_admin')).toBe(true);
  });
});
