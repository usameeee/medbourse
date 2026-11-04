import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { usePageContent } from '../siteContent';
import { staggerChild, staggerParent } from './Reveal';
import styles from './PublicPages.module.css';

const SECTIONS = [
  'acceptance',
  'services',
  'accounts',
  'quotations',
  'acceptableUse',
  'liability',
  'changes',
  'contact',
] as const;

/** Fixed date the built-in copy was last revised; rendered per locale. */
const LAST_UPDATED = new Date('2026-10-16T00:00:00Z');

/** Standalone "terms of service" page: the rules that apply when using the platform. */
export default function TermsPage() {
  const { t, i18n } = useTranslation();
  const cms = usePageContent('terms');

  const updated = cms?.updated
    ? cms.updated
    : new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(LAST_UPDATED);

  const sections =
    cms && cms.sections.length > 0
      ? cms.sections
      : SECTIONS.map((key) => ({
          id: key,
          title: t(`termsPage.sections.${key}.title`),
          body: t(`termsPage.sections.${key}.body`),
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
        <p className={styles.eyebrow}>{cms?.eyebrow || t('termsPage.eyebrow')}</p>
        <h1 className={styles.title}>{cms?.title || t('termsPage.title')}</h1>
        <p className={styles.lead}>{cms?.lead || t('termsPage.lead')}</p>
        <p className={styles.updated}>{t('termsPage.updated', { date: updated })}</p>
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
