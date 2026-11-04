import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PublicShowcaseSlide } from '@medbourse/shared';
import { listShowcase } from '../api';
import { usePublicAuth } from './PublicLayout';
import CinematicHero from './CinematicHero';
import styles from './PublicSite.module.css';

type LoadState = 'loading' | 'ready' | 'error';

/** The public home page: the scroll-controlled cinematic hero, framed by the shared header and footer. */
export default function PublicSite() {
  const { t } = useTranslation();
  const { openAuth } = usePublicAuth();
  const [slides, setSlides] = useState<PublicShowcaseSlide[]>([]);
  const [showcase, setShowcase] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await listShowcase();
        if (cancelled) return;
        setSlides(res.data);
        setShowcase('ready');
      } catch {
        if (!cancelled) setShowcase('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasStory = showcase === 'ready' && slides.length > 0;

  if (hasStory) {
    return <CinematicHero slides={slides} />;
  }

  return (
    <section className={styles.hero} aria-labelledby="public-hero-title">
      <p className={styles.eyebrow}>{t('brand.eyebrow')}</p>
      <h1 className={styles.heroTitle} id="public-hero-title">
        {t('brand.leadTitle')}
      </h1>
      <p className={styles.heroLead}>{t('brand.lead')}</p>
      <div className={styles.heroActions}>
        <button type="button" className={styles.primaryCta} onClick={openAuth}>
          {t('publicSite.contact.cta')}
        </button>
        <Link className={styles.secondaryCta} to="/services">
          {t('publicSite.nav.services')}
        </Link>
      </div>
    </section>
  );
}
