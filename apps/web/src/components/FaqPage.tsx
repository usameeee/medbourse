import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { usePageContent } from '../siteContent';
import { staggerChild, staggerParent } from './Reveal';
import styles from './PublicPages.module.css';

/** Keys are numbered so the built-in list survives translation without an array. */
const FAQ_IDS = ['1', '2', '3', '4', '5', '6'] as const;

function PlusIcon() {
  return (
    <svg
      className={styles.faqIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Standalone "faq" page: a native <details> accordion, keyboard-accessible by default. */
export default function FaqPage() {
  const { t } = useTranslation();
  const cms = usePageContent('faq');

  const items =
    cms && cms.sections.length > 0
      ? cms.sections.map((section) => ({
          id: section.id,
          question: section.title,
          answer: section.body,
        }))
      : FAQ_IDS.map((id) => ({
          id,
          question: t(`faqPage.items.q${id}`),
          answer: t(`faqPage.items.a${id}`),
        }));

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>{cms?.eyebrow || t('faqPage.eyebrow')}</p>
        <h1 className={styles.title}>{cms?.title || t('faqPage.title')}</h1>
        <p className={styles.lead}>{cms?.lead || t('faqPage.lead')}</p>
      </header>

      <motion.ul
        className={styles.faqList}
        variants={staggerParent}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.1 }}
      >
        {items.map((item) => (
          <motion.li key={item.id} variants={staggerChild}>
            <details className={styles.faqItem}>
              <summary className={styles.faqQuestion}>
                {item.question}
                <PlusIcon />
              </summary>
              <p className={styles.faqAnswer}>{item.answer}</p>
            </details>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}
