import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { USER_ROLES, type PublicUser, type UserRole } from '@medbourse/shared';
import {
  createUser,
  listUsers,
  updateUser,
  type Paginated,
  type UserListQuery,
} from '../api';
import styles from './UsersAdminView.module.css';

const PAGE_SIZE = 20;

interface UsersAdminViewProps {
  currentUserId: string;
}

interface CreateDraft {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

const EMPTY_DRAFT: CreateDraft = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
};

/** Super Admin: browse every account and act on roles, status, and new admin logins. */
export default function UsersAdminView({ currentUserId }: UsersAdminViewProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [status, setStatus] = useState<'' | 'active' | 'inactive'>('');
  const [result, setResult] = useState<Paginated<PublicUser> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [draft, setDraft] = useState<CreateDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNote, setCreateNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query: UserListQuery = { page, limit: PAGE_SIZE };
      if (appliedQ) query.q = appliedQ;
      if (role) query.role = role;
      if (status) query.status = status;
      setResult(await listUsers(query));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('usersAdmin.loadError'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [page, appliedQ, role, status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedQ(q.trim());
  }

  async function patch(user: PublicUser, input: { role?: UserRole; isActive?: boolean }) {
    setBusyId(user.id);
    setError(null);
    try {
      const { user: updated } = await updateUser(user.id, input);
      setResult((prev) =>
        prev
          ? { ...prev, data: prev.data.map((row) => (row.id === updated.id ? updated : row)) }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('usersAdmin.loadError'));
    } finally {
      setBusyId(null);
    }
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreateNote(null);
    try {
      await createUser({
        email: draft.email.trim(),
        password: draft.password,
        role: 'admin',
        ...(draft.firstName ? { firstName: draft.firstName } : {}),
        ...(draft.lastName ? { lastName: draft.lastName } : {}),
      });
      setDraft(EMPTY_DRAFT);
      setCreateNote(t('usersAdmin.created'));
      setPage(1);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t('usersAdmin.loadError'));
    } finally {
      setCreating(false);
    }
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.meta.total / PAGE_SIZE)) : 1;

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('usersAdmin.title')}</h2>
      </header>

      <form className={styles.filters} onSubmit={applyFilters}>
        <label className={styles.field}>
          <span>{t('usersAdmin.search')}</span>
          <input
            type="search"
            value={q}
            placeholder={t('usersAdmin.searchPlaceholder')}
            onChange={(event) => setQ(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>{t('usersAdmin.roleFilter')}</span>
          <select value={role} onChange={(event) => setRole(event.target.value as UserRole | '')}>
            <option value="">{t('usersAdmin.allRoles')}</option>
            {USER_ROLES.map((item) => (
              <option key={item} value={item}>
                {t(`roles.${item}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>{t('usersAdmin.statusFilter')}</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as '' | 'active' | 'inactive')}
          >
            <option value="">{t('usersAdmin.allStatuses')}</option>
            <option value="active">{t('usersAdmin.active')}</option>
            <option value="inactive">{t('usersAdmin.inactive')}</option>
          </select>
        </label>
        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={loading}>
            {t('usersAdmin.apply')}
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => void load()}
            disabled={loading}
          >
            {t('usersAdmin.refresh')}
          </button>
        </div>
      </form>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {loading && <p className={styles.muted}>{t('usersAdmin.loading')}</p>}

      {!loading && result && result.data.length === 0 && (
        <p className={styles.muted}>{t('usersAdmin.empty')}</p>
      )}

      {!loading && result && result.data.length > 0 && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('usersAdmin.columns.user')}</th>
                  <th scope="col">{t('usersAdmin.columns.role')}</th>
                  <th scope="col">{t('usersAdmin.columns.status')}</th>
                  <th scope="col">{t('usersAdmin.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row) => {
                  const isSelf = row.id === currentUserId;
                  const rowBusy = busyId === row.id;
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className={styles.userCell}>
                          <span className={styles.userName}>
                            {[row.firstName, row.lastName].filter(Boolean).join(' ') ||
                              row.displayName ||
                              row.email}
                          </span>
                          <span className={styles.userEmail}>{row.email}</span>
                          {isSelf && <span className={styles.selfTag}>{t('usersAdmin.you')}</span>}
                        </div>
                      </td>
                      <td>
                        <select
                          className={styles.roleSelect}
                          value={row.role}
                          disabled={isSelf || rowBusy}
                          onChange={(event) =>
                            void patch(row, { role: event.target.value as UserRole })
                          }
                          aria-label={t('usersAdmin.columns.role')}
                        >
                          {USER_ROLES.map((item) => (
                            <option key={item} value={item}>
                              {t(`roles.${item}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${
                            row.isActive ? styles.statusActive : styles.statusInactive
                          }`}
                        >
                          {row.isActive ? t('usersAdmin.active') : t('usersAdmin.inactive')}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.ghostButton}
                          disabled={isSelf || rowBusy}
                          onClick={() => void patch(row, { isActive: !row.isActive })}
                        >
                          {row.isActive ? t('usersAdmin.deactivate') : t('usersAdmin.activate')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <span className={styles.pageInfo}>
              {t('usersAdmin.pageInfo', { page, totalPages, total: result.meta.total })}
            </span>
            <div className={styles.pageButtons}>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1 || loading}
              >
                {t('usersAdmin.prev')}
              </button>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((value) => value + 1)}
                disabled={page >= totalPages || loading}
              >
                {t('usersAdmin.next')}
              </button>
            </div>
          </div>
        </>
      )}

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t('usersAdmin.createTitle')}</h3>
        <form className={styles.createForm} onSubmit={(event) => void submitCreate(event)}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>{t('auth.email')}</span>
              <input
                type="email"
                required
                value={draft.email}
                onChange={(event) => setDraft((value) => ({ ...value, email: event.target.value }))}
              />
            </label>
            <label className={styles.field}>
              <span>{t('auth.password')}</span>
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={draft.password}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, password: event.target.value }))
                }
              />
            </label>
          </div>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>{t('auth.firstName')}</span>
              <input
                type="text"
                maxLength={60}
                value={draft.firstName}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, firstName: event.target.value }))
                }
              />
            </label>
            <label className={styles.field}>
              <span>{t('auth.lastName')}</span>
              <input
                type="text"
                maxLength={60}
                value={draft.lastName}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, lastName: event.target.value }))
                }
              />
            </label>
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryButton} disabled={creating}>
              {t('usersAdmin.create')}
            </button>
          </div>
        </form>
        {createError && (
          <p className={styles.error} role="alert">
            {createError}
          </p>
        )}
        {createNote && !createError && <p className={styles.note}>{createNote}</p>}
      </div>
    </section>
  );
}
