import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyTheme, resolveTheme, type Theme } from '../theme';
import styles from './ThemeToggle.module.css';

interface ThemeToggleProps {
  /**
   * `surface` sits on the light/dark page background; `brand` sits on the red
   * portal header, where controls use the inverse ink instead.
   */
  tone?: 'surface' | 'brand';
  className?: string;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

export default function ThemeToggle({ tone = 'surface', className }: ThemeToggleProps) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }

  const label = theme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark');

  return (
    <button
      type="button"
      className={[styles.button, styles[tone], className].filter(Boolean).join(' ')}
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={theme === 'dark'}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
