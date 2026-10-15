import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AssignmentStatus,
  PublicCustomer,
  PublicInvitation,
  PublicUser,
} from '@medbourse/shared';
import {
  createCustomer,
  inviteCustomer,
  listCustomers,
  listManagers,
  reassignCustomer,
  type CustomerInput,
  type Paginated,
} from '../api';
import styles from './CustomersView.module.css';

const PAGE_SIZE = 20;

const ASSIGNMENT_KEYS = {
  unassigned: 'customers.assignment.unassigned',
  assigned: 'customers.assignment.assigned',
  exception: 'customers.assignment.exception',
} as const satisfies Record<AssignmentStatus, string>;

const ASSIGNMENT_CLASS: Record<AssignmentStatus, string> = {
  unassigned: styles.pillUnassigned,
  assigned: styles.pillAssigned,
  exception: styles.pillException,
};

interface CustomerForm {
  fullName: string;
  email: string;
  phone: string;
  countryCode: string;
}

const emptyForm = (): CustomerForm => ({ fullName: '', email: '', phone: '', countryCode: '' });

interface IssuedInvitation {
  customerName: string;
  invitation: PublicInvitation;
  token: string;
}

interface ReassignTarget {
  customer: PublicCustomer;
  managerUserId: string;
  reason: string;
}

interface CustomersViewProps {
  /** Admin-only capability (assignment:manage:admin). Enables the reassign control. */
  canReassign?: boolean;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export default function CustomersView({ canReassign = false }: CustomersViewProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Paginated<PublicCustomer> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [pendingInvite, setPendingInvite] = useState<{ customer: PublicCustomer; email: string } | null>(
    null,
  );
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);

  const [managers, setManagers] = useState<PublicUser[]>([]);
  const [reassignTarget, setReassignTarget] = useState<ReassignTarget | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignedName, setReassignedName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCustomers(
        query ? { page, limit: PAGE_SIZE, q: query } : { page, limit: PAGE_SIZE },
      );
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('customers.loadError'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [page, query, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canReassign) return;
    let active = true;
    listManagers()
      .then((res) => {
        if (active) setManagers(res.data);
      })
      .catch(() => {
        if (active) setManagers([]);
      });
    return () => {
      active = false;
    };
  }, [canReassign]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setCreateError(null);
    try {
      const payload: CustomerInput = {
        fullName: form.fullName.trim(),
        countryCode: form.countryCode.trim().toUpperCase(),
      };
      const email = form.email.trim();
      const phone = form.phone.trim();
      if (email) payload.email = email;
      if (phone) payload.phone = phone;
      await createCustomer(payload);
      setForm(emptyForm());
      setPage(1);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t('customers.create.error'));
    } finally {
      setSaving(false);
    }
  }

  function startInvite(customer: PublicCustomer) {
    setIssued(null);
    setInviteError(null);
    if (customer.email) {
      void issueInvite(customer, undefined);
    } else {
      setPendingInvite({ customer, email: '' });
    }
  }

  async function issueInvite(customer: PublicCustomer, email?: string) {
    setInviting(true);
    setInviteError(null);
    try {
      const data = await inviteCustomer(customer.id, email);
      setIssued({ customerName: customer.fullName, invitation: data.invitation, token: data.token });
      setPendingInvite(null);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : t('customers.invite.error'));
    } finally {
      setInviting(false);
    }
  }

  function startReassign(customer: PublicCustomer) {
    setReassignedName(null);
    setReassignError(null);
    setReassignTarget({ customer, managerUserId: '', reason: '' });
  }

  async function submitReassign(event: FormEvent) {
    event.preventDefault();
    if (!reassignTarget) return;
    setReassigning(true);
    setReassignError(null);
    try {
      await reassignCustomer(
        reassignTarget.customer.id,
        reassignTarget.managerUserId,
        reassignTarget.reason.trim(),
      );
      setReassignedName(reassignTarget.customer.fullName);
      setReassignTarget(null);
      await load();
    } catch (err) {
      setReassignError(err instanceof Error ? err.message : t('customers.reassign.error'));
    } finally {
      setReassigning(false);
    }
  }

  const showReassign = canReassign && managers.length > 0;
  const totalPages = result ? Math.max(1, Math.ceil(result.meta.total / PAGE_SIZE)) : 1;

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('customers.title')}</h2>
        <button type="button" className={styles.ghostButton} onClick={() => void load()} disabled={loading}>
          {t('customers.refresh')}
        </button>
      </header>

      <form className={styles.form} onSubmit={submitCreate}>
        <label className={styles.field}>
          <span>{t('customers.create.fullName')}</span>
          <input
            type="text"
            value={form.fullName}
            required
            maxLength={120}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{t('customers.create.email')}</span>
          <input
            type="email"
            value={form.email}
            maxLength={160}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{t('customers.create.phone')}</span>
          <input
            type="tel"
            value={form.phone}
            maxLength={32}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{t('customers.create.country')}</span>
          <input
            type="text"
            value={form.countryCode}
            required
            maxLength={2}
            pattern="[A-Za-z]{2}"
            onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
          />
        </label>
        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {saving ? t('customers.create.saving') : t('customers.create.submit')}
          </button>
        </div>
      </form>

      {createError && (
        <p className={styles.error} role="alert">
          {createError}
        </p>
      )}

      {issued && (
        <div className={styles.tokenPanel} role="status">
          <p className={styles.tokenTitle}>
            {t('customers.invite.created', { email: issued.invitation.email })}
          </p>
          <p className={styles.tokenHint}>{t('customers.invite.tokenHint')}</p>
          <code className={styles.token}>{issued.token}</code>
          <p className={styles.tokenMeta}>
            {t('customers.invite.expiresAt', { date: formatDate(issued.invitation.expiresAt) })}
          </p>
          <button type="button" className={styles.ghostButton} onClick={() => setIssued(null)}>
            {t('customers.invite.dismiss')}
          </button>
        </div>
      )}

      <form className={styles.filters} onSubmit={submitSearch}>
        <label className={styles.field}>
          <span>{t('customers.search')}</span>
          <input
            type="search"
            value={searchInput}
            maxLength={80}
            placeholder={t('customers.searchPlaceholder')}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
        <button type="submit" className={styles.ghostButton} disabled={loading}>
          {t('customers.apply')}
        </button>
      </form>

      {inviteError && (
        <p className={styles.error} role="alert">
          {inviteError}
        </p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {reassignError && (
        <p className={styles.error} role="alert">
          {reassignError}
        </p>
      )}

      {reassignedName && (
        <p className={styles.notice} role="status">
          {t('customers.reassign.success', { name: reassignedName })}
        </p>
      )}

      {reassignTarget && (
        <form className={styles.reassignPanel} onSubmit={submitReassign}>
          <p className={styles.tokenTitle}>
            {t('customers.reassign.title', { name: reassignTarget.customer.fullName })}
          </p>
          <div className={styles.reassignFields}>
            <label className={styles.field}>
              <span>{t('customers.reassign.manager')}</span>
              <select
                value={reassignTarget.managerUserId}
                required
                onChange={(e) =>
                  setReassignTarget({ ...reassignTarget, managerUserId: e.target.value })
                }
              >
                <option value="" disabled>
                  {t('customers.reassign.managerPlaceholder')}
                </option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {`${manager.displayName ?? manager.email} · ${t(`roles.${manager.role}`)}`}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>{t('customers.reassign.reason')}</span>
              <input
                type="text"
                value={reassignTarget.reason}
                required
                minLength={3}
                maxLength={500}
                onChange={(e) => setReassignTarget({ ...reassignTarget, reason: e.target.value })}
              />
            </label>
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryButton} disabled={reassigning}>
              {reassigning ? t('customers.reassign.saving') : t('customers.reassign.submit')}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => setReassignTarget(null)}
              disabled={reassigning}
            >
              {t('customers.reassign.cancel')}
            </button>
          </div>
        </form>
      )}

      {loading && <p className={styles.muted}>{t('customers.loading')}</p>}

      {!loading && result && result.data.length === 0 && (
        <p className={styles.muted}>{t('customers.empty')}</p>
      )}

      {!loading && result && result.data.length > 0 && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('customers.columns.name')}</th>
                  <th scope="col">{t('customers.columns.email')}</th>
                  <th scope="col">{t('customers.columns.phone')}</th>
                  <th scope="col">{t('customers.columns.country')}</th>
                  <th scope="col">{t('customers.columns.assignment')}</th>
                  <th scope="col">{t('customers.columns.created')}</th>
                  <th scope="col">{t('customers.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((customer) => (
                  <tr key={customer.id}>
                    <td className={styles.titleCell}>{customer.fullName}</td>
                    <td>{customer.email ?? <span className={styles.mutedInline}>—</span>}</td>
                    <td>{customer.phone ?? <span className={styles.mutedInline}>—</span>}</td>
                    <td>{customer.countryCode}</td>
                    <td>
                      <span className={`${styles.pill} ${ASSIGNMENT_CLASS[customer.assignmentStatus]}`}>
                        {t(ASSIGNMENT_KEYS[customer.assignmentStatus])}
                      </span>
                    </td>
                    <td className={styles.dateCell}>{formatDate(customer.createdAt)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        {pendingInvite?.customer.id === customer.id ? (
                          <form
                            className={styles.inlineInvite}
                            onSubmit={(e) => {
                              e.preventDefault();
                              void issueInvite(customer, pendingInvite.email);
                            }}
                          >
                            <input
                              type="email"
                              className={styles.inlineField}
                              value={pendingInvite.email}
                              required
                              maxLength={160}
                              placeholder={t('customers.invite.emailLabel')}
                              onChange={(e) =>
                                setPendingInvite({ customer, email: e.target.value })
                              }
                            />
                            <button type="submit" className={styles.linkButton} disabled={inviting}>
                              {inviting ? t('customers.invite.sending') : t('customers.invite.send')}
                            </button>
                            <button
                              type="button"
                              className={styles.linkButton}
                              onClick={() => setPendingInvite(null)}
                              disabled={inviting}
                            >
                              {t('customers.invite.cancel')}
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className={styles.linkButton}
                            onClick={() => startInvite(customer)}
                            disabled={inviting}
                          >
                            {t('customers.invite.action')}
                          </button>
                        )}
                        {showReassign && (
                          <button
                            type="button"
                            className={styles.linkButton}
                            onClick={() => startReassign(customer)}
                            disabled={reassigning}
                          >
                            {t('customers.reassign.action')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <span className={styles.pageInfo}>
              {t('customers.pageInfo', { page, totalPages, total: result.meta.total })}
            </span>
            <div className={styles.pageButtons}>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                {t('customers.prev')}
              </button>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages || loading}
              >
                {t('customers.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
