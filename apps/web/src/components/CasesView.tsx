import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicCase } from '@medbourse/shared';
import { listCases, type CaseListQuery, type Paginated } from '../api';
import { CaseStatusBadge, CategoryBadge } from './StatusBadge';
import CaseDetailView from './CaseDetailView';
import NewApplicationView from './NewApplicationView';
import styles from './CasesView.module.css';

const PAGE_SIZE = 20;

interface CasesViewProps {
  currentUserId?: string;
  /** True for accounts holding `case:create:self`; enables self-service intake. */
  canApply?: boolean;
  /** Country from the signed-in profile, used to prefill the application form. */
  defaultCountryCode?: string;
  /** A case to open straight away, e.g. when its notification is clicked. */
  focusCaseId?: string | null;
  /** Called once `focusCaseId` has been consumed so the caller can clear it. */
  onFocusHandled?: () => void;
}

export default function CasesView({
  currentUserId,
  canApply = false,
  defaultCountryCode,
  focusCaseId,
  onFocusHandled,
}: CasesViewProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<CaseListQuery['status'] | ''>('');
  const [category, setCategory] = useState<CaseListQuery['category'] | ''>('');
  const [result, setResult] = useState<Paginated<PublicCase> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query: CaseListQuery = { page, limit: PAGE_SIZE };
      if (status) query.status = status;
      if (category) query.category = category;
      const data = await listCases(query);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('cases.loadError'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [page, status, category, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusCaseId) return;
    // A notification asked for this case: open it and let the caller clear the request.
    setComposing(false);
    setSelectedCaseId(focusCaseId);
    onFocusHandled?.();
  }, [focusCaseId, onFocusHandled]);

  if (composing) {
    return (
      <NewApplicationView
        defaultCountryCode={defaultCountryCode}
        onCancel={() => setComposing(false)}
        onCreated={(caseId) => {
          setComposing(false);
          setPage(1);
          setStatus('');
          setCategory('');
          setSelectedCaseId(caseId);
        }}
      />
    );
  }

  if (selectedCaseId) {
    return (
      <CaseDetailView
        caseId={selectedCaseId}
        currentUserId={currentUserId}
        canApply={canApply}
        onBack={() => setSelectedCaseId(null)}
      />
    );
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.meta.total / PAGE_SIZE)) : 1;
  const unfiltered = !status && !category;
  const showWelcome = canApply && unfiltered && !loading && result?.data.length === 0;

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('cases.title')}</h2>
        {canApply && (
          <button
            type="button"
            className={styles.applyButton}
            onClick={() => setComposing(true)}
          >
            {t('cases.startApplication')}
          </button>
        )}
      </header>

      {!showWelcome && (
        <div className={styles.filters}>
          <label className={styles.field}>
            <span>{t('cases.filters.status')}</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as CaseListQuery['status'] | '');
                setPage(1);
              }}
            >
              <option value="">{t('cases.filters.all')}</option>
              <option value="open">{t('cases.status.open')}</option>
              <option value="closed">{t('cases.status.closed')}</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>{t('cases.filters.category')}</span>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as CaseListQuery['category'] | '');
                setPage(1);
              }}
            >
              <option value="">{t('cases.filters.all')}</option>
              <option value="education">{t('categories.education')}</option>
              <option value="medical">{t('categories.medical')}</option>
              <option value="tourism">{t('categories.tourism')}</option>
            </select>
          </label>

          <button type="button" className={styles.refreshButton} onClick={() => void load()} disabled={loading}>
            {t('cases.refresh')}
          </button>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {loading && <p className={styles.muted}>{t('cases.loading')}</p>}

      {showWelcome && (
        <div className={styles.welcome}>
          <h3 className={styles.welcomeTitle}>{t('cases.welcomeTitle')}</h3>
          <p className={styles.welcomeBody}>{t('cases.welcomeBody')}</p>
          <ol className={styles.steps}>
            <li>{t('cases.welcomeStep1')}</li>
            <li>{t('cases.welcomeStep2')}</li>
            <li>{t('cases.welcomeStep3')}</li>
          </ol>
          <button type="button" className={styles.applyButton} onClick={() => setComposing(true)}>
            {t('cases.startApplication')}
          </button>
        </div>
      )}

      {!loading && !showWelcome && result && result.data.length === 0 && (
        <p className={styles.muted}>{t('cases.empty')}</p>
      )}

      {!loading && result && result.data.length > 0 && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('cases.columns.offering')}</th>
                  <th scope="col">{t('cases.columns.category')}</th>
                  <th scope="col">{t('cases.columns.status')}</th>
                  <th scope="col">{t('cases.columns.created')}</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((item) => (
                  <tr
                    key={item.id}
                    className={styles.row}
                    onClick={() => setSelectedCaseId(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCaseId(item.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={t('cases.openCase', { title: item.offeringTitle })}
                  >
                    <td className={styles.titleCell}>{item.offeringTitle}</td>
                    <td>
                      <CategoryBadge category={item.category} />
                    </td>
                    <td>
                      <div className={styles.statusCell}>
                        <CaseStatusBadge status={item.status} />
                        {item.submittedAt === null && (
                          <span className={styles.draftPill}>{t('cases.draftBadge')}</span>
                        )}
                      </div>
                    </td>
                    <td className={styles.dateCell}>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(item.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <span className={styles.pageInfo}>
              {t('cases.pageInfo', { page, totalPages, total: result.meta.total })}
            </span>
            <div className={styles.pageButtons}>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                {t('cases.prev')}
              </button>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages || loading}
              >
                {t('cases.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
