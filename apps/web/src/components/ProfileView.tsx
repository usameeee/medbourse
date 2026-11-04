import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicUser } from '@medbourse/shared';
import { apiUrl, changePassword, setAvatar, updateProfile, uploadAvatar } from '../api';
import { listCountries } from '../lib/countries';
import styles from './ProfileView.module.css';

interface ProfileViewProps {
  user: PublicUser;
  onUserUpdated: (user: PublicUser) => void;
}

/** Stored media paths are relative; the browser needs an absolute URL to render them. */
function resolveAvatarUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  return url.startsWith('http') ? url : apiUrl(url);
}

function initials(user: PublicUser): string {
  const source = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Self-service profile for every signed-in role: photo, names, and password. */
export default function ProfileView({ user, onUserUpdated }: ProfileViewProps) {
  const { t, i18n } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const avatarUrl = resolveAvatarUrl(user.avatarUrl);
  const countries = useMemo(() => listCountries(i18n.language), [i18n.language]);

  const [firstName, setFirstName] = useState(user.firstName ?? '');
  const [lastName, setLastName] = useState(user.lastName ?? '');
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [countryCode, setCountryCode] = useState(user.countryCode ?? '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileNote, setProfileNote] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNote, setPasswordNote] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function describe(err: unknown): string {
    return err instanceof Error ? err.message : t('profile.unknownError');
  }

  async function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setProfileBusy(true);
    setProfileError(null);
    setProfileNote(null);
    try {
      const { media } = await uploadAvatar(file);
      const { user: updated } = await setAvatar(media.id);
      onUserUpdated(updated);
      setProfileNote(t('profile.avatarUpdated'));
    } catch (err) {
      setProfileError(describe(err));
    } finally {
      setProfileBusy(false);
    }
  }

  async function removeAvatar() {
    setProfileBusy(true);
    setProfileError(null);
    setProfileNote(null);
    try {
      const { user: updated } = await setAvatar(null);
      onUserUpdated(updated);
      setProfileNote(t('profile.avatarRemoved'));
    } catch (err) {
      setProfileError(describe(err));
    } finally {
      setProfileBusy(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError(null);
    setProfileNote(null);
    try {
      const { user: updated } = await updateProfile({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        displayName: displayName.trim() || null,
        countryCode: countryCode || null,
      });
      onUserUpdated(updated);
      setProfileNote(t('profile.saved'));
    } catch (err) {
      setProfileError(describe(err));
    } finally {
      setProfileBusy(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordNote(null);
    if (newPassword.length < 10) {
      setPasswordError(t('auth.errors.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('auth.errors.passwordMismatch'));
      return;
    }
    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNote(t('profile.passwordChanged'));
    } catch (err) {
      setPasswordError(describe(err));
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('profile.title')}</h2>
      </header>

      <div className={styles.card}>
        <div className={styles.identity}>
          <div className={styles.avatar}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className={styles.avatarImage} />
            ) : (
              <span className={styles.avatarInitials}>{initials(user)}</span>
            )}
          </div>
          <div className={styles.identityText}>
            <p className={styles.identityName}>
              {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
            </p>
            <p className={styles.identityMeta}>
              <span className={styles.roleBadge}>{t(`roles.${user.role}`)}</span>
              <span>{user.email}</span>
              {user.emailVerified && (
                <span className={styles.verifiedBadge}>{t('profile.emailVerified')}</span>
              )}
            </p>
            <div className={styles.avatarActions}>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className={styles.hiddenInput}
                onChange={(event) => void handleAvatar(event)}
              />
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => fileInput.current?.click()}
                disabled={profileBusy}
              >
                {t('profile.changePhoto')}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => void removeAvatar()}
                  disabled={profileBusy}
                >
                  {t('profile.removePhoto')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t('profile.details')}</h3>
        <form className={styles.form} onSubmit={(event) => void saveProfile(event)}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>{t('auth.firstName')}</span>
              <input
                type="text"
                maxLength={60}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>{t('auth.lastName')}</span>
              <input
                type="text"
                maxLength={60}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span>{t('profile.displayName')}</span>
            <input
              type="text"
              maxLength={80}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>{t('profile.country')}</span>
            <select value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
              <option value="">{t('profile.countryPlaceholder')}</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.flag} {country.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>{t('auth.email')}</span>
            <input type="email" value={user.email} readOnly disabled />
          </label>
          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryButton} disabled={profileBusy}>
              {t('profile.save')}
            </button>
          </div>
        </form>
        {profileError && (
          <p className={styles.error} role="alert">
            {profileError}
          </p>
        )}
        {profileNote && !profileError && <p className={styles.note}>{profileNote}</p>}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t('profile.changePassword')}</h3>
        <form className={styles.form} onSubmit={(event) => void savePassword(event)}>
          <label className={styles.field}>
            <span>{t('profile.currentPassword')}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>{t('auth.newPassword')}</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>{t('auth.confirmPassword')}</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          </div>
          <p className={styles.hint}>{t('auth.passwordHint')}</p>
          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryButton} disabled={passwordBusy}>
              {t('profile.changePassword')}
            </button>
          </div>
        </form>
        {passwordError && (
          <p className={styles.error} role="alert">
            {passwordError}
          </p>
        )}
        {passwordNote && !passwordError && <p className={styles.note}>{passwordNote}</p>}
      </div>
    </section>
  );
}
