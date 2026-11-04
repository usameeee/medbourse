import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { usePageContent } from '../siteContent';
import { staggerChild, staggerParent } from './Reveal';
import styles from './PublicPages.module.css';

const SECTIONS = [
  'dataWeCollect',
  'howWeUse',
  'sensitiveData',
  'dataSharing',
  'retention',
  'rights',
  'cookies',
  'contact',
] as const;

/** Fixed date the built-in copy was last revised; rendered per locale. */
const LAST_UPDATED = new Date('2026-10-16T00:00:00Z');

/** Standalone "privacy policy" page: how data is collected, used, and protected. */
export default function PrivacyPage() {
  const { t, i18n } = useTranslation();
  const cms = usePageContent('privacy');

  const updated = cms?.updated
    ? cms.updated
    : new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(LAST_UPDATED);

  const sections =
    cms && cms.sections.length > 0
      ? cms.sections
      : SECTIONS.map((key) => ({
          id: key,
          title: t(`privacyPage.sections.${key}.title`),
          body: t(`privacyPage.sections.${key}.body`),
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
        <p className={styles.eyebrow}>{cms?.eyebrow || t('privacyPage.eyebrow')}</p>
        <h1 className={styles.title}>{cms?.title || t('privacyPage.title')}</h1>
        <p className={styles.lead}>{cms?.lead || t('privacyPage.lead')}</p>
        <p className={styles.updated}>{t('privacyPage.updated', { date: updated })}</p>
      </motion.header>

      <motion.div className={styles.prose} variants={staggerParent}>
        {sections.map((section) => (
          <motion.section key={section.id} className={styles.proseSection} variants={staggerChild}>
            <h2 className={styles.proseTitle}>{section.title}</h2>
            <p className={styles.proseBody}>{section.body}</p>
          </motion.section>
        ))}
      </motion.div>
    </motion.div>
  );
}
