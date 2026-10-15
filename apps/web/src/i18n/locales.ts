import type { AppLocale } from '@medbourse/shared';
import ar from './locales/ar.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import tr from './locales/tr.json';

export const resources = {
  en: { translation: en },
  tr: { translation: tr },
  fr: { translation: fr },
  ar: { translation: ar },
} as const;

type MessageCatalog = typeof en;

const catalogs: Record<AppLocale, MessageCatalog> = {
  en,
  tr,
  fr,
  ar,
};

void catalogs;
