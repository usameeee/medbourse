import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AppLocale,
  LocalizedText,
  PublicOffering,
  ServiceCategory,
} from '@medbourse/shared';
import { applyForCase, listOfferings } from '../api';
import { listCountries } from '../lib/countries';
import styles from './NewApplicationView.module.css';

const CATEGORIES: readonly ServiceCategory[] = ['education', 'medical', 'tourism'];

/** Reads one locale from a localized value, falling back to English. */
function pickLocalized(value: LocalizedText, locale: AppLocale): string {
  return (value[locale] || value.en || '').trim();
}

interface NewApplicationViewProps {
  onCreated: (caseId: string) => void;
  onCancel: () => void;
  /** Country from the customer's profile; prefills the picker but stays editable. */
  defaultCountryCode?: string;
}

/**
 * Self-service intake (`case:create:self`): the customer opens their own case against
 * a catalog offering. Country is required because it drives manager assignment — it is
 * prefilled from the profile country and can be overridden per application.
 */
export default function NewApplicationView({
  onCreated,
  onCancel,
  defaultCountryCode = '',
}: NewApplicationViewProps) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language.split('-')[0] || 'en') as AppLocale;
  const countries = useMemo(() => listCountries(i18n.language), [i18n.language]);

  const [category, setCategory] = useState<ServiceCategory>('education');
  const [offerings, setOfferings] = useState<PublicOffering[]>([]);
  const [offeringId, setOfferingId] = useState('');
  const [countryCode, setCountryCode] = useState(defaultCountryCode);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOfferings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listOfferings({ category });
      setOfferings(res.data);
      setOfferingId(res.data[0]?.id ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('applications.loadError'));
      setOfferings([]);
      setOfferingId('');
    } finally {
      setLoading(false);
    }
  }, [category, t]);

  useEffect(() => {
    void loadOfferings();
  }, [loadOfferings]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await applyForCase({
        offeringId,
        countryCode,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      onCreated(res.case.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('applications.submitError'));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(offeringId && countryCode) && !busy && !loading;

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('applications.title')}</h2>
        <p className={styles.subtitle}>{t('applications.subtitle')}</p>
      </header>

      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>{t('applications.category')}</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ServiceCategory)}
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {t(`categories.${item}`)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>{t('applications.offering')}</span>
            <select
              value={offeringId}
              onChange={(event) => setOfferingId(event.target.value)}
              disabled={loading || offerings.length === 0}
              required
            >
              {offerings.map((offering) => (
                <option key={offering.id} value={offering.id}>
                  {pickLocalized(offering.title, locale)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>{t('applications.country')}</span>
            <select
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
              required
            >
              <option value="">{t('applications.countryPlaceholder')}</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.flag} {country.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>{t('applications.phone')}</span>
            <input
              type="tel"
              autoComplete="tel"
              maxLength={32}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
        </div>

        <label className={styles.field}>
          <span>{t('applications.message')}</span>
          <textarea
            rows={4}
            maxLength={2000}
            placeholder={t('applications.messagePlaceholder')}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>

        {loading && <p className={styles.hint}>{t('applications.loadingOfferings')}</p>}
        {!loading && offerings.length === 0 && (
          <p className={styles.hint}>{t('applications.noOfferings')}</p>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={!canSubmit}>
            {busy ? t('applications.submitting') : t('applications.submit')}
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={onCancel}
            disabled={busy}
          >
            {t('applications.cancel')}
          </button>
        </div>
      </form>
    </section>
  );
}
