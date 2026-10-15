import { useTranslation } from 'react-i18next';
import { APP_LOCALES, resolveAppLocale } from '@medbourse/shared';
import styles from './LanguageSwitcher.module.css';

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = resolveAppLocale(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div className={styles.wrap}>
      <span className={styles.label} id="language-switcher-label">
        {t('language.label')}
      </span>
      <div
        className={styles.group}
        role="radiogroup"
        aria-labelledby="language-switcher-label"
      >
        {APP_LOCALES.map((locale) => {
          const selected = locale === current;
          return (
            <button
              key={locale}
              type="button"
              role="radio"
              aria-checked={selected}
              className={selected ? `${styles.option} ${styles.optionCurrent}` : styles.option}
              onClick={() => {
                void i18n.changeLanguage(locale);
              }}
            >
              {t(`language.${locale}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
