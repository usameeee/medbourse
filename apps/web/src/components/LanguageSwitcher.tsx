import { useTranslation } from 'react-i18next';
import { APP_LOCALES, resolveAppLocale } from '@medbourse/shared';
import styles from './LanguageSwitcher.module.css';

function GlobeIcon() {
  return (
    <svg className={styles.globe} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" />
    </svg>
  );
}

/**
 * Compact language control for the page headers. It shows the locale codes as a
 * segmented pill so it stays on one line next to the nav; the full language name
 * stays available as a tooltip and `aria-label`.
 *
 * `tone` mirrors the surface it sits on: `surface` for the page background,
 * `brand` for the red portal header (which uses the inverse ink).
 */
export default function LanguageSwitcher({ tone = 'surface' }: { tone?: 'surface' | 'brand' }) {
  const { t, i18n } = useTranslation();
  const current = resolveAppLocale(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div className={`${styles.wrap} ${tone === 'brand' ? styles.toneBrand : styles.toneSurface}`}>
      <GlobeIcon />
      <div className={styles.group} role="radiogroup" aria-label={t('language.label')}>
        {APP_LOCALES.map((locale) => {
          const selected = locale === current;
          const name = t(`language.${locale}`);
          return (
            <button
              key={locale}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={name}
              title={name}
              className={selected ? `${styles.option} ${styles.optionCurrent}` : styles.option}
              onClick={() => {
                void i18n.changeLanguage(locale);
              }}
            >
              {locale.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
