import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Parent variants that reveal its children one after another. */
export const staggerParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.08 } },
};

/** Child variant: rises and fades in. */
export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

interface RevealProps {
  children: ReactNode;
  className?: string;
}

/**
 * Lifts its children into view once, as the page scrolls. Falls back to a plain wrapper
 * when the visitor prefers reduced motion, so nothing is ever hidden.
 */
export default function Reveal({ children, className }: RevealProps) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      variants={staggerChild}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </motion.div>
  );
}
