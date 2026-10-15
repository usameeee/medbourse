import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicAuditLog } from '@medbourse/shared';
import { listAuditLogs, type AuditListQuery, type Paginated } from '../api';
import styles from './AuditView.module.css';

const PAGE_SIZE = 20;

interface AuditFilters {
  action: string;
  entityType: string;
  actorUserId: string;
}

const EMPTY_FILTERS: AuditFilters = { action: '', entityType: '', actorUserId: '' };

export default function AuditView() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<AuditFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>(EMPTY_FILTERS);
  const [result, setResult] = useState<Paginated<PublicAuditLog> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query: AuditListQuery = { page, limit: PAGE_SIZE };
      if (applied.action) query.action = applied.action;
      if (applied.entityType) query.entityType = applied.entityType;
      if (applied.actorUserId) query.actorUserId = applied.actorUserId;
      const data = await listAuditLogs(query);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('audit.loadError'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [page, applied, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setApplied({
      action: draft.action.trim(),
      entityType: draft.entityType.trim(),
      actorUserId: draft.actorUserId.trim(),
    });
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.meta.total / PAGE_SIZE)) : 1;

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('audit.title')}</h2>
      </header>

      <form className={styles.filters} onSubmit={applyFilters}>
        <label className={styles.field}>
          <span>{t('audit.filters.action')}</span>
          <input
            type="text"
            value={draft.action}
            placeholder={t('audit.filters.all')}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
          />
        </label>

        <label className={styles.field}>
          <span>{t('audit.filters.entityType')}</span>
          <input
            type="text"
            value={draft.entityType}
            placeholder={t('audit.filters.all')}
            onChange={(e) => setDraft((d) => ({ ...d, entityType: e.target.value }))}
          />
        </label>

        <label className={styles.field}>
          <span>{t('audit.filters.actorUserId')}</span>
          <input
            type="text"
            value={draft.actorUserId}
            placeholder={t('audit.filters.all')}
            onChange={(e) => setDraft((d) => ({ ...d, actorUserId: e.target.value }))}
          />
        </label>

        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={loading}>
            {t('audit.apply')}
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => void load()}
            disabled={loading}
          >
            {t('audit.refresh')}
          </button>
        </div>
      </form>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {loading && <p className={styles.muted}>{t('audit.loading')}</p>}

      {!loading && result && result.data.length === 0 && (
        <p className={styles.muted}>{t('audit.empty')}</p>
      )}

      {!loading && result && result.data.length > 0 && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('audit.columns.created')}</th>
                  <th scope="col">{t('audit.columns.action')}</th>
                  <th scope="col">{t('audit.columns.entityType')}</th>
                  <th scope="col">{t('audit.columns.entityId')}</th>
                  <th scope="col">{t('audit.columns.actor')}</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((entry) => (
                  <tr key={entry.id}>
                    <td className={styles.dateCell}>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(entry.createdAt))}
                    </td>
                    <td className={styles.actionCell}>{entry.action}</td>
                    <td>{entry.entityType}</td>
                    <td className={styles.monoCell}>{entry.entityId}</td>
                    <td className={styles.monoCell}>
                      {entry.actorUserId ?? t('audit.system')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <span className={styles.pageInfo}>
              {t('audit.pageInfo', { page, totalPages, total: result.meta.total })}
            </span>
            <div className={styles.pageButtons}>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                {t('audit.prev')}
              </button>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages || loading}
              >
                {t('audit.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
