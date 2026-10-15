import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SERVICE_CATEGORIES } from '@medbourse/shared';
import type { PublicCity, PublicOffering, PublicProvider, ServiceCategory } from '@medbourse/shared';
import {
  createCity,
  createOffering,
  createProvider,
  listCities,
  listOfferings,
  listProviders,
  updateCity,
  updateOffering,
  updateProvider,
} from '../api';
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
  isActive: boolean;
  partnershipVerified: boolean;
}

interface OfferingForm {
  slug: string;
  title: string;
  summary: string;
  requirementsSummary: string;
  providerId: string;
  isActive: boolean;
}

const emptyCity = (): CityForm => ({ slug: '', name: '', countryCode: '', isActive: true });

const emptyProvider = (): ProviderForm => ({
  name: '',
  category: 'education',
  cityId: '',
  website: '',
  isActive: true,
  partnershipVerified: false,
});

const emptyOffering = (): OfferingForm => ({
  slug: '',
  title: '',
  summary: '',
  requirementsSummary: '',
  providerId: '',
  isActive: true,
});

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
  showInactive: boolean;
}

function OfferingsSection({ providers, showInactive }: OfferingsSectionProps) {
  const { t } = useTranslation();
  const [offerings, setOfferings] = useState<PublicOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<OfferingForm>(emptyOffering);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listOfferings({ includeInactive: true });
      setOfferings(data.data);
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
  const providerName = (providerId: string) =>
    providers.find((provider) => provider.id === providerId)?.name ?? providerId;

  function startEdit(offering: PublicOffering) {
    setEditingId(offering.id);
    setError(null);
    setForm({
      slug: offering.slug,
      title: offering.title,
      summary: offering.summary,
      requirementsSummary: offering.requirementsSummary ?? '',
      providerId: offering.providerId,
      isActive: offering.isActive,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyOffering());
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
        requirementsSummary: form.requirementsSummary.trim()
          ? form.requirementsSummary.trim()
          : undefined,
        providerId: form.providerId,
        isActive: form.isActive,
      };
      if (editingId) {
        await updateOffering(editingId, payload);
      } else {
        await createOffering(payload);
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
          <span>{t('catalog.offerings.title')}</span>
          <input
            type="text"
            value={form.title}
            required
            maxLength={160}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
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
            required
            onChange={(e) => setForm({ ...form, providerId: e.target.value })}
          >
            <option value="" disabled>
              {t('catalog.columns.provider')}
            </option>
            {providers
              .filter((provider) => provider.isActive)
              .map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
          </select>
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <span>{t('catalog.state.active')}</span>
        </label>
        <label className={`${styles.field} ${styles.fieldFull}`}>
          <span>{t('catalog.offerings.summary')}</span>
          <textarea
            value={form.summary}
            required
            maxLength={800}
            rows={2}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </label>
        <label className={`${styles.field} ${styles.fieldFull}`}>
          <span>{t('catalog.offerings.requirements')}</span>
          <textarea
            value={form.requirementsSummary}
            maxLength={800}
            rows={2}
            onChange={(e) => setForm({ ...form, requirementsSummary: e.target.value })}
          />
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
                  <td className={styles.titleCell}>{offering.title}</td>
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

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadCities(), loadProviders()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('catalog.loadError'));
    } finally {
      setLoading(false);
    }
  }, [loadCities, loadProviders, t]);

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
            <OfferingsSection providers={providers} showInactive={showInactive} />
          )}
        </>
      )}
    </section>
  );
}
