import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { roleHasPermission } from '@medbourse/shared';
import type {
  AppLocale,
  LocalizedText,
  PaymentIdentifierType,
  PaymentMethod,
  PublicCountryAssignment,
  PublicOffering,
  PublicPaymentAccount,
  PublicPricingRule,
  PublicUser,
  ServiceCategory,
} from '@medbourse/shared';
import {
  PAYMENT_METHODS,
  SERVICE_CATEGORIES,
  defaultPaymentProfile,
  paymentMethodDefinition,
  paymentMethodProfile,
} from '@medbourse/shared';
import {
  createPaymentAccount,
  createPricingRule,
  listCountryAssignments,
  listOfferings,
  listPaymentAccounts,
  listPricingRules,
  updatePaymentAccount,
  updatePricingRule,
} from '../api';
import { countryFlag, countryName, listCountries } from '../lib/countries';
import { listCurrencies } from '../lib/currencies';
import CurrencySelect from './CurrencySelect';
import styles from './PaymentsView.module.css';

type Tab = 'pricing' | 'accounts';

interface PricingForm {
  scope: string;
  offeringId: string;
  category: string;
  amount: string;
  currency: string;
  isActive: boolean;
}

interface AccountForm {
  scope: string;
  currency: string;
  /** The rail the money travels on; its profile decides which identifiers are asked for. */
  method: PaymentMethod;
  profile: string;
  label: string;
  beneficiaryName: string;
  /** The bank, mobile-money operator, wallet, exchange or desk the money lands in. */
  providerName: string;
  /** Identifier values keyed by the profile's field keys (`iban`, `upiVpa`, `address`…). */
  identifiers: Record<string, string>;
  referenceHint: string;
  notes: string;
  priority: string;
  isActive: boolean;
}

const EMPTY_PRICING: PricingForm = {
  scope: '',
  offeringId: '',
  category: '',
  amount: '',
  currency: 'USD',
  isActive: true,
};

const EMPTY_ACCOUNT: AccountForm = {
  scope: '',
  currency: 'USD',
  method: 'bank_transfer',
  profile: defaultPaymentProfile('bank_transfer').id,
  label: '',
  beneficiaryName: '',
  providerName: '',
  identifiers: {},
  referenceHint: '',
  notes: '',
  priority: '0',
  isActive: true,
};

/** Reads one locale from a localized value, falling back to English. */
function pickLocalized(value: LocalizedText, locale: AppLocale): string {
  return (value[locale] || value.en || '').trim();
}

/** `Intl` rejects unknown currency codes, so fall back to a plain string when it does. */
function formatMoney(amount: string, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Picks the HTML input type that matches an identifier's kind, for sensible mobile keyboards. */
function identifierInputType(type: PaymentIdentifierType): 'email' | 'url' | 'tel' | 'text' {
  if (type === 'email') return 'email';
  if (type === 'url') return 'url';
  if (type === 'phone') return 'tel';
  return 'text';
}

/**
 * Admin surface for money: the price of each service and the accounts customers pay into.
 * A super admin owns the global defaults (USD, no country) and every country; a country
 * admin only the countries assigned to them, while still seeing the global defaults.
 */
export default function PaymentsView({ user }: { user: PublicUser }) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language.split('-')[0] || 'en') as AppLocale;
  const isSuper = roleHasPermission(user.role, 'catalog:manage:super_admin');

  const [tab, setTab] = useState<Tab>('pricing');
  const [rules, setRules] = useState<PublicPricingRule[]>([]);
  const [accounts, setAccounts] = useState<PublicPaymentAccount[]>([]);
  const [offerings, setOfferings] = useState<PublicOffering[]>([]);
  const [assignments, setAssignments] = useState<PublicCountryAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pricingForm, setPricingForm] = useState<PricingForm>(EMPTY_PRICING);
  const [pricingEditingId, setPricingEditingId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>(EMPTY_ACCOUNT);
  const [accountEditingId, setAccountEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ruleRes, accountRes, offeringRes, assignmentRes] = await Promise.all([
        listPricingRules(),
        listPaymentAccounts(),
        listOfferings({ includeInactive: true }),
        listCountryAssignments(),
      ]);
      setRules(ruleRes.data);
      setAccounts(accountRes.data);
      setOfferings(offeringRes.data);
      setAssignments(assignmentRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('payments.loadError'));
      setRules([]);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const allCountries = useMemo(() => listCountries(i18n.language), [i18n.language]);

  /** Every ISO 4217 currency, localized and sorted for the active locale. */
  const currencyOptions = useMemo(
    () => listCurrencies(i18n.language.split('-')[0] || 'en'),
    [i18n.language],
  );

  /** Countries this admin serves; super admins are not scoped, so it stays empty for them. */
  const myCountries = useMemo(
    () =>
      assignments
        .filter((assignment) => assignment.isActive && assignment.managerUserIds.includes(user.id))
        .map((assignment) => assignment.countryCode),
    [assignments, user.id],
  );

  const countryOptions = useMemo(() => {
    if (isSuper) {
      return allCountries;
    }
    const codes = new Set(myCountries);
    return allCountries.filter((country) => codes.has(country.code));
  }, [isSuper, allCountries, myCountries]);

  /**
   * A country admin has no "global" option, so a blank scope would leave the browser
   * showing the first country while the form state stays empty. Default it to a real
   * assigned country so the visible selection and the submitted value always agree.
   */
  useEffect(() => {
    if (isSuper || countryOptions.length === 0) return;
    const codes = new Set(countryOptions.map((country) => country.code));
    const fallback = countryOptions[0]?.code;
    if (!fallback) return;
    if (!codes.has(pricingForm.scope)) {
      setPricingForm((value) => ({ ...value, scope: fallback }));
    }
    if (!codes.has(accountForm.scope)) {
      setAccountForm((value) => ({ ...value, scope: fallback }));
    }
  }, [isSuper, countryOptions, pricingForm.scope, accountForm.scope]);

  const offeringTitle = useCallback(
    (offeringId: string) => {
      const offering = offerings.find((item) => item.id === offeringId);
      return offering ? pickLocalized(offering.title, locale) : offeringId;
    },
    [offerings, locale],
  );

  const targetLabel = useCallback(
    (rule: PublicPricingRule) => {
      if (rule.offeringId) {
        return offeringTitle(rule.offeringId);
      }
      if (rule.category) {
        return t(`categories.${rule.category}`);
      }
      return t('payments.allServices');
    },
    [offeringTitle, t],
  );

  function startEditRule(rule: PublicPricingRule) {
    setTab('pricing');
    setPricingEditingId(rule.id);
    setFormError(null);
    setSavedNote(null);
    setPricingForm({
      scope: rule.customerCountryCode ?? '',
      offeringId: rule.offeringId ?? '',
      category: rule.category ?? '',
      amount: rule.amount,
      currency: rule.currency,
      isActive: rule.isActive,
    });
  }

  function resetPricingForm() {
    setPricingEditingId(null);
    setFormError(null);
    setPricingForm(EMPTY_PRICING);
  }

  function startEditAccount(account: PublicPaymentAccount) {
    setTab('accounts');
    setAccountEditingId(account.id);
    setFormError(null);
    setSavedNote(null);
    setAccountForm({
      scope: account.customerCountryCode ?? '',
      currency: account.currency,
      method: account.method,
      profile: account.profile,
      label: account.label,
      beneficiaryName: account.beneficiaryName,
      providerName: account.providerName,
      identifiers: Object.fromEntries(
        account.identifiers.map((identifier) => [identifier.key, identifier.value]),
      ),
      referenceHint: account.referenceHint ?? '',
      notes: account.notes ?? '',
      priority: String(account.priority),
      isActive: account.isActive,
    });
  }

  function resetAccountForm() {
    setAccountEditingId(null);
    setFormError(null);
    setAccountForm(EMPTY_ACCOUNT);
  }

  function scopePayload(scope: string): { customerCountryCode?: string } {
    return scope ? { customerCountryCode: scope } : {};
  }

  /** The identifier fields the chosen method + profile asks the admin to fill in. */
  const accountIdentifierFields = useMemo(
    () => paymentMethodProfile(accountForm.method, accountForm.profile)?.fields ?? [],
    [accountForm.method, accountForm.profile],
  );

  /** The ways of paying into the chosen method (IBAN, domestic, UPI, PIX…). */
  const accountProfiles = useMemo(
    () => paymentMethodDefinition(accountForm.method).profiles,
    [accountForm.method],
  );

  /** Switching rail falls back to its first profile and drops the old identifier values. */
  function changeAccountMethod(method: PaymentMethod) {
    setAccountForm((value) => ({
      ...value,
      method,
      profile: defaultPaymentProfile(method).id,
      identifiers: {},
    }));
  }

  function changeAccountProfile(profile: string) {
    setAccountForm((value) => ({ ...value, profile, identifiers: {} }));
  }

  async function submitPricing(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSavedNote(null);
    if (!isSuper && !pricingForm.scope) {
      setFormError(t('payments.selectCountry'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...scopePayload(pricingForm.scope),
        offeringId: pricingForm.offeringId || undefined,
        category:
          pricingForm.offeringId || !pricingForm.category
            ? undefined
            : (pricingForm.category as ServiceCategory),
        amount: pricingForm.amount.trim(),
        currency: pricingForm.currency.trim().toUpperCase(),
        isActive: pricingForm.isActive,
      };
      if (pricingEditingId) {
        await updatePricingRule(pricingEditingId, payload);
      } else {
        await createPricingRule(payload);
      }
      setSavedNote(t('payments.saved'));
      resetPricingForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('payments.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function submitAccount(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSavedNote(null);
    if (!isSuper && !accountForm.scope) {
      setFormError(t('payments.selectCountry'));
      return;
    }
    setSaving(true);
    try {
      // Only the identifiers the chosen profile declares are sent; the server validates
      // and normalizes them against the shared payment library.
      const identifiers = (paymentMethodProfile(accountForm.method, accountForm.profile)?.fields ?? [])
        .map((field) => ({ key: field.key, value: (accountForm.identifiers[field.key] ?? '').trim() }))
        .filter((identifier) => identifier.value.length > 0);
      const payload = {
        ...scopePayload(accountForm.scope),
        currency: accountForm.currency.trim().toUpperCase(),
        method: accountForm.method,
        profile: accountForm.profile,
        label: accountForm.label.trim(),
        beneficiaryName: accountForm.beneficiaryName.trim(),
        providerName: accountForm.providerName.trim(),
        identifiers,
        referenceHint: accountForm.referenceHint.trim() || undefined,
        notes: accountForm.notes.trim() || undefined,
        priority: accountForm.priority.trim() ? Number(accountForm.priority) : undefined,
        isActive: accountForm.isActive,
      };
      if (accountEditingId) {
        await updatePaymentAccount(accountEditingId, payload);
      } else {
        await createPaymentAccount(payload);
      }
      setSavedNote(t('payments.saved'));
      resetAccountForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('payments.saveError'));
    } finally {
      setSaving(false);
    }
  }

  const canManageAnything = isSuper || countryOptions.length > 0;

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('payments.title')}</h2>
          <p className={styles.subtitle}>
            {isSuper ? t('payments.subtitleSuper') : t('payments.subtitleAdmin')}
          </p>
        </div>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={() => void load()}
          disabled={loading}
        >
          {t('payments.refresh')}
        </button>
      </header>

      {isSuper && (
        <p className={styles.notice}>
          <span className={styles.globalBadge}>{t('payments.globalScope')}</span>
          {t('payments.globalHint')}
        </p>
      )}

      <nav className={styles.tabs} aria-label={t('payments.title')}>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'pricing' ? styles.tabActive : ''}`}
          aria-current={tab === 'pricing' ? 'page' : undefined}
          onClick={() => setTab('pricing')}
        >
          {t('payments.tabs.pricing')}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'accounts' ? styles.tabActive : ''}`}
          aria-current={tab === 'accounts' ? 'page' : undefined}
          onClick={() => setTab('accounts')}
        >
          {t('payments.tabs.accounts')}
        </button>
      </nav>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className={styles.muted}>{t('payments.loading')}</p>
      ) : tab === 'pricing' ? (
        <>
          {rules.length === 0 ? (
            <p className={styles.muted}>{t('payments.emptyRules')}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('payments.columns.scope')}</th>
                    <th scope="col">{t('payments.columns.services')}</th>
                    <th scope="col">{t('payments.columns.amount')}</th>
                    <th scope="col">{t('payments.columns.active')}</th>
                    <th scope="col">{t('payments.columns.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td>
                        <span className={styles.scopeCell}>
                          {rule.customerCountryCode ? (
                            <>
                              <span className={styles.scopeFlag} aria-hidden="true">
                                {countryFlag(rule.customerCountryCode)}
                              </span>
                              {countryName(rule.customerCountryCode, i18n.language)}
                            </>
                          ) : (
                            <span className={styles.globalBadge}>{t('payments.globalScope')}</span>
                          )}
                        </span>
                      </td>
                      <td>{targetLabel(rule)}</td>
                      <td className={styles.amountCell}>{formatMoney(rule.amount, rule.currency)}</td>
                      <td>
                        <span
                          className={rule.isActive ? styles.pillActive : styles.pillInactive}
                        >
                          {rule.isActive
                            ? t('payments.active')
                            : t('payments.inactive')}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => startEditRule(rule)}
                        >
                          {t('payments.edit')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>
              {pricingEditingId ? t('payments.editRule') : t('payments.newRule')}
            </h3>
            <form className={styles.form} onSubmit={(event) => void submitPricing(event)}>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>{t('payments.columns.scope')}</span>
                  <select
                    value={pricingForm.scope}
                    onChange={(e) =>
                      setPricingForm((value) => ({ ...value, scope: e.target.value }))
                    }
                    disabled={!isSuper && countryOptions.length === 0}
                  >
                    {isSuper && <option value="">{t('payments.globalScope')}</option>}
                    {countryOptions.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.flag} {country.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{t('payments.offering')}</span>
                  <select
                    value={pricingForm.offeringId}
                    onChange={(e) =>
                      setPricingForm((value) => ({ ...value, offeringId: e.target.value }))
                    }
                  >
                    <option value="">{t('payments.allServices')}</option>
                    {offerings.map((offering) => (
                      <option key={offering.id} value={offering.id}>
                        {pickLocalized(offering.title, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{t('payments.category')}</span>
                  <select
                    value={pricingForm.category}
                    onChange={(e) =>
                      setPricingForm((value) => ({ ...value, category: e.target.value }))
                    }
                    disabled={Boolean(pricingForm.offeringId)}
                  >
                    <option value="">{t('payments.anyCategory')}</option>
                    {SERVICE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {t(`categories.${category}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{t('payments.amount')}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={pricingForm.amount}
                    placeholder="1500.00"
                    pattern="[0-9]+(\.[0-9]{1,4})?"
                    onChange={(e) =>
                      setPricingForm((value) => ({ ...value, amount: e.target.value }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('payments.currency')}</span>
                  <CurrencySelect
                    value={pricingForm.currency}
                    options={currencyOptions}
                    onChange={(currency) => setPricingForm((value) => ({ ...value, currency }))}
                  />
                </label>
                <label className={styles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={pricingForm.isActive}
                    onChange={(e) =>
                      setPricingForm((value) => ({ ...value, isActive: e.target.checked }))
                    }
                  />
                  <span>{t('payments.active')}</span>
                </label>
              </div>
              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={saving || !canManageAnything}
                >
                  {pricingEditingId ? t('payments.save') : t('payments.create')}
                </button>
                {pricingEditingId && (
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={resetPricingForm}
                    disabled={saving}
                  >
                    {t('payments.cancel')}
                  </button>
                )}
              </div>
            </form>
            {formError && (
              <p className={styles.error} role="alert">
                {formError}
              </p>
            )}
            {savedNote && !formError && <p className={styles.note}>{savedNote}</p>}
          </div>
        </>
      ) : (
        <>
          {accounts.length === 0 ? (
            <p className={styles.muted}>{t('payments.emptyAccounts')}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('payments.columns.scope')}</th>
                    <th scope="col">{t('payments.columns.label')}</th>
                    <th scope="col">{t('payments.columns.method')}</th>
                    <th scope="col">{t('payments.columns.provider')}</th>
                    <th scope="col">{t('payments.columns.currency')}</th>
                    <th scope="col">{t('payments.columns.active')}</th>
                    <th scope="col">{t('payments.columns.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <span className={styles.scopeCell}>
                          {account.customerCountryCode ? (
                            <>
                              <span className={styles.scopeFlag} aria-hidden="true">
                                {countryFlag(account.customerCountryCode)}
                              </span>
                              {countryName(account.customerCountryCode, i18n.language)}
                            </>
                          ) : (
                            <span className={styles.globalBadge}>{t('payments.globalScope')}</span>
                          )}
                        </span>
                      </td>
                      <td className={styles.titleCell}>{account.label}</td>
                      <td>
                        {t(`payments.methods.${account.method}`)}
                        <span className={styles.methodProfile}>
                          {t(`payments.profiles.${account.profile}`, { defaultValue: '' })}
                        </span>
                      </td>
                      <td>{account.providerName}</td>
                      <td className={styles.monoCell}>{account.currency}</td>
                      <td>
                        <span
                          className={account.isActive ? styles.pillActive : styles.pillInactive}
                        >
                          {account.isActive ? t('payments.active') : t('payments.inactive')}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => startEditAccount(account)}
                        >
                          {t('payments.edit')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>
              {accountEditingId ? t('payments.editAccount') : t('payments.newAccount')}
            </h3>
            <form className={styles.form} onSubmit={(event) => void submitAccount(event)}>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>{t('payments.columns.scope')}</span>
                  <select
                    value={accountForm.scope}
                    onChange={(e) =>
                      setAccountForm((value) => ({ ...value, scope: e.target.value }))
                    }
                    disabled={!isSuper && countryOptions.length === 0}
                  >
                    {isSuper && <option value="">{t('payments.globalScope')}</option>}
                    {countryOptions.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.flag} {country.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{t('payments.label')}</span>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={accountForm.label}
                    onChange={(e) =>
                      setAccountForm((value) => ({ ...value, label: e.target.value }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('payments.beneficiary')}</span>
                  <input
                    type="text"
                    required
                    maxLength={160}
                    value={accountForm.beneficiaryName}
                    onChange={(e) =>
                      setAccountForm((value) => ({ ...value, beneficiaryName: e.target.value }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('payments.method')}</span>
                  <select
                    value={accountForm.method}
                    onChange={(e) => changeAccountMethod(e.target.value as PaymentMethod)}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {t(`payments.methods.${method}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{t('payments.profile')}</span>
                  <select
                    value={accountForm.profile}
                    onChange={(e) => changeAccountProfile(e.target.value)}
                  >
                    {accountProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {t(`payments.profiles.${profile.id}`, { defaultValue: profile.id })}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{t('payments.provider')}</span>
                  <input
                    type="text"
                    required
                    maxLength={160}
                    value={accountForm.providerName}
                    onChange={(e) =>
                      setAccountForm((value) => ({ ...value, providerName: e.target.value }))
                    }
                  />
                </label>
                {accountIdentifierFields.map((field) => (
                  <label key={field.key} className={styles.field}>
                    <span>
                      {t(`payments.fields.${field.key}`, { defaultValue: field.key })}
                    </span>
                    <input
                      type={identifierInputType(field.type)}
                      required={field.required}
                      maxLength={160}
                      placeholder={t(`payments.fieldHints.${field.type}`, { defaultValue: '' })}
                      value={accountForm.identifiers[field.key] ?? ''}
                      onChange={(e) =>
                        setAccountForm((value) => ({
                          ...value,
                          identifiers: { ...value.identifiers, [field.key]: e.target.value },
                        }))
                      }
                    />
                  </label>
                ))}
                <label className={styles.field}>
                  <span>{t('payments.currency')}</span>
                  <CurrencySelect
                    value={accountForm.currency}
                    options={currencyOptions}
                    onChange={(currency) => setAccountForm((value) => ({ ...value, currency }))}
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('payments.priority')}</span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={accountForm.priority}
                    onChange={(e) =>
                      setAccountForm((value) => ({ ...value, priority: e.target.value }))
                    }
                  />
                  <small className={styles.hint}>{t('payments.priorityHint')}</small>
                </label>
                <label className={styles.field}>
                  <span>{t('payments.referenceHint')}</span>
                  <input
                    type="text"
                    maxLength={200}
                    value={accountForm.referenceHint}
                    onChange={(e) =>
                      setAccountForm((value) => ({ ...value, referenceHint: e.target.value }))
                    }
                  />
                </label>
                <label className={`${styles.field} ${styles.fieldFull}`}>
                  <span>{t('payments.notes')}</span>
                  <textarea
                    rows={2}
                    maxLength={800}
                    value={accountForm.notes}
                    onChange={(e) =>
                      setAccountForm((value) => ({ ...value, notes: e.target.value }))
                    }
                  />
                </label>
                <label className={styles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={accountForm.isActive}
                    onChange={(e) =>
                      setAccountForm((value) => ({ ...value, isActive: e.target.checked }))
                    }
                  />
                  <span>{t('payments.active')}</span>
                </label>
              </div>
              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={saving || !canManageAnything}
                >
                  {accountEditingId ? t('payments.save') : t('payments.create')}
                </button>
                {accountEditingId && (
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={resetAccountForm}
                    disabled={saving}
                  >
                    {t('payments.cancel')}
                  </button>
                )}
              </div>
            </form>
            {formError && (
              <p className={styles.error} role="alert">
                {formError}
              </p>
            )}
            {savedNote && !formError && <p className={styles.note}>{savedNote}</p>}
          </div>
        </>
      )}

      {!canManageAnything && !loading && (
        <p className={styles.muted}>{t('payments.noCountries')}</p>
      )}
    </section>
  );
}
