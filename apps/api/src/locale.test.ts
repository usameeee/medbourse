import { describe, expect, it } from 'vitest';
import { localeDirection, resolveAppLocale } from '@medbourse/shared';

describe('locales', () => {
  it('treats Arabic as RTL', () => {
    expect(localeDirection('ar')).toBe('rtl');
    expect(localeDirection('tr')).toBe('ltr');
  });

  it('normalizes regional language tags', () => {
    expect(resolveAppLocale('en-US')).toBe('en');
    expect(resolveAppLocale('ar-SA')).toBe('ar');
    expect(resolveAppLocale('xx')).toBe('en');
  });
});
