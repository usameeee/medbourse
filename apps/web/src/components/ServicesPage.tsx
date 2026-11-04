import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SERVICE_CATEGORIES, type ServiceCategory } from '@medbourse/shared';
import { usePageContent } from '../siteContent';
import { staggerChild, staggerParent } from './Reveal';
import styles from './PublicPages.module.css';

/** Each line keeps its own accent, matching its hero and landing page. */
const AURA: Record<ServiceCategory, string> = {
  education: styles.auraEducation,
  medical: styles.auraMedical,
  tourism: styles.auraTourism,
};

interface ServiceRow {
  category: ServiceCategory;
  title: string;
  body: string;
}

/** Standalone "services" page: the three coordinated lines as numbered editorial rows. */
export default function ServicesPage() {
  const { t } = useTranslation();
  const cms = usePageContent('services');

  const eyebrow = cms?.eyebrow || t('brand.eyebrow');
  const title = cms?.title || t('publicSite.services.title');
  const lead = cms?.lead || t('publicSite.services.lead');

  const rows: ServiceRow[] =
    cms && cms.sections.length > 0
      ? cms.sections.slice(0, SERVICE_CATEGORIES.length).flatMap((section, index) => {
          const category = SERVICE_CATEGORIES[index];
          return category ? [{ category, title: section.title, body: section.body }] : [];
        })
      : SERVICE_CATEGORIES.map((category) => ({
          category,
          title: t(`categories.${category}`),
          body: t(`publicSite.services.${category}.body`),
        }));

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lead}>{lead}</p>
      </header>

      <motion.ul
        className={styles.rows}
        variants={staggerParent}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
      >
        {rows.map((row, index) => {
          const rotation = index % 2 === 0 ? -1 : 1;
          return (
            <motion.li
              key={row.category}
              variants={staggerChild}
              className={`${styles.row} ${AURA[row.category]}`}
              style={{ rotate: `${rotation}deg` }}
              whileHover={{ rotate: 0, scale: 1.02, zIndex: 10 }}
            >
              <Link className={styles.rowLink} to={`/category/${row.category}`}>
                <span className={styles.rowNumber} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{row.title}</span>
                  {row.body && <span className={styles.rowText}>{row.body}</span>}
                </span>
                <span className={styles.rowCta}>
                  {t(`categoryCta.${row.category}`)}
                  <span className={styles.rowArrow} aria-hidden="true">
                    →
                  </span>
                </span>
              </Link>
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}
