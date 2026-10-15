import { localeDirection, resolveAppLocale } from '@medbourse/shared';

export const LOCALE_STORAGE_KEY = 'medbourse-locale';

export function applyDocumentLocale(locale: string) {
  const resolved = resolveAppLocale(locale);
  const root = document.documentElement;
  root.lang = resolved;
  root.dir = localeDirection(resolved);
  document.title = 'MEDBOURSE';
}
