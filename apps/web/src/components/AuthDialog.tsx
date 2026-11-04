import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PublicUser } from '@medbourse/shared';
import AuthPanel from './AuthPanel';
import styles from './AuthDialog.module.css';

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (user: PublicUser) => void;
}

/** Modal host for the sign-in / register form; the public page never inlines it. */
export default function AuthDialog({ open, onClose, onAuthenticated }: AuthDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  /**
   * Sign-up (OTP verify) and password reset already return a session, so the user is
   * signed in the moment this fires. Dismiss the modal and drop them into the portal
   * instead of leaving the form open behind a session they cannot see.
   */
  function handleAuthenticated(user: PublicUser) {
    onAuthenticated(user);
    onClose();
    navigate('/');
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={t('auth.title')}
      onCancel={onClose}
      onClose={onClose}
    >
      <button type="button" className={styles.close} onClick={onClose} aria-label={t('auth.close')}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && <AuthPanel onAuthenticated={handleAuthenticated} />}
    </dialog>
  );
}
