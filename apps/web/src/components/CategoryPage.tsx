import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SERVICE_CATEGORIES } from '@medbourse/shared';
import type {
  AppLocale,
  LocalizedText,
  PublicCity,
  PublicOffering,
  PublicProvider,
  PublicShowcaseSlide,
  ServiceCategory,
} from '@medbourse/shared';
import { apiUrl, listCities, listOfferings, listProviders, listShowcase } from '../api';
import { usePublicAuth } from './PublicLayout';
import { CategoryBadge } from './StatusBadge';
import { staggerChild, staggerParent } from './Reveal';
import BrandMark from './BrandMark';
import HeroImage from './HeroImage';
import styles from './CategoryPage.module.css';

type LoadState = 'loading' | 'ready' | 'error';

const CATEGORY_AURA: Record<ServiceCategory, string> = {
  education: styles.auraEducation,
  medical: styles.auraMedical,
  tourism: styles.auraTourism,
};

/** Stored media paths are relative; the browser needs an absolute URL to render them. */
function mediaSrc(url: string | null): string | null {
  if (!url) {
    return null;
  }
  return url.startsWith('http') ? url : apiUrl(url);
}

/** Reads one locale from a localized value, falling back to English. */
function pick(text: LocalizedText, locale: AppLocale): string {
  return (text[locale] || text.en || '').trim();
}

/**
 * Cover photo for a catalogue card. A record without its own photo borrows the category's
 * hero shot; if even that is missing, the card wears the category's aura instead of a blank box.
 */
function CardCover({
  url,
  fallbackUrl,
  aura,
}: {
  url: string | null;
  fallbackUrl: string | null;
  aura: string;
}) {
  const src = mediaSrc(url) ?? mediaSrc(fallbackUrl);
  if (!src) {
    return <div className={`${styles.cardCoverFallback} ${aura}`} aria-hidden="true" />;
  }
  return <img className={styles.cardCoverImg} src={src} alt="" loading="lazy" />;
}

/** Partner logo, or the MEDBOURSE wordmark when the record has none. */
function CardLogo({ url }: { url: string | null }) {
  const src = mediaSrc(url);
  if (src) {
    return <img className={styles.cardLogoImg} src={src} alt="" loading="lazy" />;
  }
  return <BrandMark size={22} variant="badge" className={styles.cardLogoMark} />;
}

interface CategoryPageProps {
  signedIn: boolean;
}

/**
 * Public landing page for one service line: every provider and offering the catalogue
 * publishes for that category, so a hero's call to action has somewhere real to land.
 */
export default function CategoryPage({ signedIn }: CategoryPageProps) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language.split('-')[0] || 'en') as AppLocale;
  const { openAuth } = usePublicAuth();
  const { category: categoryParam } = useParams<{ category: string }>();
  const category = SERVICE_CATEGORIES.find((value) => value === categoryParam);

  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [offerings, setOfferings] = useState<PublicOffering[]>([]);
  const [cities, setCities] = useState<PublicCity[]>([]);
  const [showcase, setShowcase] = useState<PublicShowcaseSlide[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (!category) {
      return;
    }
    let cancelled = false;

    async function load() {
      setState('loading');
      try {
        const [providersRes, offeringsRes, citiesRes, showcaseRes] = await Promise.all([
          listProviders({ category }),
          listOfferings({ category }),
          listCities(),
          listShowcase(),
        ]);
        if (cancelled) return;
        setProviders(providersRes.data);
        setOfferings(offeringsRes.data);
        setCities(citiesRes.data);
        setShowcase(showcaseRes.data);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [category]);

  if (!category) {
    return <Navigate to="/" replace />;
  }

  const cityName = (cityId: string) => cities.find((city) => city.id === cityId)?.name;
  const providerFor = (providerId: string | null) =>
    providerId ? providers.find((provider) => provider.id === providerId) : undefined;

  // The home page hero for this line is reused as the category's ambient photo, so a record
  // without its own image still lands on something that belongs to this service.
  const showcaseImage = showcase.find((slide) => slide.category === category)?.imageUrl ?? null;

  return (
    <>
      <section
        className={`${styles.banner} ${CATEGORY_AURA[category]}${
          showcaseImage ? ` ${styles.bannerHasPhoto}` : ''
        }`}
      >
        {showcaseImage && (
          <div className={styles.bannerPhoto} aria-hidden="true">
            <HeroImage
              className={styles.bannerPhotoImg}
              url={showcaseImage}
              alt=""
              sizes="100vw"
              priority
            />
          </div>
        )}
        <div className={styles.bannerInner}>
          <p className={styles.eyebrow}>{t('categoryPage.eyebrow')}</p>
          <h1 className={styles.title}>{t(`categories.${category}`)}</h1>
          <p className={styles.lead}>{t(`publicSite.services.${category}.body`)}</p>
        </div>
      </section>

      <div className={styles.body}>
        {state === 'loading' && <p className={styles.muted}>{t('categoryPage.loading')}</p>}
        {state === 'error' && (
          <p className={styles.error} role="alert">
            {t('categoryPage.loadError')}
          </p>
        )}

        {state === 'ready' && (
          <>
            <section aria-labelledby="category-providers-title">
              <h2 className={styles.sectionTitle} id="category-providers-title">
                {t(`categoryPage.providers.${category}`)}
              </h2>
              {providers.length === 0 ? (
                <p className={styles.muted}>{t('categoryPage.providers.empty')}</p>
              ) : (
                <motion.ul
                  className={styles.grid}
                  variants={staggerParent}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.1 }}
                >
                  {providers.map((provider, index) => {
                    const city = cityName(provider.cityId);
                    const rotation = (index % 3) - 1; // -1, 0, 1
                    return (
                      <motion.li
                        key={provider.id}
                        variants={staggerChild}
                        className={styles.card}
                        style={{ rotate: `${rotation}deg` }}
                        whileHover={{ rotate: 0, scale: 1.02, zIndex: 10 }}
                      >
                        {provider.website && (
                          <a
                            className={styles.cardLinkOverlay}
                            href={provider.website}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`${provider.name} — ${t('categoryPage.providers.website')}`}
                          />
                        )}
                        <div className={styles.cardCover}>
                          <CardCover
                            url={provider.coverImageUrl}
                            fallbackUrl={showcaseImage}
                            aura={CATEGORY_AURA[category]}
                          />
                        </div>
                        <div className={styles.cardContent}>
                          <div className={styles.cardLogo}>
                            <CardLogo url={provider.logoUrl} />
                          </div>
                          <div className={styles.cardHead}>
                            <h3 className={styles.cardTitle}>{provider.name}</h3>
                            <CategoryBadge category={provider.category} />
                          </div>
                          <p className={styles.cardMeta}>
                            {[city, provider.countryCode].filter(Boolean).join(' · ')}
                          </p>
                          <span
                            className={
                              provider.partnershipVerified
                                ? styles.chipVerified
                                : styles.chipUnverified
                            }
                          >
                            {provider.partnershipVerified
                              ? t('categoryPage.providers.verified')
                              : t('categoryPage.providers.unverified')}
                          </span>
                          {provider.website && (
                            <span className={styles.cardLink}>
                              {t('categoryPage.providers.website')}
                            </span>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              )}
            </section>

            <section aria-labelledby="category-offerings-title">
              <h2 className={styles.sectionTitle} id="category-offerings-title">
                {t('categoryPage.offerings.title')}
              </h2>
              {offerings.length === 0 ? (
                <p className={styles.muted}>{t('categoryPage.offerings.empty')}</p>
              ) : (
                <motion.ul
                  className={styles.rows}
                  variants={staggerParent}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.1 }}
                >
                  {offerings.map((offering, index) => {
                    const provider = providerFor(offering.providerId);
                    const location = [provider?.name, cityName(offering.cityId)]
                      .filter(Boolean)
                      .join(' · ');
                    const rotation = index % 2 === 0 ? -1 : 1.2;
                    return (
                      <motion.li
                        key={offering.id}
                        variants={staggerChild}
                        className={styles.row}
                        style={{ rotate: `${rotation}deg` }}
                        whileHover={{ rotate: 0, scale: 1.02, zIndex: 10 }}
                      >
                        <span className={styles.rowNumber} aria-hidden="true">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className={styles.rowMain}>
                          <div className={styles.cardLogo}>
                            <CardLogo url={offering.logoUrl ?? provider?.logoUrl ?? null} />
                          </div>
                          <h3 className={styles.rowTitle}>{pick(offering.title, locale)}</h3>
                          <p className={styles.rowBody}>{pick(offering.summary, locale)}</p>
                          {offering.requirementsSummary &&
                            pick(offering.requirementsSummary, locale) && (
                              <p className={styles.rowMeta}>
                                <span className={styles.metaLabel}>
                                  {t('categoryPage.offerings.requirements')}
                                </span>{' '}
                                {pick(offering.requirementsSummary, locale)}
                              </p>
                            )}
                          {location && (
                            <p className={styles.rowMeta}>
                              {t('categoryPage.offerings.from')} {location}
                            </p>
                          )}
                          <p className={styles.disclaimer}>{offering.disclaimer}</p>
                        </div>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              )}
            </section>
          </>
        )}
      </div>

      <section className={styles.ctaBand}>
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>{t('publicSite.contact.title')}</h2>
          <p className={styles.ctaBody}>{t('publicSite.contact.body')}</p>
          {signedIn ? (
            <Link className={styles.cta} to="/">
              {t('portal.workspace')}
            </Link>
          ) : (
            <button type="button" className={styles.cta} onClick={openAuth}>
              {t('publicSite.contact.cta')}
            </button>
          )}
        </div>
      </section>
    </>
  );
}
