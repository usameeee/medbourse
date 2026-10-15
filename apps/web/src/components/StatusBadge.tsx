import { useTranslation } from 'react-i18next';
import type {
  CaseStatus,
  PaymentEvidenceStatus,
  ServiceCategory,
  WorkflowStageStatus,
} from '@medbourse/shared';
import styles from './StatusBadge.module.css';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface StatusBadgeProps {
  tone: BadgeTone;
  label: string;
}

export function StatusBadge({ tone, label }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`} role="status">
      {label}
    </span>
  );
}

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const { t } = useTranslation();
  const tone: BadgeTone = status === 'open' ? 'info' : 'success';
  return <StatusBadge tone={tone} label={t(`cases.status.${status}`)} />;
}

export function WorkflowStageBadge({ status }: { status: WorkflowStageStatus }) {
  const { t } = useTranslation();
  const tone: BadgeTone =
    status === 'done'
      ? 'success'
      : status === 'in_progress'
        ? 'warning'
        : status === 'skipped'
          ? 'muted'
          : 'muted';
  return <StatusBadge tone={tone} label={t(`workflow.status.${status}`)} />;
}

export function PaymentEvidenceBadge({ status }: { status: PaymentEvidenceStatus }) {
  const { t } = useTranslation();
  const tone: BadgeTone =
    status === 'approved'
      ? 'success'
      : status === 'rejected'
        ? 'danger'
        : 'warning';
  return <StatusBadge tone={tone} label={t(`payment.status.${status}`)} />;
}

export function CategoryBadge({ category }: { category: ServiceCategory }) {
  const { t } = useTranslation();
  const tone: BadgeTone =
    category === 'education'
      ? 'info'
      : category === 'medical'
        ? 'success'
        : 'warning';
  return <StatusBadge tone={tone} label={t(`categories.${category}`)} />;
}
