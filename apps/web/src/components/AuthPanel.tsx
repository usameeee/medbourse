import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicUser } from '@medbourse/shared';
import {
  forgotPassword,
  requestSignup,
  resetPassword,
  apiUrl,
  parseApiError,
  verifySignup,
  type ApiError,
} from '../api';
import { guessCountryCode, listCountries } from '../lib/countries';
import styles from './AuthPanel.module.css';

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

interface AuthPanelProps {
  onAuthenticated: (user: PublicUser) => void;
}

/** Server error codes we have translated copy for; anything else falls back to the raw message. */
const ERROR_KEYS = {
  EMAIL_IN_USE: 'auth.errors.emailInUse',
  INVALID_CREDENTIALS: 'auth.errors.invalidCredentials',
  CODE_INVALID: 'auth.errors.codeInvalid',
  CODE_EXPIRED: 'auth.errors.codeExpired',
  CODE_NOT_FOUND: 'auth.errors.codeNotFound',
  CODE_TOO_MANY_ATTEMPTS: 'auth.errors.codeTooManyAttempts',
  INVALID_INVITATION: 'auth.errors.invalidInvitation',
  INVALID_PASSWORD: 'auth.errors.invalidPassword',
} as const;

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {!open && (
        <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const { t, i18n } = useTranslation();
  const countries = useMemo(() => listCountries(i18n.language), [i18n.language]);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [countryCode, setCountryCode] = useState(() => guessCountryCode() ?? '');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
    setCode('');
    setPassword('');
    setConfirmPassword('');
  }

  function describeError(err: unknown): string {
    const code = err instanceof Error ? (err as ApiError).code : undefined;
    if (code && code in ERROR_KEYS) {
      return t(ERROR_KEYS[code as keyof typeof ERROR_KEYS]);
    }
    return err instanceof Error ? err.message : t('auth.unknownError');
  }

  function guardPasswords(): boolean {
    if (password.length < 10) {
      setError(t('auth.errors.passwordTooShort'));
      return false;
    }
    if (password !== confirmPassword) {
      setError(t('auth.errors.passwordMismatch'));
      return false;
    }
    return true;
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    const res = await fetch(apiUrl('/auth/login'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setError(await parseApiError(res));
      return;
    }
    const body = (await res.json()) as { user: PublicUser };
    setPassword('');
    setMessage(t('auth.signedIn'));
    onAuthenticated(body.user);
  }

  async function submitSignup(event: FormEvent) {
    event.preventDefault();
    if (!guardPasswords()) return;
    await requestSignup({
      email,
      password,
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(countryCode ? { countryCode } : {}),
    });
    setPassword('');
    setConfirmPassword('');
    setMessage(t('auth.codeSent'));
    setMode('verify');
  }

  async function submitVerify(event: FormEvent) {
    event.preventDefault();
    const body = await verifySignup(email, code);
    setMessage(t('auth.registered'));
    onAuthenticated(body.user);
  }

  async function submitForgot(event: FormEvent) {
    event.preventDefault();
    await forgotPassword(email);
    setMessage(t('auth.resetCodeSent'));
    setMode('reset');
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault();
    if (!guardPasswords()) return;
    const body = await resetPassword(email, code, password);
    setPassword('');
    setConfirmPassword('');
    setMessage(t('auth.passwordReset'));
    onAuthenticated(body.user);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === 'login') await submitLogin(event);
      else if (mode === 'register') await submitSignup(event);
      else if (mode === 'verify') await submitVerify(event);
      else if (mode === 'forgot') await submitForgot(event);
      else await submitReset(event);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const titleKey =
    mode === 'verify'
      ? 'auth.verifyTitle'
      : mode === 'forgot'
        ? 'auth.forgotTitle'
        : mode === 'reset'
          ? 'auth.resetTitle'
          : 'auth.title';

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>{t(titleKey)}</h2>
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        {mode === 'verify' || mode === 'reset' ? (
          <p className={styles.hint}>{t('auth.codeSentTo', { email })}</p>
        ) : null}

        {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
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
        )}

        {mode === 'register' && (
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="auth-first">{t('auth.firstName')}</label>
              <input
                id="auth-first"
                name="firstName"
                type="text"
                autoComplete="given-name"
                maxLength={60}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="auth-last">{t('auth.lastName')}</label>
              <input
                id="auth-last"
                name="lastName"
                type="text"
                autoComplete="family-name"
                maxLength={60}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
          </div>
        )}

        {mode === 'register' && (
          <div className={styles.field}>
            <label htmlFor="auth-country">{t('auth.country')}</label>
            <select
              id="auth-country"
              name="countryCode"
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
            >
              <option value="">{t('auth.countryPlaceholder')}</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.flag} {country.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === 'verify' || mode === 'reset' ? (
          <div className={styles.field}>
            <label htmlFor="auth-code">{t('auth.code')}</label>
            <input
              id="auth-code"
              name="code"
              className={styles.codeInput}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
        ) : null}

        {mode !== 'forgot' && mode !== 'verify' && (
          <div className={styles.field}>
            <label htmlFor="auth-password">
              {mode === 'reset' ? t('auth.newPassword') : t('auth.password')}
            </label>
            <div className={styles.passwordWrap}>
              <input
                id="auth-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={10}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                aria-pressed={showPassword}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
            {(mode === 'register' || mode === 'reset') && (
              <p className={styles.hint}>{t('auth.passwordHint')}</p>
            )}
          </div>
        )}

        {(mode === 'register' || mode === 'reset') && (
          <div className={styles.field}>
            <label htmlFor="auth-confirm">{t('auth.confirmPassword')}</label>
            <div className={styles.passwordWrap}>
              <input
                id="auth-confirm"
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={10}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button type="submit" className={styles.button} disabled={busy}>
            {mode === 'login' && t('auth.login')}
            {mode === 'register' && t('auth.register')}
            {mode === 'verify' && t('auth.verify')}
            {mode === 'forgot' && t('auth.sendCode')}
            {mode === 'reset' && t('auth.resetPassword')}
          </button>
          {mode === 'login' && (
            <button type="button" className={styles.linkButton} onClick={() => go('register')}>
              {t('auth.needAccount')}
            </button>
          )}
          {mode === 'register' && (
            <button type="button" className={styles.linkButton} onClick={() => go('login')}>
              {t('auth.haveAccount')}
            </button>
          )}
          {mode === 'login' && (
            <button type="button" className={styles.linkButton} onClick={() => go('forgot')}>
              {t('auth.forgotLink')}
            </button>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <button type="button" className={styles.linkButton} onClick={() => go('login')}>
              {t('auth.backToLogin')}
            </button>
          )}
          {mode === 'verify' && (
            <button type="button" className={styles.linkButton} onClick={() => go('login')}>
              {t('auth.backToLogin')}
            </button>
          )}
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
