import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  PublicMessage,
  PublicPaymentEvidence,
  PublicQuotation,
} from '@medbourse/shared';
import { createCaseMessage, getCase, listCaseMessages, type CaseDetail } from '../api';
import {
  CaseStatusBadge,
  CategoryBadge,
  PaymentEvidenceBadge,
  WorkflowStageBadge,
} from './StatusBadge';
import styles from './CaseDetailView.module.css';

interface CaseDetailViewProps {
  caseId: string;
  currentUserId?: string;
  onBack: () => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: CaseDetail }
  | { kind: 'error'; message: string };

export default function CaseDetailView({ caseId, currentUserId, onBack }: CaseDetailViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ kind: 'loading' });
      try {
        const data = await getCase(caseId);
        if (!cancelled) setState({ kind: 'ok', data });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : t('caseDetail.loadError'),
          });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [caseId, t]);

  return (
    <section className={styles.wrap}>
      <button type="button" className={styles.backButton} onClick={onBack}>
        {t('caseDetail.back')}
      </button>

      {state.kind === 'loading' && <p className={styles.muted}>{t('caseDetail.loading')}</p>}

      {state.kind === 'error' && (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      )}

      {state.kind === 'ok' && (
        <CaseDetailContent
          data={state.data}
          caseId={caseId}
          currentUserId={currentUserId}
        />
      )}
    </section>
  );
}

function CaseDetailContent({
  data,
  caseId,
  currentUserId,
}: {
  data: CaseDetail;
  caseId: string;
  currentUserId?: string;
}) {
  const { t } = useTranslation();
  const { case: item, documents, quotation, paymentEvidence } = data;

  return (
    <div className={styles.content}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <h2 className={styles.title}>{item.offeringTitle}</h2>
          <div className={styles.badges}>
            <CategoryBadge category={item.category} />
            <CaseStatusBadge status={item.status} />
          </div>
        </div>
        <p className={styles.meta}>
          {t('caseDetail.createdAt', {
            date: new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(item.createdAt)),
          })}
        </p>
      </header>

      {item.workflow && (
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t('caseDetail.workflow')}</h3>
          <p className={styles.cardSub}>
            {t('caseDetail.workflowVersion', { version: item.workflow.versionNumber })}
          </p>
          <ol className={styles.timeline}>
            {item.workflow.stages.map((stage) => (
              <li key={stage.id} className={styles.timelineItem}>
                <div className={styles.timelineDot} data-status={stage.status} />
                <div className={styles.timelineBody}>
                  <div className={styles.timelineHead}>
                    <span className={styles.stageName}>{stage.name}</span>
                    <WorkflowStageBadge status={stage.status} />
                  </div>
                  {stage.description && (
                    <p className={styles.stageDesc}>{stage.description}</p>
                  )}
                  {stage.optional && (
                    <span className={styles.optionalTag}>{t('caseDetail.optional')}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('caseDetail.documents')}</h3>
        {documents.length === 0 ? (
          <p className={styles.muted}>{t('caseDetail.noDocuments')}</p>
        ) : (
          <ul className={styles.docList}>
            {documents.map((doc) => (
              <li key={doc.id} className={styles.docItem}>
                <span className={styles.docName}>{doc.originalFilename}</span>
                <span className={styles.docKind}>{t(`caseDetail.docKind.${doc.kind}`)}</span>
                <span className={styles.docSize}>
                  {formatBytes(doc.sizeBytes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('caseDetail.quotation')}</h3>
        {quotation ? (
          <QuotationBlock quotation={quotation} paymentEvidence={paymentEvidence} />
        ) : (
          <p className={styles.muted}>{t('caseDetail.noQuotation')}</p>
        )}
      </section>

      <MessageThread caseId={caseId} currentUserId={currentUserId} />
    </div>
  );
}

function QuotationBlock({
  quotation,
  paymentEvidence,
}: {
  quotation: PublicQuotation;
  paymentEvidence: PublicPaymentEvidence[];
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.quotation}>
      <dl className={styles.quoGrid}>
        <div>
          <dt>{t('caseDetail.quoAmount')}</dt>
          <dd className={styles.quoAmount}>
            {new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: quotation.currency,
            }).format(Number(quotation.amount))}
          </dd>
        </div>
        <div>
          <dt>{t('caseDetail.quoOffering')}</dt>
          <dd>{quotation.snapshot.offeringTitle}</dd>
        </div>
        <div>
          <dt>{t('caseDetail.quoCategory')}</dt>
          <dd>{t(`categories.${quotation.snapshot.category}`)}</dd>
        </div>
        <div>
          <dt>{t('caseDetail.quoIssuedAt')}</dt>
          <dd>
            {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
              new Date(quotation.issuedAt),
            )}
          </dd>
        </div>
      </dl>
      <p className={styles.disclaimer}>{quotation.snapshot.disclaimer}</p>

      <h4 className={styles.subTitle}>{t('caseDetail.paymentEvidence')}</h4>
      {paymentEvidence.length === 0 ? (
        <p className={styles.muted}>{t('caseDetail.noPaymentEvidence')}</p>
      ) : (
        <ul className={styles.evidenceList}>
          {paymentEvidence.map((ev) => (
            <li key={ev.id} className={styles.evidenceItem}>
              <span className={styles.evidenceName}>{ev.originalFilename}</span>
              <PaymentEvidenceBadge status={ev.status} />
              {ev.reviewNote && (
                <p className={styles.reviewNote}>{ev.reviewNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MessageThread({
  caseId,
  currentUserId,
}: {
  caseId: string;
  currentUserId?: string;
}) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await listCaseMessages(caseId);
        if (!cancelled) setMessages(res.data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : t('caseDetail.messages.loadError'),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [caseId, t]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await createCaseMessage(caseId, body);
      setMessages((prev) => [...prev, res.message]);
      setDraft('');
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : t('caseDetail.messages.sendError'),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>{t('caseDetail.messages.title')}</h3>

      {loadError && (
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className={styles.muted}>{t('caseDetail.messages.loading')}</p>
      ) : messages.length === 0 ? (
        <p className={styles.muted}>{t('caseDetail.messages.empty')}</p>
      ) : (
        <ul className={styles.messageList}>
          {messages.map((msg) => (
            <li
              key={msg.id}
              className={styles.messageItem}
              data-own={msg.authorUserId === currentUserId ? 'true' : undefined}
            >
              <div className={styles.messageHead}>
                <span className={styles.messageAuthor}>
                  {msg.authorUserId === currentUserId
                    ? t('caseDetail.messages.you')
                    : t(`roles.${msg.authorRole}`)}
                </span>
                <time className={styles.messageTime} dateTime={msg.createdAt}>
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(msg.createdAt))}
                </time>
              </div>
              <p className={styles.messageBody}>{msg.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form className={styles.messageForm} onSubmit={handleSubmit}>
        <textarea
          className={styles.messageInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('caseDetail.messages.placeholder')}
          maxLength={4000}
          rows={3}
        />
        {sendError && (
          <p className={styles.error} role="alert">
            {sendError}
          </p>
        )}
        <button
          type="submit"
          className={styles.sendButton}
          disabled={sending || draft.trim().length === 0}
        >
          {sending ? t('caseDetail.messages.sending') : t('caseDetail.messages.send')}
        </button>
      </form>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
