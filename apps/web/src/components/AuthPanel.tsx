import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthSessionResponse, PublicUser } from '@medbourse/shared';
import { apiUrl, parseApiError } from '../api';
import styles from './AuthPanel.module.css';

type Mode = 'login' | 'register';

interface AuthPanelProps {
  onAuthenticated: (user: PublicUser) => void;
}

export default function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const path = mode === 'register' ? '/auth/register' : '/auth/login';
      const res = await fetch(apiUrl(path), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(mode === 'register' && displayName ? { displayName } : {}),
        }),
      });
      if (!res.ok) {
        setError(await parseApiError(res));
        return;
      }
      const body = (await res.json()) as AuthSessionResponse;
      setPassword('');
      setMessage(mode === 'register' ? t('auth.registered') : t('auth.signedIn'));
      onAuthenticated(body.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.unknownError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>{t('auth.title')}</h2>
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <div className={styles.field}>
          <label htmlFor="auth-email">{t('auth.email')}</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        {mode === 'register' && (
          <div className={styles.field}>
            <label htmlFor="auth-name">{t('auth.displayName')}</label>
            <input
              id="auth-name"
              name="displayName"
              type="text"
              autoComplete="name"
              maxLength={80}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
        )}
        <div className={styles.field}>
          <label htmlFor="auth-password">{t('auth.password')}</label>
          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className={styles.hint}>{t('auth.passwordHint')}</p>
        </div>
        <div className={styles.actions}>
          <button type="submit" className={styles.button} disabled={busy}>
            {mode === 'register' ? t('auth.register') : t('auth.login')}
          </button>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
              setMessage(null);
            }}
          >
            {mode === 'login' ? t('auth.needAccount') : t('auth.haveAccount')}
          </button>
        </div>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {message && !error && <p className={styles.muted}>{message}</p>}
    </section>
  );
}
