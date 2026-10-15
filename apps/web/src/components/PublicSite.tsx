import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SERVICE_CATEGORIES } from '@medbourse/shared';
import type { HealthResponse, PublicCity, PublicOffering, PublicProvider, PublicUser } from '@medbourse/shared';
import { listCities, listOfferings, listProviders } from '../api';
import { CategoryBadge } from './StatusBadge';
import AuthPanel from './AuthPanel';
import LanguageSwitcher from './LanguageSwitcher';
import styles from './PublicSite.module.css';

export type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'error'; message: string };

interface PublicSiteProps {
  health: HealthState;
  onAuthenticated: (user: PublicUser) => void;
}

type CatalogState = 'loading' | 'ready' | 'error';

export default function PublicSite({ health, onAuthenticated }: PublicSiteProps) {
  const { t } = useTranslation();
  const [offerings, setOfferings] = useState<PublicOffering[]>([]);
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [cities, setCities] = useState<PublicCity[]>([]);
  const [catalog, setCatalog] = useState<CatalogState>('loading');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [offeringsRes, providersRes, citiesRes] = await Promise.all([
          listOfferings(),
          listProviders(),
          listCities(),
        ]);
        if (cancelled) return;
        setOfferings(offeringsRes.data);
        setProviders(providersRes.data);
        setCities(citiesRes.data);
        setCatalog('ready');
      } catch {
        if (!cancelled) setCatalog('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const providerName = (providerId: string) =>
    providers.find((provider) => provider.id === providerId)?.name;
  const cityName = (cityId: string) => cities.find((city) => city.id === cityId)?.name;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.brand}>{t('brand.name')}</span>
        <nav className={styles.nav} aria-label={t('publicSite.navAria')}>
          <a className={styles.navLink} href="#services">
            {t('publicSite.nav.services')}
          </a>
          <a className={styles.navLink} href="#offerings">
            {t('publicSite.nav.offerings')}
          </a>
          <a className={styles.navLink} href="#contact">
            {t('publicSite.nav.contact')}
          </a>
        </nav>
        <LanguageSwitcher />
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>{t('brand.eyebrow')}</p>
        <h1 className={styles.heroTitle}>{t('brand.name')}</h1>
        <p className={styles.heroLead}>{t('brand.lead')}</p>
        <a className={styles.heroCta} href="#contact">
          {t('publicSite.contact.cta')}
        </a>
      </section>

      <section className={styles.section} id="services" aria-labelledby="public-services-title">
        <h2 className={styles.sectionTitle} id="public-services-title">
          {t('publicSite.services.title')}
        </h2>
        <p className={styles.sectionLead}>{t('publicSite.services.lead')}</p>
        <ul className={styles.serviceGrid}>
          {SERVICE_CATEGORIES.map((category) => (
            <li key={category} className={styles.serviceCard}>
              <h3 className={styles.cardTitle}>{t(`categories.${category}`)}</h3>
              <p className={styles.cardBody}>{t(`publicSite.services.${category}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} id="offerings" aria-labelledby="public-offerings-title">
        <h2 className={styles.sectionTitle} id="public-offerings-title">
          {t('publicSite.offerings.title')}
        </h2>
        <p className={styles.sectionLead}>{t('publicSite.offerings.lead')}</p>

        {catalog === 'loading' && <p className={styles.muted}>{t('publicSite.offerings.loading')}</p>}
        {catalog === 'error' && (
          <p className={styles.error} role="alert">
            {t('publicSite.offerings.error')}
          </p>
        )}
        {catalog === 'ready' && offerings.length === 0 && (
          <p className={styles.muted}>{t('publicSite.offerings.empty')}</p>
        )}
        {catalog === 'ready' && offerings.length > 0 && (
          <ul className={styles.offeringGrid}>
            {offerings.map((offering) => {
              const provider = providerName(offering.providerId);
              const city = cityName(offering.cityId);
              const location = [provider, city].filter(Boolean).join(' · ');
              return (
                <li key={offering.id} className={styles.offeringCard}>
                  <div className={styles.badgeRow}>
                    <CategoryBadge category={offering.category} />
                  </div>
                  <h3 className={styles.cardTitle}>{offering.title}</h3>
                  <p className={styles.cardBody}>{offering.summary}</p>
                  {offering.requirementsSummary && (
                    <p className={styles.offeringReq}>
                      <span>{t('publicSite.offerings.requirements')}</span>{' '}
                      {offering.requirementsSummary}
                    </p>
                  )}
                  {location && (
                    <p className={styles.offeringMeta}>
                      {t('publicSite.offerings.from')} {location}
                    </p>
                  )}
                  <p className={styles.disclaimer}>{offering.disclaimer}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.section} id="contact" aria-labelledby="public-contact-title">
        <h2 className={styles.sectionTitle} id="public-contact-title">
          {t('publicSite.contact.title')}
        </h2>
        <p className={styles.contactBody}>{t('publicSite.contact.body')}</p>
      </section>

      <AuthPanel onAuthenticated={onAuthenticated} />

      <footer className={styles.footer}>
        <section className={styles.status} aria-live="polite">
          <h2 className={styles.statusTitle}>{t('health.title')}</h2>
          {health.kind === 'loading' && <p className={styles.muted}>{t('health.loading')}</p>}
          {health.kind === 'error' && (
            <p className={styles.error}>{t('health.error', { message: health.message })}</p>
          )}
          {health.kind === 'ok' && (
            <dl className={styles.meta}>
              <div>
                <dt>{t('health.service')}</dt>
                <dd>{health.data.service}</dd>
              </div>
              <div>
                <dt>{t('health.version')}</dt>
                <dd>{health.data.version}</dd>
              </div>
              <div>
                <dt>{t('health.status')}</dt>
                <dd>{health.data.status}</dd>
              </div>
              <div>
                <dt>{t('health.database')}</dt>
                <dd>
                  {health.data.database === 'connected'
                    ? t('health.connected')
                    : t('health.disconnected')}
                </dd>
              </div>
            </dl>
          )}
        </section>
      </footer>
    </div>
  );
}
