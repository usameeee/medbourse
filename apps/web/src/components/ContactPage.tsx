import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SOCIAL_NETWORK_LABELS } from '@medbourse/shared';
import { useSiteContent } from '../siteContent';
import { usePublicAuth } from './PublicLayout';
import { staggerChild, staggerParent } from './Reveal';
import SocialIcon from './SocialIcon';
import styles from './PublicPages.module.css';

interface ContactPageProps {
  signedIn: boolean;
}

interface SocialEntry {
  id: string;
  href: string;
  network: string;
  label: string;
}

/** Standalone "contact" page: how an enquiry runs, the way in, and where to follow along. */
export default function ContactPage({ signedIn }: ContactPageProps) {
  const { t } = useTranslation();
  const { openAuth } = usePublicAuth();
  const siteContent = useSiteContent();

  const social: SocialEntry[] = siteContent.social.map((item) => ({
    id: item.id,
    href: item.url,
    network: item.network,
    label: SOCIAL_NETWORK_LABELS[item.network],
  }));

  return (
    <motion.div
      className={styles.page}
      variants={staggerParent}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
    >
      <motion.header className={styles.head} variants={staggerChild}>
        <p className={styles.eyebrow}>{t('brand.eyebrow')}</p>
        <h1 className={styles.title}>{t('publicSite.contact.title')}</h1>
        <p className={styles.lead}>{t('publicSite.contact.body')}</p>
      </motion.header>

      <motion.section className={styles.contactBand} variants={staggerChild}>
        <div className={styles.contactInner}>
          <h2 className={styles.contactTitle}>{t('brand.leadTitle')}</h2>
          <p className={styles.contactBody}>{t('brand.lead')}</p>
          {signedIn ? (
            <Link className={styles.contactCta} to="/">
              {t('portal.workspace')}
            </Link>
          ) : (
            <button type="button" className={styles.contactCta} onClick={openAuth}>
              {t('publicSite.contact.cta')}
            </button>
          )}
        </div>
      </motion.section>

      {social.length > 0 && (
        <motion.section className={styles.socialRow} variants={staggerChild}>
          <h2 className={styles.socialHeading}>{t('footer.social.label')}</h2>
          <ul className={styles.socialList}>
            {social.map((item) => (
              <li key={item.id}>
                <a
                  className={styles.socialLink}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.label}
                >
                  <SocialIcon name={item.network} />
                </a>
              </li>
            ))}
          </ul>
        </motion.section>
      )}
    </motion.div>
  );
}
