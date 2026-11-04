import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AppLocale,
  AssignmentStatus,
  CustomerAccountStatus,
  LocalizedText,
  PublicAuditLog,
  PublicCase,
  PublicCustomer,
  PublicInvitation,
  PublicOffering,
  PublicUser,
  ServiceCategory,
} from '@medbourse/shared';
import {
  createCaseForCustomer,
  getCustomer,
  inviteCustomer,
  listAuditLogs,
  listCases,
  listManagers,
  listOfferings,
  provisionCustomerAccount,
  reassignCustomer,
  type Paginated,
} from '../api';
import { CaseStatusBadge, CategoryBadge } from './StatusBadge';
import styles from './CustomerDetailView.module.css';

const CASE_LIMIT = 50;
const ACTIVITY_LIMIT = 30;

/** Categories an admin can pick when opening a case on the customer's behalf. */
const CATEGORIES: readonly ServiceCategory[] = ['education', 'medical', 'tourism'];

/** Reads one locale from a localized value, falling back to English. */
function pickLocalized(value: LocalizedText, locale: AppLocale): string {
  return (value[locale] || value.en || '').trim();
}

/** The public link the customer opens to claim the invitation and set their password. */
function claimUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

const ACCOUNT_KEYS = {
  none: 'customers.account.none',
  unclaimed: 'customers.account.unclaimed',
  active: 'customers.account.active',
} as const satisfies Record<CustomerAccountStatus, string>;

const ACCOUNT_CLASS: Record<CustomerAccountStatus, string> = {
  none: styles.pillUnassigned,
  unclaimed: styles.pillException,
  active: styles.pillAssigned,
};

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

interface CustomerDetailViewProps {
  customerId: string;
  /** Super Admin only: shows the reassign control. */
  canReassign?: boolean;
  /** Super Admin only: shows the customer's activity history. */
  canViewActivity?: boolean;
  /** Admin+ (case:create:admin): shows the "apply on the customer's behalf" control. */
  canApplyForCustomer?: boolean;
  /** Opens a case in the cases tab. */
  onOpenCase?: (caseId: string) => void;
  onBack: () => void;
}

interface IssuedInvitation {
  customerName: string;
  invitation: PublicInvitation;
  token: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; customer: PublicCustomer }
  | { kind: 'error'; message: string };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export default function CustomerDetailView({
  customerId,
  canReassign = false,
  canViewActivity = false,
  canApplyForCustomer = false,
  onOpenCase,
  onBack,
}: CustomerDetailViewProps) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language.split('-')[0] || 'en') as AppLocale;
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const [cases, setCases] = useState<Paginated<PublicCase> | null>(null);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [activity, setActivity] = useState<PublicAuditLog[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  const [managers, setManagers] = useState<PublicUser[]>([]);
  const [reassigning, setReassigning] = useState(false);
  const [reassignManagerId, setReassignManagerId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [reassignBusy, setReassignBusy] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignNotice, setReassignNotice] = useState<string | null>(null);

  const [pendingInviteEmail, setPendingInviteEmail] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);

  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);

  const [applying, setApplying] = useState(false);
  const [applyCategory, setApplyCategory] = useState<ServiceCategory>('education');
  const [applyOfferings, setApplyOfferings] = useState<PublicOffering[]>([]);
  const [applyOfferingId, setApplyOfferingId] = useState('');
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  const loadCustomer = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) setState({ kind: 'loading' });
      try {
        const { customer } = await getCustomer(customerId);
        setState({ kind: 'ok', customer });
      } catch (err) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : t('customers.detail.loadError'),
        });
      }
    },
    [customerId, t],
  );

  useEffect(() => {
    void loadCustomer(true);
  }, [loadCustomer]);

  const loadCases = useCallback(async () => {
    setCasesError(null);
    try {
      setCases(await listCases({ customerId, limit: CASE_LIMIT }));
    } catch (err) {
      setCasesError(err instanceof Error ? err.message : t('customers.detail.casesError'));
      setCases(null);
    }
  }, [customerId, t]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (!canViewActivity) return;
    let cancelled = false;
    setActivityError(null);
    listAuditLogs({ entityType: 'Customer', entityId: customerId, limit: ACTIVITY_LIMIT })
      .then((res) => {
        if (!cancelled) setActivity(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setActivityError(err instanceof Error ? err.message : t('customers.detail.activityError'));
          setActivity([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canViewActivity, customerId, t]);

  useEffect(() => {
    if (!canReassign) return;
    let cancelled = false;
    listManagers()
      .then((res) => {
        if (!cancelled) setManagers(res.data);
      })
      .catch(() => {
        if (!cancelled) setManagers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canReassign]);

  useEffect(() => {
    if (!applying) return;
    let cancelled = false;
    setApplyError(null);
    listOfferings({ category: applyCategory, includeInactive: false })
      .then((res) => {
        if (cancelled) return;
        const active = res.data.filter((offering) => offering.isActive);
        setApplyOfferings(active);
        setApplyOfferingId((current) =>
          active.some((offering) => offering.id === current) ? current : (active[0]?.id ?? ''),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setApplyError(
          err instanceof Error ? err.message : t('customers.applyOnBehalf.offeringsError'),
        );
        setApplyOfferings([]);
        setApplyOfferingId('');
      });
    return () => {
      cancelled = true;
    };
  }, [applying, applyCategory, t]);

  async function issueInvite(customer: PublicCustomer, email?: string) {
    setInviting(true);
    setInviteError(null);
    try {
      const data = await inviteCustomer(customer.id, email);
      setIssued({ customerName: customer.fullName, invitation: data.invitation, token: data.token });
      setPendingInviteEmail(null);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : t('customers.invite.error'));
    } finally {
      setInviting(false);
    }
  }

  function startInvite(customer: PublicCustomer) {
    setIssued(null);
    setInviteError(null);
    if (customer.email) {
      void issueInvite(customer, undefined);
    } else {
      setPendingInviteEmail('');
    }
  }

  async function submitReassign(event: FormEvent, customer: PublicCustomer) {
    event.preventDefault();
    setReassignBusy(true);
    setReassignError(null);
    try {
      await reassignCustomer(customer.id, reassignManagerId, reassignReason.trim());
      setReassigning(false);
      setReassignManagerId('');
      setReassignReason('');
      setReassignNotice(t('customers.reassign.success', { name: customer.fullName }));
      await loadCustomer(false);
    } catch (err) {
      setReassignError(err instanceof Error ? err.message : t('customers.reassign.error'));
    } finally {
      setReassignBusy(false);
    }
  }

  async function provisionAccount(customer: PublicCustomer) {
    setAccountBusy(true);
    setAccountError(null);
    setAccountNotice(null);
    try {
      await provisionCustomerAccount(customer.id);
      setAccountNotice(t('customers.account.created', { name: customer.fullName }));
      await loadCustomer(false);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : t('customers.account.error'));
    } finally {
      setAccountBusy(false);
    }
  }

  async function submitApply(event: FormEvent, customer: PublicCustomer) {
    event.preventDefault();
    if (!applyOfferingId) return;
    setApplyBusy(true);
    setApplyError(null);
    setApplyNotice(null);
    try {
      const data = await createCaseForCustomer({
        customerId: customer.id,
        offeringId: applyOfferingId,
      });
      setApplying(false);
      // Hand the admin straight to the fresh draft so they can finish the intake the way the
      // customer would — upload the checklist, pick the receiving account, attach the receipt,
      // and submit. Fall back to an inline notice when no opener was provided.
      if (onOpenCase) {
        onOpenCase(data.case.id);
      } else {
        setApplyNotice(t('customers.applyOnBehalf.success', { title: data.case.offeringTitle }));
        await loadCases();
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : t('customers.applyOnBehalf.error'));
    } finally {
      setApplyBusy(false);
    }
  }

  async function copyClaimUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard unavailable (insecure context); the link stays selectable. */
    }
  }

  return (
    <section className={styles.wrap}>
      <button type="button" className={styles.backButton} onClick={onBack}>
        {t('customers.detail.back')}
      </button>

      {state.kind === 'loading' && <p className={styles.muted}>{t('customers.detail.loading')}</p>}

      {state.kind === 'error' && (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      )}

      {state.kind === 'ok' && (
        <div className={styles.content}>
          <header className={styles.header}>
            <h2 className={styles.title}>{state.customer.fullName}</h2>
            <span
              className={`${styles.pill} ${ASSIGNMENT_CLASS[state.customer.assignmentStatus]}`}
            >
              {t(ASSIGNMENT_KEYS[state.customer.assignmentStatus])}
            </span>
            {state.customer.accountStatus && (
              <span className={`${styles.pill} ${ACCOUNT_CLASS[state.customer.accountStatus]}`}>
                {t(ACCOUNT_KEYS[state.customer.accountStatus])}
              </span>
            )}
          </header>

          <section className={styles.card}>
            <h3 className={styles.cardTitle}>{t('customers.detail.identity')}</h3>
            <dl className={styles.grid}>
              <div>
                <dt>{t('customers.detail.email')}</dt>
                <dd>{state.customer.email ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('customers.detail.phone')}</dt>
                <dd>{state.customer.phone ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('customers.detail.country')}</dt>
                <dd>{state.customer.countryCode}</dd>
              </div>
              <div>
                <dt>{t('customers.detail.manager')}</dt>
                <dd>{state.customer.assignedManagerName ?? t('customers.detail.noManager')}</dd>
              </div>
              <div>
                <dt>{t('customers.detail.created')}</dt>
                <dd>{formatDate(state.customer.createdAt)}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.card}>
            <h3 className={styles.cardTitle}>{t('customers.detail.actions')}</h3>

            {issued && (
              <div className={styles.tokenPanel} role="status">
                <p className={styles.tokenTitle}>
                  {t('customers.invite.created', { email: issued.invitation.email })}
                </p>
                <p className={styles.tokenHint}>{t('customers.invite.linkHint')}</p>
                <code className={styles.token}>{claimUrl(issued.token)}</code>
                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => void copyClaimUrl(claimUrl(issued.token))}
                  >
                    {copied ? t('customers.invite.copied') : t('customers.invite.copy')}
                  </button>
                  <button type="button" className={styles.ghostButton} onClick={() => setIssued(null)}>
                    {t('customers.invite.dismiss')}
                  </button>
                </div>
                <p className={styles.tokenMeta}>
                  {t('customers.invite.expiresAt', { date: formatDate(issued.invitation.expiresAt) })}
                </p>
              </div>
            )}

            {inviteError && (
              <p className={styles.error} role="alert">
                {inviteError}
              </p>
            )}

            {pendingInviteEmail !== null ? (
              <form
                className={styles.inlineForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  void issueInvite(state.customer, pendingInviteEmail);
                }}
              >
                <label className={styles.field}>
                  <span>{t('customers.invite.emailLabel')}</span>
                  <input
                    type="email"
                    value={pendingInviteEmail}
                    required
                    maxLength={160}
                    onChange={(e) => setPendingInviteEmail(e.target.value)}
                  />
                </label>
                <button type="submit" className={styles.primaryButton} disabled={inviting}>
                  {inviting ? t('customers.invite.sending') : t('customers.invite.send')}
                </button>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => setPendingInviteEmail(null)}
                  disabled={inviting}
                >
                  {t('customers.invite.cancel')}
                </button>
              </form>
            ) : (
              <div className={styles.actionRow}>
                {canApplyForCustomer && state.customer.accountStatus === 'none' && (
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => void provisionAccount(state.customer)}
                    disabled={accountBusy}
                  >
                    {accountBusy ? t('customers.account.creating') : t('customers.account.create')}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => startInvite(state.customer)}
                  disabled={inviting}
                >
                  {t('customers.invite.action')}
                </button>
                {canApplyForCustomer && (
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => {
                      setApplyNotice(null);
                      setApplyError(null);
                      setApplying((open) => !open);
                    }}
                    disabled={applyBusy}
                  >
                    {t('customers.applyOnBehalf.action')}
                  </button>
                )}
                {canReassign && managers.length > 0 && (
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => {
                      setReassignNotice(null);
                      setReassignError(null);
                      setReassigning(true);
                    }}
                    disabled={reassignBusy}
                  >
                    {t('customers.reassign.action')}
                  </button>
                )}
              </div>
            )}

            {accountNotice && (
              <p className={styles.notice} role="status">
                {accountNotice}
              </p>
            )}

            {accountError && (
              <p className={styles.error} role="alert">
                {accountError}
              </p>
            )}

            {applyNotice && (
              <p className={styles.notice} role="status">
                {applyNotice}
              </p>
            )}

            {applyError && !applying && (
              <p className={styles.error} role="alert">
                {applyError}
              </p>
            )}

            {applying && (
              <form
                className={styles.reassignPanel}
                onSubmit={(e) => void submitApply(e, state.customer)}
              >
                <p className={styles.tokenTitle}>
                  {t('customers.applyOnBehalf.title', { name: state.customer.fullName })}
                </p>
                <p className={styles.tokenHint}>{t('customers.applyOnBehalf.hint')}</p>
                <div className={styles.reassignFields}>
                  <label className={styles.field}>
                    <span>{t('customers.applyOnBehalf.category')}</span>
                    <select
                      value={applyCategory}
                      onChange={(e) => setApplyCategory(e.target.value as ServiceCategory)}
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {t(`categories.${category}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>{t('customers.applyOnBehalf.offering')}</span>
                    <select
                      value={applyOfferingId}
                      required
                      disabled={applyOfferings.length === 0}
                      onChange={(e) => setApplyOfferingId(e.target.value)}
                    >
                      <option value="" disabled>
                        {t('customers.applyOnBehalf.offeringPlaceholder')}
                      </option>
                      {applyOfferings.map((offering) => (
                        <option key={offering.id} value={offering.id}>
                          {pickLocalized(offering.title, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {applyOfferings.length === 0 && (
                  <p className={styles.tokenHint}>{t('customers.applyOnBehalf.noOfferings')}</p>
                )}
                <div className={styles.actionRow}>
                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={applyBusy || !applyOfferingId}
                  >
                    {applyBusy ? t('customers.applyOnBehalf.saving') : t('customers.applyOnBehalf.submit')}
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => setApplying(false)}
                    disabled={applyBusy}
                  >
                    {t('customers.applyOnBehalf.cancel')}
                  </button>
                </div>
                {applyError && (
                  <p className={styles.error} role="alert">
                    {applyError}
                  </p>
                )}
              </form>
            )}

            {reassignNotice && (
              <p className={styles.notice} role="status">
                {reassignNotice}
              </p>
            )}

            {reassignError && (
              <p className={styles.error} role="alert">
                {reassignError}
              </p>
            )}

            {reassigning && (
              <form className={styles.reassignPanel} onSubmit={(e) => void submitReassign(e, state.customer)}>
                <p className={styles.tokenTitle}>
                  {t('customers.reassign.title', { name: state.customer.fullName })}
                </p>
                <div className={styles.reassignFields}>
                  <label className={styles.field}>
                    <span>{t('customers.reassign.manager')}</span>
                    <select
                      value={reassignManagerId}
                      required
                      onChange={(e) => setReassignManagerId(e.target.value)}
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
                      value={reassignReason}
                      required
                      minLength={3}
                      maxLength={500}
                      onChange={(e) => setReassignReason(e.target.value)}
                    />
                  </label>
                </div>
                <div className={styles.actionRow}>
                  <button type="submit" className={styles.primaryButton} disabled={reassignBusy}>
                    {reassignBusy ? t('customers.reassign.saving') : t('customers.reassign.submit')}
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => setReassigning(false)}
                    disabled={reassignBusy}
                  >
                    {t('customers.reassign.cancel')}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className={styles.card}>
            <h3 className={styles.cardTitle}>{t('customers.detail.cases')}</h3>
            {casesError && (
              <p className={styles.error} role="alert">
                {casesError}
              </p>
            )}
            {!casesError && cases && cases.data.length === 0 && (
              <p className={styles.muted}>{t('customers.detail.casesEmpty')}</p>
            )}
            {!casesError && cases && cases.data.length > 0 && (
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
                    {cases.data.map((item) => (
                      <tr
                        key={item.id}
                        className={styles.row}
                        onClick={() => onOpenCase?.(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onOpenCase?.(item.id);
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
                          <CaseStatusBadge status={item.status} />
                        </td>
                        <td className={styles.dateCell}>{formatDate(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {canViewActivity && (
            <section className={styles.card}>
              <h3 className={styles.cardTitle}>{t('customers.detail.activity')}</h3>
              {activityError && (
                <p className={styles.error} role="alert">
                  {activityError}
                </p>
              )}
              {!activityError && activity && activity.length === 0 && (
                <p className={styles.muted}>{t('customers.detail.activityEmpty')}</p>
              )}
              {!activityError && activity && activity.length > 0 && (
                <ul className={styles.activityList}>
                  {activity.map((entry) => (
                    <li key={entry.id} className={styles.activityItem}>
                      <span className={styles.activityAction}>{entry.action}</span>
                      <time className={styles.activityTime} dateTime={entry.createdAt}>
                        {formatDate(entry.createdAt)}
                      </time>
                      <span className={styles.activityActor}>
                        {entry.actorUserId ?? t('customers.detail.activitySystem')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
