import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_LOCALES, SERVICE_CATEGORIES, emptyLocalizedText } from '@medbourse/shared';
import type {
  AppLocale,
  LocalizedText,
  PublicCity,
  PublicDocumentRequirement,
  PublicOffering,
  PublicPricingRule,
  PublicProvider,
  ServiceCategory,
} from '@medbourse/shared';
import {
  apiUrl,
  createCity,
  createOffering,
  createPricingRule,
  createProvider,
  listCities,
  listDocumentRequirements,
  listOfferings,
  listPricingRules,
  listProviders,
  updateCity,
  updateOffering,
  updatePricingRule,
  updateProvider,
  uploadMedia,
} from '../api';
import { listCurrencies } from '../lib/currencies';
import CurrencySelect from './CurrencySelect';
import { CategoryBadge } from './StatusBadge';
import styles from './CatalogView.module.css';

type Tab = 'cities' | 'providers' | 'offerings';

interface CityForm {
  slug: string;
  name: string;
  countryCode: string;
  isActive: boolean;
}

interface ProviderForm {
  name: string;
  category: ServiceCategory;
  cityId: string;
  website: string;
  logoMediaId: string | null;
  logoUrl: string | null;
  coverMediaId: string | null;
  coverUrl: string | null;
  isActive: boolean;
  partnershipVerified: boolean;
}

interface OfferingForm {
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  requirementsSummary: LocalizedText;
  requiredDocumentIds: string[];
  /** Empty string means "no provider": a standalone offering defined by category and city. */
  providerId: string;
  category: ServiceCategory;
  cityId: string;
  logoMediaId: string | null;
  logoUrl: string | null;
  coverMediaId: string | null;
  coverUrl: string | null;
  isActive: boolean;
  /** Mandatory general (global) price so a self-service application can always be quoted. */
  priceAmount: string;
  priceCurrency: string;
}

const emptyCity = (): CityForm => ({ slug: '', name: '', countryCode: '', isActive: true });

const emptyProvider = (): ProviderForm => ({
  name: '',
  category: 'education',
  cityId: '',
  website: '',
  logoMediaId: null,
  logoUrl: null,
  coverMediaId: null,
  coverUrl: null,
  isActive: true,
  partnershipVerified: false,
});

const emptyOffering = (): OfferingForm => ({
  slug: '',
  title: emptyLocalizedText(),
  summary: emptyLocalizedText(),
  requirementsSummary: emptyLocalizedText(),
  requiredDocumentIds: [],
  providerId: '',
  category: 'education',
  cityId: '',
  logoMediaId: null,
  logoUrl: null,
  coverMediaId: null,
  coverUrl: null,
  isActive: true,
  priceAmount: '',
  priceCurrency: 'USD',
});

/** Reads one locale from a localized value, falling back to English. */
function pickLocalized(value: LocalizedText, locale: AppLocale): string {
  return (value[locale] || value.en || '').trim();
}

/** True when every locale of a localized value is blank. */
function localizedIsEmpty(value: LocalizedText): boolean {
  return APP_LOCALES.every((code) => !value[code].trim());
}

/** Stored media paths are relative; the browser needs an absolute URL to render them. */
function resolveMediaPreview(url: string | null): string | null {
  if (!url) {
    return null;
  }
  return url.startsWith('http') ? url : apiUrl(url);
}

interface ImagePickerProps {
  label: string;
  mediaId: string | null;
  imageUrl: string | null;
  onSelect: (mediaId: string | null, imageUrl: string | null) => void;
  onError: (message: string) => void;
}

/** Uploads a single image to the media library and hands back the stored media id. */
function ImagePicker({ label, mediaId, imageUrl, onSelect, onError }: ImagePickerProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const preview = resolveMediaPreview(imageUrl);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      const { media } = await uploadMedia(file);
      onSelect(media.id, media.url);
    } catch (err) {
      onError((err as Error).message || t('catalog.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.imageField}>
      <span className={styles.imageFieldLabel}>{label}</span>
      <div className={styles.imageFieldBody}>
        <div className={styles.imagePreview}>
          {preview ? (
            <img className={styles.imagePreviewImg} src={preview} alt="" />
          ) : (
            <span className={styles.imagePreviewEmpty}>{t('catalog.noImage')}</span>
          )}
        </div>
        <div className={styles.imageFieldActions}>
          <label className={styles.uploadButton}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              className={styles.fileInput}
              onChange={(event) => void handleChange(event)}
              disabled={uploading}
            />
            {uploading
              ? t('catalog.uploading')
              : mediaId
                ? t('catalog.changeImage')
                : t('catalog.uploadImage')}
          </label>
          {mediaId && (
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => onSelect(null, null)}
              disabled={uploading}
            >
              {t('catalog.removeImage')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatePill({ active, kind = 'active' }: { active: boolean; kind?: 'active' | 'verified' }) {
  const { t } = useTranslation();
  const onLabel = kind === 'verified' ? t('catalog.state.verified') : t('catalog.state.active');
  const offLabel = kind === 'verified' ? t('catalog.state.unverified') : t('catalog.state.inactive');
  return (
    <span className={active ? styles.pillActive : styles.pillInactive}>
      {active ? onLabel : offLabel}
    </span>
  );
}

interface CitiesSectionProps {
  cities: PublicCity[];
  showInactive: boolean;
  reload: () => Promise<void>;
}

function CitiesSection({ cities, showInactive, reload }: CitiesSectionProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CityForm>(emptyCity);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = showInactive ? cities : cities.filter((city) => city.isActive);

  function startEdit(city: PublicCity) {
    setEditingId(city.id);
    setError(null);
    setForm({
      slug: city.slug,
      name: city.name,
      countryCode: city.countryCode,
      isActive: city.isActive,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyCity());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        slug: form.slug,
        name: form.name,
        countryCode: form.countryCode,
        isActive: form.isActive,
      };
      if (editingId) {
        await updateCity(editingId, payload);
      } else {
        await createCity(payload);
      }
      resetForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('catalog.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.section}>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          <span>{t('catalog.cities.name')}</span>
          <input
            type="text"
            value={form.name}
            required
            maxLength={80}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{t('catalog.cities.slug')}</span>
          <input
            type="text"
            value={form.slug}
            required
            maxLength={60}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{t('catalog.cities.country')}</span>
          <input
            type="text"
            value={form.countryCode}
            required
            maxLength={2}
            pattern="[A-Za-z]{2}"
            onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
          />
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <span>{t('catalog.state.active')}</span>
        </label>
        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {editingId ? t('catalog.save') : t('catalog.create')}
          </button>
          {editingId && (
            <button type="button" className={styles.ghostButton} onClick={resetForm} disabled={saving}>
              {t('catalog.cancel')}
            </button>
          )}
        </div>
      </form>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className={styles.muted}>{t('catalog.empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('catalog.columns.name')}</th>
                <th scope="col">{t('catalog.columns.slug')}</th>
                <th scope="col">{t('catalog.columns.country')}</th>
                <th scope="col">{t('catalog.columns.active')}</th>
                <th scope="col">{t('catalog.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((city) => (
                <tr key={city.id}>
                  <td className={styles.titleCell}>{city.name}</td>
                  <td className={styles.monoCell}>{city.slug}</td>
                  <td>{city.countryCode}</td>
                  <td>
                    <StatePill active={city.isActive} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => startEdit(city)}
                    >
                      {t('catalog.edit')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface ProvidersSectionProps {
  providers: PublicProvider[];
  cities: PublicCity[];
  showInactive: boolean;
  reload: () => Promise<void>;
}

function ProvidersSection({ providers, cities, showInactive, reload }: ProvidersSectionProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ProviderForm>(emptyProvider);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = showInactive ? providers : providers.filter((provider) => provider.isActive);
  const cityName = (cityId: string) => cities.find((city) => city.id === cityId)?.name ?? cityId;

  function startEdit(provider: PublicProvider) {
    setEditingId(provider.id);
    setError(null);
    setForm({
      name: provider.name,
      category: provider.category,
      cityId: provider.cityId,
      website: provider.website ?? '',
      logoMediaId: provider.logoMediaId,
      logoUrl: provider.logoUrl,
      coverMediaId: provider.coverMediaId,
      coverUrl: provider.coverImageUrl,
      isActive: provider.isActive,
      partnershipVerified: provider.partnershipVerified,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyProvider());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        cityId: form.cityId,
        website: form.website.trim() ? form.website.trim() : undefined,
        logoMediaId: form.logoMediaId,
        coverMediaId: form.coverMediaId,
        isActive: form.isActive,
        partnershipVerified: form.partnershipVerified,
      };
      if (editingId) {
        await updateProvider(editingId, payload);
      } else {
        await createProvider(payload);
      }
      resetForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('catalog.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.section}>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          <span>{t('catalog.providers.name')}</span>
          <input
            type="text"
            value={form.name}
            required
            maxLength={160}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{t('catalog.providers.category')}</span>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as ServiceCategory })}
          >
            {SERVICE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`categories.${category}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>{t('catalog.providers.city')}</span>
          <select
            value={form.cityId}
            required
            onChange={(e) => setForm({ ...form, cityId: e.target.value })}
          >
            <option value="" disabled>
              {t('catalog.columns.city')}
            </option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>{t('catalog.providers.website')}</span>
          <input
            type="url"
            value={form.website}
            maxLength={300}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
        </label>
        <ImagePicker
          label={t('catalog.providers.logo')}
          mediaId={form.logoMediaId}
          imageUrl={form.logoUrl}
          onSelect={(logoMediaId, logoUrl) => setForm({ ...form, logoMediaId, logoUrl })}
          onError={setError}
        />
        <ImagePicker
          label={t('catalog.providers.cover')}
          mediaId={form.coverMediaId}
          imageUrl={form.coverUrl}
          onSelect={(coverMediaId, coverUrl) => setForm({ ...form, coverMediaId, coverUrl })}
          onError={setError}
        />
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={form.partnershipVerified}
            onChange={(e) => setForm({ ...form, partnershipVerified: e.target.checked })}
          />
          <span>{t('catalog.providers.verified')}</span>
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <span>{t('catalog.state.active')}</span>
        </label>
        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {editingId ? t('catalog.save') : t('catalog.create')}
          </button>
          {editingId && (
            <button type="button" className={styles.ghostButton} onClick={resetForm} disabled={saving}>
              {t('catalog.cancel')}
            </button>
          )}
        </div>
      </form>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className={styles.muted}>{t('catalog.empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('catalog.columns.name')}</th>
                <th scope="col">{t('catalog.columns.category')}</th>
                <th scope="col">{t('catalog.columns.city')}</th>
                <th scope="col">{t('catalog.columns.verified')}</th>
                <th scope="col">{t('catalog.columns.active')}</th>
                <th scope="col">{t('catalog.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((provider) => (
                <tr key={provider.id}>
                  <td className={styles.titleCell}>{provider.name}</td>
                  <td>
                    <CategoryBadge category={provider.category} />
                  </td>
                  <td>{cityName(provider.cityId)}</td>
                  <td>
                    <StatePill active={provider.partnershipVerified} kind="verified" />
                  </td>
                  <td>
                    <StatePill active={provider.isActive} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => startEdit(provider)}
                    >
                      {t('catalog.edit')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface OfferingsSectionProps {
  providers: PublicProvider[];
  cities: PublicCity[];
  documents: PublicDocumentRequirement[];
  showInactive: boolean;
}

function OfferingsSection({ providers, cities, documents, showInactive }: OfferingsSectionProps) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language.split('-')[0] || 'en') as AppLocale;
  const currencies = useMemo(() => listCurrencies(i18n.language), [i18n.language]);
  const [offerings, setOfferings] = useState<PublicOffering[]>([]);
  const [rules, setRules] = useState<PublicPricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<OfferingForm>(emptyOffering);
  const [formLocale, setFormLocale] = useState<AppLocale>('en');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeDocuments = documents.filter((doc) => doc.isActive);

  /** The general (global) price of an offering: an active rule pinned to the offering id. */
  function generalPriceRule(offeringId: string): PublicPricingRule | undefined {
    return rules.find(
      (rule) => rule.offeringId === offeringId && rule.customerCountryCode === null,
    );
  }

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [offeringData, ruleData] = await Promise.all([
        listOfferings({ includeInactive: true }),
        listPricingRules(),
      ]);
      setOfferings(offeringData.data);
      setRules(ruleData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('catalog.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = showInactive ? offerings : offerings.filter((offering) => offering.isActive);
  const providerName = (providerId: string | null) =>
    (providerId && providers.find((provider) => provider.id === providerId)?.name) ||
    t('catalog.offerings.noProvider');

  function startEdit(offering: PublicOffering) {
    setEditingId(offering.id);
    setError(null);
    setFormLocale('en');
    const price = generalPriceRule(offering.id);
    setForm({
      slug: offering.slug,
      title: offering.title,
      summary: offering.summary,
      requirementsSummary: offering.requirementsSummary ?? emptyLocalizedText(),
      requiredDocumentIds: offering.requiredDocumentIds,
      providerId: offering.providerId ?? '',
      category: offering.category,
      cityId: offering.cityId,
      logoMediaId: offering.logoMediaId,
      logoUrl: offering.logoUrl,
      coverMediaId: offering.coverMediaId,
      coverUrl: offering.coverImageUrl,
      isActive: offering.isActive,
      priceAmount: price?.amount ?? '',
      priceCurrency: price?.currency ?? 'USD',
    });
  }

  function resetForm() {
    setEditingId(null);
    setFormLocale('en');
    setForm(emptyOffering());
  }

  function setLocalized(field: 'title' | 'summary' | 'requirementsSummary', value: string) {
    setForm((current) => ({ ...current, [field]: { ...current[field], [formLocale]: value } }));
  }

  function toggleRequiredDocument(id: string) {
    setForm((current) => ({
      ...current,
      requiredDocumentIds: current.requiredDocumentIds.includes(id)
        ? current.requiredDocumentIds.filter((item) => item !== id)
        : [...current.requiredDocumentIds, id],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        slug: form.slug,
        title: form.title,
        summary: form.summary,
        requirementsSummary: localizedIsEmpty(form.requirementsSummary)
          ? undefined
          : form.requirementsSummary,
        requiredDocumentIds: form.requiredDocumentIds,
        providerId: form.providerId ? form.providerId : null,
        ...(form.providerId ? {} : { category: form.category, cityId: form.cityId }),
        logoMediaId: form.logoMediaId,
        coverMediaId: form.coverMediaId,
        isActive: form.isActive,
      };
      let savedId: string;
      if (editingId) {
        const { offering } = await updateOffering(editingId, payload);
        savedId = offering.id;
      } else {
        const { offering } = await createOffering(payload);
        savedId = offering.id;
      }
      // Every offering carries one general (global) price so a self-service application
      // can always be quoted. We keep it in sync with the same form that owns the service.
      const existing = generalPriceRule(savedId);
      const pricePayload = {
        offeringId: savedId,
        amount: form.priceAmount.trim(),
        currency: form.priceCurrency,
        isActive: true,
      };
      if (existing) {
        await updatePricingRule(existing.id, pricePayload);
      } else {
        await createPricingRule(pricePayload);
      }
      resetForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('catalog.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.section}>
      <form className={`${styles.form} ${styles.formWide}`} onSubmit={submit}>
        <label className={styles.field}>
          <span>{t('catalog.offerings.slug')}</span>
          <input
            type="text"
            value={form.slug}
            required
            maxLength={60}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{t('catalog.offerings.provider')}</span>
          <select
            value={form.providerId}
            onChange={(e) => setForm({ ...form, providerId: e.target.value })}
          >
            <option value="">{t('catalog.offerings.noProvider')}</option>
            {providers
              .filter((provider) => provider.isActive)
              .map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
          </select>
        </label>
        {!form.providerId && (
          <>
            <label className={styles.field}>
              <span>{t('catalog.offerings.category')}</span>
              <select
                value={form.category}
                required
                onChange={(e) => setForm({ ...form, category: e.target.value as ServiceCategory })}
              >
                {SERVICE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`categories.${category}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>{t('catalog.offerings.city')}</span>
              <select
                value={form.cityId}
                required
                onChange={(e) => setForm({ ...form, cityId: e.target.value })}
              >
                <option value="" disabled>
                  {t('catalog.columns.city')}
                </option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <span>{t('catalog.state.active')}</span>
        </label>
        <label className={styles.field}>
          <span>{t('catalog.offerings.priceAmount')}</span>
          <input
            type="text"
            inputMode="decimal"
            value={form.priceAmount}
            required
            maxLength={24}
            pattern="[0-9]+([.][0-9]{1,2})?"
            placeholder="0.00"
            onChange={(e) => setForm({ ...form, priceAmount: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{t('catalog.offerings.priceCurrency')}</span>
          <CurrencySelect
            value={form.priceCurrency}
            options={currencies}
            onChange={(code) => setForm({ ...form, priceCurrency: code })}
          />
        </label>
        <p className={`${styles.documentHint} ${styles.fieldFull}`}>
          {t('catalog.offerings.priceHint')}
        </p>
        <div className={`${styles.localeBlock} ${styles.fieldFull}`}>
          <div className={styles.localeTabs} role="tablist" aria-label={t('language.label')}>
            {APP_LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={formLocale === code}
                className={`${styles.localeTab} ${
                  formLocale === code ? styles.localeTabActive : ''
                }`}
                onClick={() => setFormLocale(code)}
              >
                {t(`language.${code}`)}
              </button>
            ))}
          </div>
          <div className={styles.localePanel}>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>{t('catalog.offerings.title')}</span>
              <input
                type="text"
                value={form.title[formLocale]}
                maxLength={160}
                onChange={(e) => setLocalized('title', e.target.value)}
              />
            </label>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>{t('catalog.offerings.summary')}</span>
              <textarea
                value={form.summary[formLocale]}
                maxLength={800}
                rows={2}
                onChange={(e) => setLocalized('summary', e.target.value)}
              />
            </label>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>{t('catalog.offerings.requirements')}</span>
              <textarea
                value={form.requirementsSummary[formLocale]}
                maxLength={800}
                rows={2}
                onChange={(e) => setLocalized('requirementsSummary', e.target.value)}
              />
            </label>
          </div>
        </div>
        <ImagePicker
          label={t('catalog.offerings.logo')}
          mediaId={form.logoMediaId}
          imageUrl={form.logoUrl}
          onSelect={(logoMediaId, logoUrl) => setForm({ ...form, logoMediaId, logoUrl })}
          onError={setError}
        />
        <ImagePicker
          label={t('catalog.offerings.cover')}
          mediaId={form.coverMediaId}
          imageUrl={form.coverUrl}
          onSelect={(coverMediaId, coverUrl) => setForm({ ...form, coverMediaId, coverUrl })}
          onError={setError}
        />
        <div className={styles.documentField}>
          <span className={styles.documentFieldLabel}>
            {t('catalog.offerings.requiredDocuments')}
          </span>
          <p className={styles.documentHint}>{t('catalog.offerings.requiredDocumentsHint')}</p>
          {activeDocuments.length === 0 ? (
            <p className={styles.documentHint}>{t('catalog.offerings.noDocuments')}</p>
          ) : (
            <div className={styles.documentList}>
              {activeDocuments.map((doc) => (
                <label key={doc.id} className={styles.documentOption}>
                  <input
                    type="checkbox"
                    checked={form.requiredDocumentIds.includes(doc.id)}
                    onChange={() => toggleRequiredDocument(doc.id)}
                  />
                  <span className={styles.documentOptionText}>
                    <span className={styles.documentOptionName}>
                      {pickLocalized(doc.title, locale) || doc.key}
                    </span>
                    <span className={styles.documentOptionMeta}>
                      {t(`documentLibrary.kind.${doc.kind}`)} · {doc.key}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {editingId ? t('catalog.save') : t('catalog.create')}
          </button>
          {editingId && (
            <button type="button" className={styles.ghostButton} onClick={resetForm} disabled={saving}>
              {t('catalog.cancel')}
            </button>
          )}
        </div>
      </form>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className={styles.muted}>{t('catalog.loading')}</p>
      ) : rows.length === 0 ? (
        <p className={styles.muted}>{t('catalog.empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('catalog.columns.title')}</th>
                <th scope="col">{t('catalog.columns.slug')}</th>
                <th scope="col">{t('catalog.columns.category')}</th>
                <th scope="col">{t('catalog.columns.provider')}</th>
                <th scope="col">{t('catalog.columns.active')}</th>
                <th scope="col">{t('catalog.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((offering) => (
                <tr key={offering.id}>
                  <td className={styles.titleCell}>{pickLocalized(offering.title, locale)}</td>
                  <td className={styles.monoCell}>{offering.slug}</td>
                  <td>
                    <CategoryBadge category={offering.category} />
                  </td>
                  <td>{providerName(offering.providerId)}</td>
                  <td>
                    <StatePill active={offering.isActive} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => startEdit(offering)}
                    >
                      {t('catalog.edit')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CatalogView() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('cities');
  const [showInactive, setShowInactive] = useState(false);
  const [cities, setCities] = useState<PublicCity[]>([]);
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [documents, setDocuments] = useState<PublicDocumentRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCities = useCallback(async () => {
    const data = await listCities({ includeInactive: true });
    setCities(data.data);
  }, []);

  const loadProviders = useCallback(async () => {
    const data = await listProviders({ includeInactive: true });
    setProviders(data.data);
  }, []);

  const loadDocuments = useCallback(async () => {
    const data = await listDocumentRequirements();
    setDocuments(data.data);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadCities(), loadProviders(), loadDocuments()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('catalog.loadError'));
    } finally {
      setLoading(false);
    }
  }, [loadCities, loadProviders, loadDocuments, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'cities', label: t('catalog.tabs.cities') },
    { id: 'providers', label: t('catalog.tabs.providers') },
    { id: 'offerings', label: t('catalog.tabs.offerings') },
  ];

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('catalog.title')}</h2>
        <div className={styles.headerActions}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            <span>{t('catalog.showInactive')}</span>
          </label>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => void loadAll()}
            disabled={loading}
          >
            {t('catalog.refresh')}
          </button>
        </div>
      </header>

      <nav className={styles.tabs} aria-label={t('catalog.title')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className={styles.muted}>{t('catalog.loading')}</p>
      ) : (
        <>
          {tab === 'cities' && (
            <CitiesSection cities={cities} showInactive={showInactive} reload={loadCities} />
          )}
          {tab === 'providers' && (
            <ProvidersSection
              providers={providers}
              cities={cities}
              showInactive={showInactive}
              reload={loadProviders}
            />
          )}
          {tab === 'offerings' && (
            <OfferingsSection
              providers={providers}
              cities={cities}
              documents={documents}
              showInactive={showInactive}
            />
          )}
        </>
      )}
    </section>
  );
}
