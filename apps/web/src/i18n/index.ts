import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { APP_LOCALES } from '@medbourse/shared';
import { applyDocumentLocale, LOCALE_STORAGE_KEY } from './document';
import { resources } from './locales';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: [...APP_LOCALES],
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

applyDocumentLocale(i18n.language);
i18n.on('languageChanged', applyDocumentLocale);

export default i18n;
