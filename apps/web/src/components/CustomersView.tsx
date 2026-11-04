import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AssignmentStatus,
  PublicCountryAssignment,
  PublicCustomer,
  PublicUser,
} from '@medbourse/shared';
import {
  createCustomer,
  listCountryAssignments,
  listCustomers,
  type CustomerInput,
  type Paginated,
} from '../api';
import { listCountries } from '../lib/countries';
import CustomerDetailView from './CustomerDetailView';
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

interface CustomersViewProps {
  /** The signed-in admin: a country admin is scoped to their assigned countries. */
  user: PublicUser;
  /** Super Admin only (assignment:manage:super_admin). Enables the reassign control. */
  canReassign?: boolean;
  /** Super Admin only (audit:read:super_admin). Shows the customer's activity history. */
  canViewActivity?: boolean;
  /** Admin+ (case:create:admin). Enables creating a login account and applying on the customer's behalf. */
  canApplyForCustomer?: boolean;
  /** Opens a case from the customer's detail page. */
  onOpenCase?: (caseId: string) => void;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export default function CustomersView({
  user,
  canReassign = false,
  canViewActivity = false,
  canApplyForCustomer = false,
  onOpenCase,
}: CustomersViewProps) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Paginated<PublicCustomer> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<PublicCountryAssignment[]>([]);

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
    let cancelled = false;
    listCountryAssignments()
      .then((res) => {
        if (!cancelled) setAssignments(res.data);
      })
      .catch(() => {
        if (!cancelled) setAssignments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** A country admin may only open customers in the countries assigned to them; super admins see every country. */
  const isCountryScoped = user.role === 'admin';

  const countryOptions = useMemo(() => {
    const all = listCountries(i18n.language);
    if (!isCountryScoped) {
      return all;
    }
    const mine = new Set(
      assignments
        .filter((assignment) => assignment.isActive && assignment.managerUserIds.includes(user.id))
        .map((assignment) => assignment.countryCode),
    );
    return all.filter((country) => mine.has(country.code));
  }, [isCountryScoped, assignments, user.id, i18n.language]);

  /** Keep the visible country selection inside the allowed set as it loads or changes. */
  useEffect(() => {
    if (!isCountryScoped) return;
    const allowed = new Set(countryOptions.map((country) => country.code));
    setForm((value) =>
      allowed.has(value.countryCode)
        ? value
        : { ...value, countryCode: countryOptions[0]?.code ?? '' },
    );
  }, [isCountryScoped, countryOptions]);

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

  if (selectedCustomerId) {
    return (
      <CustomerDetailView
        customerId={selectedCustomerId}
        canReassign={canReassign}
        canViewActivity={canViewActivity}
        canApplyForCustomer={canApplyForCustomer}
        onOpenCase={onOpenCase}
        onBack={() => setSelectedCustomerId(null)}
      />
    );
  }

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
          <select
            value={form.countryCode}
            required
            disabled={countryOptions.length === 0}
            onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
          >
            <option value="" disabled>
              {t('customers.create.countryPlaceholder')}
            </option>
            {countryOptions.map((country) => (
              <option key={country.code} value={country.code}>
                {`${country.flag} ${country.name}`}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={saving || countryOptions.length === 0}
          >
            {saving ? t('customers.create.saving') : t('customers.create.submit')}
          </button>
        </div>
      </form>

      {isCountryScoped && countryOptions.length === 0 && (
        <p className={styles.hint}>{t('customers.create.noCountries')}</p>
      )}

      {createError && (
        <p className={styles.error} role="alert">
          {createError}
        </p>
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

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
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
                </tr>
              </thead>
              <tbody>
                {result.data.map((customer) => (
                  <tr
                    key={customer.id}
                    className={styles.row}
                    onClick={() => setSelectedCustomerId(customer.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCustomerId(customer.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={t('customers.openCustomer', { name: customer.fullName })}
                  >
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
