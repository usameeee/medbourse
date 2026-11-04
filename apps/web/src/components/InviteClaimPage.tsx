import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PublicUser } from '@medbourse/shared';
import { claimInvitation } from '../api';
import Reveal from './Reveal';
import pageStyles from './PublicPages.module.css';
import styles from './InviteClaimPage.module.css';

interface InviteClaimPageProps {
  onAuthenticated: (user: PublicUser) => void;
}

/**
 * Office flow, customer side: an admin opened a password-less account on their behalf and sent the
 * invitation link. Opening the link lets the customer set a password, which activates the account
 * and signs them straight into their own portal.
 */
export default function InviteClaimPage({ onAuthenticated }: InviteClaimPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setError(t('invitePage.mismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await claimInvitation({ token, password });
      onAuthenticated(session.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('invitePage.error'));
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className={pageStyles.page}>
        <p className={styles.error} role="alert">
          {t('invitePage.missingToken')}
        </p>
      </div>
    );
  }

  return (
    <div className={pageStyles.page}>
      <Reveal className={styles.card}>
        <p className={styles.eyebrow}>{t('invitePage.eyebrow')}</p>
        <h1 className={styles.title}>{t('invitePage.title')}</h1>
        <p className={styles.lead}>{t('invitePage.lead')}</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            <span>{t('invitePage.newPassword')}</span>
            <input
              type="password"
              value={password}
              required
              minLength={10}
              maxLength={200}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <small className={styles.hint}>{t('invitePage.hint')}</small>
          </label>
          <label className={styles.field}>
            <span>{t('invitePage.confirmPassword')}</span>
            <input
              type="password"
              value={confirm}
              required
              minLength={10}
              maxLength={200}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button type="submit" className={styles.submit} disabled={busy}>
            {busy ? t('invitePage.saving') : t('invitePage.submit')}
          </button>
        </form>
      </Reveal>
    </div>
  );
}
