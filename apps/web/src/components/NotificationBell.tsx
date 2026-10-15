import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NotificationType, PublicNotification } from '@medbourse/shared';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api';
import styles from './NotificationBell.module.css';

const TYPE_KEYS = {
  'case.message_created': 'notifications.types.messageCreated',
  'case.workflow_stage_transitioned': 'notifications.types.stageTransitioned',
  'case.closed': 'notifications.types.caseClosed',
  'payment_evidence.submitted': 'notifications.types.paymentSubmitted',
  'payment_evidence.approved': 'notifications.types.paymentApproved',
  'payment_evidence.rejected': 'notifications.types.paymentRejected',
} as const satisfies Record<NotificationType, string>;

const PANEL_LIMIT = 15;

function BellIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default function NotificationBell() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PublicNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listNotifications({ limit: PANEL_LIMIT });
      setItems(res.data);
      setUnread(res.meta.unread);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('notifications.loadError'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Load the initial unread count once; the panel refreshes on open.
    void load();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onDocumentClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [open]);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await load();
    }
  }

  async function handleRead(item: PublicNotification) {
    if (item.readAt) {
      return;
    }
    try {
      await markNotificationRead(item.id);
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnread((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('notifications.loadError'));
    }
  }

  async function handleReadAll() {
    try {
      const res = await markAllNotificationsRead();
      if (res.updated > 0) {
        setItems((prev) =>
          prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
        );
        setUnread(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('notifications.loadError'));
    }
  }

  const formatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.bell}
        onClick={handleToggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('notifications.title')}
      >
        <BellIcon />
        {unread > 0 && <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>{t('notifications.title')}</span>
            <button
              type="button"
              className={styles.markAll}
              onClick={handleReadAll}
              disabled={unread === 0}
            >
              {t('notifications.markAllRead')}
            </button>
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          {loading ? (
            <p className={styles.muted}>{t('notifications.loading')}</p>
          ) : items.length === 0 ? (
            <p className={styles.muted}>{t('notifications.empty')}</p>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={styles.item}
                    data-unread={item.readAt ? undefined : 'true'}
                    onClick={() => handleRead(item)}
                  >
                    <span className={styles.itemText}>
                      {t(TYPE_KEYS[item.type])}
                    </span>
                    <time className={styles.itemTime} dateTime={item.createdAt}>
                      {formatter.format(new Date(item.createdAt))}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
