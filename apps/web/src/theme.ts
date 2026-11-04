export type Theme = 'light' | 'dark';

/** Shared with the inline bootstrap in index.html — keep both in sync. */
export const THEME_STORAGE_KEY = 'medbourse-theme';

function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

/** An explicit choice wins; otherwise the operating-system preference decides. */
export function resolveTheme(): Theme {
  const stored = readStoredTheme();
  if (stored) {
    return stored;
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Mirrors the theme onto `<html data-theme>` and remembers an explicit choice. */
export function applyTheme(theme: Theme, persist = true) {
  document.documentElement.dataset.theme = theme;
  if (!persist) {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable (private mode) — the in-memory theme still applies */
  }
}
