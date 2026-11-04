import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AppLocale,
  CaseRequiredDocument,
  DocumentReviewStatus,
  LocalizedText,
  PublicCase,
  PublicCaseDocument,
  PublicMessage,
  PublicPaymentEvidence,
  PublicQuotation,
} from '@medbourse/shared';
import {
  createCaseMessage,
  getCase,
  getCaseDocumentSignedUrl,
  getPaymentEvidenceSignedUrl,
  getPaymentInstructions,
  listCaseMessages,
  resolveAssetUrl,
  reviewCase,
  reviewCaseDocument,
  reviewPaymentEvidence,
  setCasePaymentAccount,
  submitCaseApplication,
  uploadCaseDocument,
  uploadPaymentEvidence,
  type CaseDetail,
  type PaymentInstructions,
} from '../api';
import {
  CaseReviewBadge,
  CaseStatusBadge,
  CategoryBadge,
  DocumentReviewBadge,
  PaymentEvidenceBadge,
  WorkflowStageBadge,
} from './StatusBadge';
import styles from './CaseDetailView.module.css';

interface CaseDetailViewProps {
  caseId: string;
  currentUserId?: string;
  /** True for accounts that hand in their own application (`case:create:self`). */
  canApply?: boolean;
  onBack: () => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: CaseDetail }
  | { kind: 'error'; message: string };

/** Reads one locale from a localized value, falling back to English. */
function pickLocalized(value: LocalizedText, locale: AppLocale): string {
  return (value[locale] || value.en || '').trim();
}

export default function CaseDetailView({
  caseId,
  currentUserId,
  canApply = false,
  onBack,
}: CaseDetailViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) setState({ kind: 'loading' });
      try {
        const data = await getCase(caseId);
        setState({ kind: 'ok', data });
      } catch (err) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : t('caseDetail.loadError'),
        });
      }
    },
    [caseId, t],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  const reload = useCallback(() => load(false), [load]);

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
          canApply={canApply}
          onChanged={reload}
        />
      )}
    </section>
  );
}

function CaseDetailContent({
  data,
  caseId,
  currentUserId,
  canApply,
  onChanged,
}: {
  data: CaseDetail;
  caseId: string;
  currentUserId?: string;
  canApply: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language.split('-')[0] || 'en') as AppLocale;
  const { case: item, documents, quotation, paymentEvidence } = data;
  const isManager = !canApply;
  /**
   * The intake is still open while the case is a draft. Whoever is completing it — the linked
   * customer, or an admin who opened it on their behalf — uploads the checklist, picks the
   * receiving rail, attaches the receipt, and submits. Once submitted, admins review instead.
   */
  const intakeOpen = item.submittedAt === null;
  /**
   * Reviewing is an admin act on a handed-over file. While the intake is still open the admin
   * completing it uploads rather than judges, so the approve/reject controls stay out
   * of the draft.
   */
  const canReview = isManager && !intakeOpen;
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Which file the detail sheet is showing, or `null` while it is closed.
  const [detail, setDetail] = useState<FileRef | null>(null);

  /**
   * The newest upload for each checklist entry — a re-upload after a rejection replaces the
   * earlier file, so the case is judged on what the customer sent last, not on history.
   */
  const latestByRequirement = new Map<string, PublicCaseDocument>();
  for (const doc of documents) {
    if (!doc.requirementId) continue;
    const current = latestByRequirement.get(doc.requirementId);
    if (!current || doc.createdAt > current.createdAt) {
      latestByRequirement.set(doc.requirementId, doc);
    }
  }
  const fulfilled = new Set(latestByRequirement.keys());

  /**
   * Case-wide review progress: every required document plus the payment counts once, and
   * only an approval counts as done — a pending or rejected file does not.
   */
  const totalSteps = item.requiredDocuments.length + (quotation ? 1 : 0);
  const approvedSteps =
    item.requiredDocuments.filter(
      (req) => latestByRequirement.get(req.requirementId)?.reviewStatus === 'approved',
    ).length + (quotation && paymentEvidence.some((ev) => ev.status === 'approved') ? 1 : 0);
  const progressPercent = totalSteps === 0 ? 0 : Math.round((approvedSteps / totalSteps) * 100);

  /** Uploads with no checklist entry behind them — legacy or free-form files. */
  const unlinkedDocuments = documents.filter((doc) => doc.requirementId === null);

  async function handleUpload(requirement: CaseRequiredDocument, file: File) {
    setUploadingId(requirement.requirementId);
    setUploadError(null);
    try {
      await uploadCaseDocument(caseId, requirement.kind, file, requirement.requirementId);
      await onChanged();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('caseDetail.uploadError'));
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <div className={styles.content}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <h2 className={styles.title}>{item.offeringTitle}</h2>
          <div className={styles.badges}>
            <CategoryBadge category={item.category} />
            <CaseStatusBadge status={item.status} />
            {item.submittedAt === null ? (
              <span className={styles.draftBadge}>{t('caseDetail.draft')}</span>
            ) : (
              <CaseReviewBadge status={item.reviewStatus} />
            )}
          </div>
        </div>
        <p className={styles.meta}>
          {item.submittedAt
            ? t('caseDetail.submittedAt', {
                date: new Intl.DateTimeFormat(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(item.submittedAt)),
              })
            : t('caseDetail.createdAt', {
                date: new Intl.DateTimeFormat(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(item.createdAt)),
              })}
        </p>
      </header>

      {totalSteps > 0 && (
        <div className={styles.progress}>
          <div className={styles.progressHead}>
            <span className={styles.progressLabel}>{t('caseDetail.progressLabel')}</span>
            <span className={styles.progressValue}>
              {t('caseDetail.progressValue', { percent: progressPercent })}
            </span>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('caseDetail.progressLabel')}
          >
            <div className={styles.progressFill} style={{ inlineSize: `${progressPercent}%` }} />
          </div>
        </div>
      )}

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

      {item.requiredDocuments.length > 0 && (
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t('caseDetail.requiredDocuments')}</h3>
          <p className={styles.cardSub}>{t('caseDetail.requiredDocumentsHint')}</p>
          {uploadError && (
            <p className={styles.error} role="alert">
              {uploadError}
            </p>
          )}
          <ul className={styles.reqList}>
            {item.requiredDocuments.map((req) => {
              const latest = latestByRequirement.get(req.requirementId);
              const title = pickLocalized(req.title, locale) || req.key;
              return (
                <li key={req.requirementId} className={styles.reqItem}>
                  <div className={styles.reqBody}>
                    <div className={styles.reqHead}>
                      <span className={styles.reqTitle}>{title}</span>
                      {latest ? (
                        <DocumentReviewBadge status={latest.reviewStatus} />
                      ) : (
                        <span className={`${styles.reqStatus} ${styles.reqStatusPending}`}>
                          {t('caseDetail.pending')}
                        </span>
                      )}
                    </div>
                    <span className={styles.reqMeta}>
                      {t(`caseDetail.docKind.${req.kind}`)}
                    </span>
                    {req.description && (
                      <p className={styles.reqDesc}>{pickLocalized(req.description, locale)}</p>
                    )}
                    {latest?.reviewStatus === 'rejected' && latest.reviewNote && (
                      <p className={styles.rejectNote}>
                        {t('caseDetail.review.rejectedBecause', { note: latest.reviewNote })}
                      </p>
                    )}
                    {/* The upload itself sits with its requirement, so it is obvious which file is which. */}
                    {latest ? (
                      <UploadedDocument
                        caseId={caseId}
                        document={latest}
                        isManager={canReview}
                        onChanged={onChanged}
                        onOpenDetail={() => setDetail({ kind: 'document', id: latest.id })}
                      />
                    ) : (
                      <p className={styles.muted}>{t('caseDetail.notUploaded')}</p>
                    )}
                  </div>
                  {/*
                    The checklist belongs to whoever completes the draft — the customer or an admin on
                    their behalf. Once the case is handed over the slot closes, and reopens only for
                    a file an admin rejected, so it can be replaced without reopening the whole intake.
                  */}
                  {(intakeOpen || latest?.reviewStatus === 'rejected') && (
                    <label className={styles.uploadLabel}>
                      <input
                        type="file"
                        className={styles.fileInput}
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        disabled={uploadingId === req.requirementId}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) void handleUpload(req, file);
                        }}
                      />
                      {uploadingId === req.requirementId
                        ? t('caseDetail.uploading')
                        : t(intakeOpen ? 'caseDetail.upload' : 'caseDetail.reupload')}
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/*
        Uploads that belong to no checklist entry (legacy or free-form files) keep their own
        list; every file tied to a requirement is shown inline in the checklist above.
      */}
      {unlinkedDocuments.length > 0 && (
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t('caseDetail.documents')}</h3>
          <ul className={styles.docList}>
            {unlinkedDocuments.map((doc) => (
              <li key={doc.id}>
                <UploadedDocument
                  caseId={caseId}
                  document={doc}
                  isManager={canReview}
                  onChanged={onChanged}
                  onOpenDetail={() => setDetail({ kind: 'document', id: doc.id })}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('caseDetail.quotation')}</h3>
        {quotation ? (
          <QuotationBlock
            quotation={quotation}
            paymentEvidence={paymentEvidence}
            isManager={canReview}
            hasPaymentAccount={item.paymentAccountId !== null}
            onChanged={onChanged}
            onOpenDetail={(id) => setDetail({ kind: 'evidence', id })}
          />
        ) : (
          <p className={styles.muted}>{t('caseDetail.noQuotation')}</p>
        )}
      </section>

      {isManager && item.submittedAt !== null && item.status !== 'closed' && (
        <CaseReviewCard
          caseId={caseId}
          item={item}
          requiredDocuments={item.requiredDocuments}
          latestByRequirement={latestByRequirement}
          paymentEvidence={paymentEvidence}
          onChanged={onChanged}
        />
      )}

      {intakeOpen && (
        <SubmitApplicationCard
          caseId={caseId}
          quotation={quotation}
          selectedAccountId={item.paymentAccountId}
          requiredDocuments={item.requiredDocuments}
          fulfilled={fulfilled}
          hasReceipt={paymentEvidence.length > 0}
          onChanged={onChanged}
        />
      )}

      {detail && (
        <FileDetailSheet
          caseId={caseId}
          detail={detail}
          documents={documents}
          paymentEvidence={paymentEvidence}
          isManager={canReview}
          onChanged={onChanged}
          onChange={setDetail}
          onClose={() => setDetail(null)}
        />
      )}

      <MessageThread caseId={caseId} currentUserId={currentUserId} />
    </div>
  );
}

/**
 * The customer's hand-over panel. It blocks submission until every required document
 * is uploaded and the payment receipt is attached, mirroring the server-side guard in
 * `POST /cases/:id/submit`.
 */
function SubmitApplicationCard({
  caseId,
  quotation,
  selectedAccountId,
  requiredDocuments,
  fulfilled,
  hasReceipt,
  onChanged,
}: {
  caseId: string;
  quotation: PublicQuotation | null;
  selectedAccountId: string | null;
  requiredDocuments: CaseRequiredDocument[];
  fulfilled: Set<string>;
  hasReceipt: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [instructions, setInstructions] = useState<PaymentInstructions | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!quotation) {
      return;
    }
    let cancelled = false;
    setInstructions(null);
    setAccountError(null);
    getPaymentInstructions(quotation.id)
      .then((res) => {
        if (!cancelled) setInstructions(res);
      })
      .catch(() => {
        if (!cancelled) setAccountError(t('caseDetail.submit.noAccount'));
      });
    return () => {
      cancelled = true;
    };
  }, [quotation, t]);

  const accounts = instructions?.paymentAccounts ?? [];
  const selected = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const docsDone = requiredDocuments.every((req) => fulfilled.has(req.requirementId));
  const ready = Boolean(quotation) && docsDone && hasReceipt && selected !== null;

  async function handleSelect(accountId: string) {
    setSelectingId(accountId);
    setError(null);
    try {
      await setCasePaymentAccount(caseId, accountId);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('caseDetail.submit.selectError'));
    } finally {
      setSelectingId(null);
    }
  }

  async function handleReceipt(file: File) {
    // The receipt proves a payment against a chosen account, so it is only accepted
    // once a payment method is selected — otherwise the proof has nothing to attach to.
    if (!quotation || !selected) return;
    setUploading(true);
    setError(null);
    try {
      await uploadPaymentEvidence(quotation.id, file);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('caseDetail.submit.receiptUploadError'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await submitCaseApplication(caseId);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('caseDetail.submit.submitError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>{t('caseDetail.submit.title')}</h3>
      <p className={styles.cardSub}>{t('caseDetail.submit.hint')}</p>

      {!quotation && (
        <p className={styles.error} role="alert">
          {t('caseDetail.submit.noPrice')}
        </p>
      )}

      {quotation && (
        <div className={styles.payBox}>
          <div className={styles.payAmountRow}>
            <span className={styles.payLabel}>{t('caseDetail.submit.amountDue')}</span>
            <span className={styles.payAmount}>
              {new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: quotation.currency,
              }).format(Number(quotation.amount))}
            </span>
          </div>
          {accounts.length > 0 && (
            <>
              <span className={styles.payLabel}>{t('caseDetail.submit.chooseMethod')}</span>
              <ul className={styles.methodList}>
                {accounts.map((account) => (
                  <li key={account.id}>
                    <button
                      type="button"
                      className={`${styles.methodOption} ${
                        account.id === selectedAccountId ? styles.methodOptionActive : ''
                      }`}
                      aria-pressed={account.id === selectedAccountId}
                      disabled={selectingId !== null || submitting}
                      onClick={() => void handleSelect(account.id)}
                    >
                      <span className={styles.methodName}>
                        {t(`payments.methods.${account.method}`)}
                      </span>
                      <span className={styles.methodMeta}>
                        {account.providerName} · {account.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {selected && (
            <dl className={styles.accountGrid}>
              <div>
                <dt>{t('caseDetail.submit.beneficiary')}</dt>
                <dd>{selected.beneficiaryName}</dd>
              </div>
              {selected.identifiers.map((identifier) => (
                <div key={identifier.key}>
                  <dt>
                    {t(`payments.fields.${identifier.key}`, { defaultValue: identifier.key })}
                  </dt>
                  <dd className={styles.mono}>{identifier.value}</dd>
                </div>
              ))}
              {selected.referenceHint && (
                <div>
                  <dt>{t('caseDetail.submit.reference')}</dt>
                  <dd>{selected.referenceHint}</dd>
                </div>
              )}
            </dl>
          )}
          {accountError && (
            <p className={styles.noteWarning} role="alert">
              {accountError}
            </p>
          )}
        </div>
      )}

      <ul className={styles.progressList}>
        <li className={styles.progressItem} data-done={docsDone ? 'true' : 'false'}>
          <span className={styles.progressCheck} aria-hidden="true">
            {docsDone ? '✓' : '•'}
          </span>
          {docsDone ? t('caseDetail.submit.checklistDone') : t('caseDetail.submit.checklistMissing')}
        </li>
        <li className={styles.progressItem} data-done={selected !== null ? 'true' : 'false'}>
          <span className={styles.progressCheck} aria-hidden="true">
            {selected !== null ? '✓' : '•'}
          </span>
          {selected !== null
            ? t('caseDetail.submit.methodDone')
            : t('caseDetail.submit.methodMissing')}
        </li>
        <li className={styles.progressItem} data-done={hasReceipt ? 'true' : 'false'}>
          <span className={styles.progressCheck} aria-hidden="true">
            {hasReceipt ? '✓' : '•'}
          </span>
          {hasReceipt ? t('caseDetail.submit.receiptDone') : t('caseDetail.submit.receiptMissing')}
        </li>
      </ul>

      {quotation && (
        <div className={styles.receiptRow}>
          <div className={styles.receiptText}>
            <span className={styles.payLabel}>{t('caseDetail.submit.receipt')}</span>
            <p className={styles.cardSub}>
              {selected
                ? t('caseDetail.submit.receiptHint')
                : t('caseDetail.submit.receiptNeedsMethod')}
            </p>
          </div>
          <label
            className={`${styles.uploadLabel} ${
              selected === null ? styles.uploadLabelDisabled : ''
            }`}
          >
            <input
              type="file"
              className={styles.fileInput}
              accept="application/pdf,image/png,image/jpeg,image/webp"
              disabled={uploading || selected === null}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void handleReceipt(file);
              }}
            />
            {uploading
              ? t('caseDetail.submit.uploadingReceipt')
              : t('caseDetail.submit.uploadReceipt')}
          </label>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <p className={ready ? styles.noteReady : styles.muted}>
        {ready ? t('caseDetail.submit.ready') : t('caseDetail.submit.missing')}
      </p>

      <div className={styles.submitActions}>
        <button
          type="button"
          className={styles.submitButton}
          disabled={!ready || submitting || uploading}
          onClick={() => void handleSubmit()}
        >
          {submitting ? t('caseDetail.submit.submitting') : t('caseDetail.submit.submitButton')}
        </button>
      </div>
    </section>
  );
}

function QuotationBlock({
  quotation,
  paymentEvidence,
  isManager,
  hasPaymentAccount,
  onChanged,
  onOpenDetail,
}: {
  quotation: PublicQuotation;
  paymentEvidence: PublicPaymentEvidence[];
  isManager: boolean;
  hasPaymentAccount: boolean;
  onChanged: () => Promise<void>;
  onOpenDetail: (evidenceId: string) => void;
}) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /**
   * A rejected receipt blocks the case, so whoever can fix it — the customer or an admin on their
   * behalf — may send a replacement here. Pending or approved receipts are left untouched.
   */
  const hasRejected = paymentEvidence.some((ev) => ev.status === 'rejected');

  async function handleReupload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      await uploadPaymentEvidence(quotation.id, file);
      await onChanged();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : t('caseDetail.submit.receiptUploadError'),
      );
    } finally {
      setUploading(false);
    }
  }

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
              <div className={styles.docRow}>
                <span className={styles.evidenceName}>{ev.originalFilename}</span>
                <PaymentEvidenceBadge status={ev.status} />
                <span className={styles.docSize}>{formatBytes(ev.sizeBytes)}</span>
                <button
                  type="button"
                  className={styles.detailButton}
                  onClick={() => onOpenDetail(ev.id)}
                >
                  {t('caseDetail.fileDetail.open')}
                </button>
              </div>
              {ev.reviewNote && <p className={styles.reviewNote}>{ev.reviewNote}</p>}
              <MediaPreview
                filename={ev.originalFilename}
                mimeType={ev.mimeType}
                fetchUrl={() => getPaymentEvidenceSignedUrl(ev.id)}
              />
              {isManager && ev.status === 'submitted' && (
                <ReviewControls
                  onDecide={(decision, note) => reviewPaymentEvidence(ev.id, decision, note)}
                  onDone={onChanged}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {/*
        A rejected receipt can be replaced without reopening the intake. The receipt still proves a
        payment into the chosen account, so the control stays locked until a rail is selected.
      */}
      {hasRejected && (
        <div className={styles.receiptRow}>
          <div className={styles.receiptText}>
            <span className={styles.payLabel}>{t('caseDetail.submit.receipt')}</span>
            <p className={styles.cardSub}>
              {hasPaymentAccount
                ? t('caseDetail.submit.receiptReuploadHint')
                : t('caseDetail.submit.receiptNeedsMethod')}
            </p>
          </div>
          <label
            className={`${styles.uploadLabel} ${
              hasPaymentAccount ? '' : styles.uploadLabelDisabled
            }`}
          >
            <input
              type="file"
              className={styles.fileInput}
              accept="application/pdf,image/png,image/jpeg,image/webp"
              disabled={uploading || !hasPaymentAccount}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void handleReupload(file);
              }}
            />
            {uploading
              ? t('caseDetail.submit.uploadingReceipt')
              : t('caseDetail.submit.reuploadReceipt')}
          </label>
          {uploadError && (
            <p className={styles.error} role="alert">
              {uploadError}
            </p>
          )}
        </div>
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

/**
 * One uploaded file: what it is, the admin verdict, an inline preview and — for an admin — the
 * approve/reject controls. Rendered next to the checklist entry it satisfies.
 */
function UploadedDocument({
  caseId,
  document: doc,
  isManager,
  onChanged,
  onOpenDetail,
}: {
  caseId: string;
  document: PublicCaseDocument;
  isManager: boolean;
  onChanged: () => Promise<void>;
  onOpenDetail?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.uploadedFile}>
      <div className={styles.docRow}>
        <span className={styles.docName}>{doc.originalFilename}</span>
        <span className={styles.docKind}>{t(`caseDetail.docKind.${doc.kind}`)}</span>
        <DocumentReviewBadge status={doc.reviewStatus} />
        <span className={styles.docSize}>{formatBytes(doc.sizeBytes)}</span>
        {onOpenDetail && (
          <button type="button" className={styles.detailButton} onClick={onOpenDetail}>
            {t('caseDetail.fileDetail.open')}
          </button>
        )}
      </div>
      <MediaPreview
        filename={doc.originalFilename}
        mimeType={doc.mimeType}
        fetchUrl={() => getCaseDocumentSignedUrl(caseId, doc.id)}
      />
      {isManager && (
        <ReviewControls
          approveDisabled={doc.reviewStatus === 'approved'}
          onDecide={(decision, note) => reviewCaseDocument(caseId, doc.id, decision, note)}
          onDone={onChanged}
        />
      )}
    </div>
  );
}

type ReviewDecision = Exclude<DocumentReviewStatus, 'pending'>;

/** Which file the detail sheet is showing. Ids are unique across both collections. */
type FileRef = { kind: 'document'; id: string } | { kind: 'evidence'; id: string };

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

/**
 * The dedicated page for one uploaded file: its preview, the admin verdict in full, the
 * approve/reject controls, and every version that can be compared against it. Picking a
 * version swaps the panel above instead of leaving the case.
 */
function FileDetailSheet({
  caseId,
  detail,
  documents,
  paymentEvidence,
  isManager,
  onChanged,
  onChange,
  onClose,
}: {
  caseId: string;
  detail: FileRef;
  documents: PublicCaseDocument[];
  paymentEvidence: PublicPaymentEvidence[];
  isManager: boolean;
  onChanged: () => Promise<void>;
  onChange: (next: FileRef) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const doc = detail.kind === 'document' ? documents.find((item) => item.id === detail.id) : undefined;
  const evidence =
    detail.kind === 'evidence' ? paymentEvidence.find((item) => item.id === detail.id) : undefined;
  const active = doc ?? evidence;
  if (!active) return null;

  /*
   * Uploads that answer the same checklist entry are versions of one slot; a free-form upload
   * stands alone. Receipts all belong to the quotation, so they version together.
   */
  const history: (PublicCaseDocument | PublicPaymentEvidence)[] =
    detail.kind === 'document'
      ? doc!.requirementId
        ? documents.filter((item) => item.requirementId === doc!.requirementId)
        : [doc!]
      : paymentEvidence;

  return (
    <div
      className={styles.sheetOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={active.originalFilename}
    >
      <div className={styles.sheet}>
        <header className={styles.sheetHead}>
          <h3 className={styles.sheetTitle}>{active.originalFilename}</h3>
          <button type="button" className={styles.sheetClose} onClick={onClose}>
            {t('caseDetail.fileDetail.close')}
          </button>
        </header>

        <dl className={styles.fileMeta}>
          <div>
            <dt>{t('caseDetail.fileDetail.kind')}</dt>
            <dd>{doc ? t(`caseDetail.docKind.${doc.kind}`) : t('caseDetail.paymentEvidence')}</dd>
          </div>
          <div>
            <dt>{t('caseDetail.fileDetail.status')}</dt>
            <dd>
              {doc ? (
                <DocumentReviewBadge status={doc.reviewStatus} />
              ) : (
                <PaymentEvidenceBadge status={evidence!.status} />
              )}
            </dd>
          </div>
          <div>
            <dt>{t('caseDetail.fileDetail.uploadedAt')}</dt>
            <dd>{formatDateTime(active.createdAt)}</dd>
          </div>
          <div>
            <dt>{t('caseDetail.fileDetail.reviewer')}</dt>
            <dd>{active.reviewedByName ?? t('caseDetail.fileDetail.notReviewed')}</dd>
          </div>
          <div>
            <dt>{t('caseDetail.fileDetail.reviewedAt')}</dt>
            <dd>{active.reviewedAt ? formatDateTime(active.reviewedAt) : '—'}</dd>
          </div>
        </dl>

        {active.reviewNote && (
          <p className={styles.reviewNote}>
            {t('caseDetail.fileDetail.note', { note: active.reviewNote })}
          </p>
        )}

        <MediaPreview
          filename={active.originalFilename}
          mimeType={active.mimeType}
          fetchUrl={() =>
            doc
              ? getCaseDocumentSignedUrl(caseId, doc.id)
              : getPaymentEvidenceSignedUrl(evidence!.id)
          }
        />

        {isManager && (
          <ReviewControls
            approveDisabled={doc ? doc.reviewStatus === 'approved' : evidence!.status === 'approved'}
            onDecide={(decision, note) =>
              doc
                ? reviewCaseDocument(caseId, doc.id, decision, note)
                : reviewPaymentEvidence(evidence!.id, decision, note)
            }
            onDone={onChanged}
          />
        )}

        {history.length > 1 && (
          <section className={styles.sheetHistory}>
            <h4 className={styles.subTitle}>{t('caseDetail.fileDetail.history')}</h4>
            <p className={styles.cardSub}>{t('caseDetail.fileDetail.historyHint')}</p>
            <ul className={styles.historyList}>
              {history.map((entry) => {
                const isCurrent = entry.id === active.id;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={`${styles.historyItem} ${
                        isCurrent ? styles.historyItemActive : ''
                      }`}
                      aria-pressed={isCurrent}
                      disabled={isCurrent}
                      onClick={() =>
                        onChange({ kind: detail.kind, id: entry.id })
                      }
                    >
                      <span className={styles.historyName}>{entry.originalFilename}</span>
                      <span className={styles.historyTime}>{formatDateTime(entry.createdAt)}</span>
                      {isCurrent && (
                        <span className={styles.historyCurrent}>
                          {t('caseDetail.fileDetail.current')}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

type PreviewState =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'ready'; url: string }
  | { kind: 'error'; message: string };

/**
 * Opens a private file through a short-lived signed URL. Images render inline, PDFs in an
 * embedded viewer, and everything also gets a "open in new tab" link so an admin can inspect a
 * document before accepting or rejecting it.
 */
function MediaPreview({
  filename,
  mimeType,
  fetchUrl,
}: {
  filename: string;
  mimeType: string;
  fetchUrl: () => Promise<{ url: string; expiresAt: string }>;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<PreviewState>({ kind: 'closed' });

  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';

  async function toggle() {
    if (state.kind === 'ready') {
      setState({ kind: 'closed' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const { url } = await fetchUrl();
      setState({ kind: 'ready', url: resolveAssetUrl(url) });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : t('caseDetail.review.previewError'),
      });
    }
  }

  return (
    <div className={styles.previewBlock}>
      <button
        type="button"
        className={styles.previewToggle}
        aria-expanded={state.kind === 'ready'}
        onClick={() => void toggle()}
      >
        {state.kind === 'ready'
          ? t('caseDetail.review.hidePreview')
          : t('caseDetail.review.showPreview')}
      </button>
      {state.kind === 'loading' && (
        <p className={styles.muted}>{t('caseDetail.review.loadingPreview')}</p>
      )}
      {state.kind === 'error' && (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'ready' && (
        <div className={styles.previewBody}>
          {isImage && (
            <img src={state.url} alt={filename} className={styles.previewImage} />
          )}
          {isPdf && <iframe src={state.url} title={filename} className={styles.previewFrame} />}
          {!isImage && !isPdf && (
            <p className={styles.muted}>{t('caseDetail.review.noPreview')}</p>
          )}
          <a className={styles.previewLink} href={state.url} target="_blank" rel="noreferrer">
            {t('caseDetail.review.openNewTab')}
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * Approve / reject a single file. Rejecting always asks for a note, so the customer is told
 * exactly what to fix; approving is a single click.
 */
function ReviewControls({
  onDecide,
  approveDisabled = false,
  onDone,
}: {
  onDecide: (decision: ReviewDecision, note?: string) => Promise<unknown>;
  approveDisabled?: boolean;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: ReviewDecision, reviewNote?: string) {
    setBusy(true);
    setError(null);
    try {
      await onDecide(decision, reviewNote);
      setRejecting(false);
      setNote('');
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('caseDetail.review.actionError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.reviewControls}>
      {rejecting ? (
        <>
          <textarea
            className={styles.messageInput}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('caseDetail.review.rejectPlaceholder')}
            maxLength={500}
            rows={2}
          />
          <div className={styles.reviewActions}>
            <button
              type="button"
              className={styles.rejectButton}
              disabled={busy || note.trim().length < 3}
              onClick={() => void decide('rejected', note.trim())}
            >
              {busy ? t('caseDetail.review.saving') : t('caseDetail.review.confirmReject')}
            </button>
            <button
              type="button"
              className={styles.cancelButton}
              disabled={busy}
              onClick={() => {
                setRejecting(false);
                setNote('');
              }}
            >
              {t('caseDetail.review.cancel')}
            </button>
          </div>
        </>
      ) : (
        <div className={styles.reviewActions}>
          <button
            type="button"
            className={styles.approveButton}
            disabled={busy || approveDisabled}
            onClick={() => void decide('approved')}
          >
            {t('caseDetail.review.approve')}
          </button>
          <button
            type="button"
            className={styles.rejectButton}
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            {t('caseDetail.review.reject')}
          </button>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The admin decision on the whole file. Accepting stays blocked until every required document
 * and the payment receipt are approved, mirroring the server-side gate in `PATCH /cases/:id/review`.
 */
function CaseReviewCard({
  caseId,
  item,
  requiredDocuments,
  latestByRequirement,
  paymentEvidence,
  onChanged,
}: {
  caseId: string;
  item: PublicCase;
  requiredDocuments: CaseRequiredDocument[];
  latestByRequirement: Map<string, PublicCaseDocument>;
  paymentEvidence: PublicPaymentEvidence[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docsApproved = requiredDocuments.every(
    (req) => latestByRequirement.get(req.requirementId)?.reviewStatus === 'approved',
  );
  const paymentApproved = paymentEvidence.some((ev) => ev.status === 'approved');
  const canAccept = docsApproved && paymentApproved;
  const alreadyAccepted = item.reviewStatus === 'accepted';

  async function decide(decision: 'accepted' | 'rejected', reviewNote?: string) {
    setBusy(true);
    setError(null);
    try {
      await reviewCase(caseId, decision, reviewNote);
      setRejecting(false);
      setNote('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('caseDetail.review.actionError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>{t('caseDetail.review.title')}</h3>
      <div className={styles.reviewHead}>
        <span className={styles.payLabel}>{t('caseDetail.review.current')}</span>
        <CaseReviewBadge status={item.reviewStatus} />
      </div>
      {item.reviewNote && <p className={styles.reviewNote}>{item.reviewNote}</p>}

      <ul className={styles.progressList}>
        <li className={styles.progressItem} data-done={docsApproved ? 'true' : 'false'}>
          <span className={styles.progressCheck} aria-hidden="true">
            {docsApproved ? '✓' : '•'}
          </span>
          {docsApproved ? t('caseDetail.review.docsApproved') : t('caseDetail.review.docsPending')}
        </li>
        <li className={styles.progressItem} data-done={paymentApproved ? 'true' : 'false'}>
          <span className={styles.progressCheck} aria-hidden="true">
            {paymentApproved ? '✓' : '•'}
          </span>
          {paymentApproved
            ? t('caseDetail.review.paymentApproved')
            : t('caseDetail.review.paymentPending')}
        </li>
      </ul>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {rejecting && (
        <textarea
          className={styles.messageInput}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('caseDetail.review.rejectCasePlaceholder')}
          maxLength={800}
          rows={3}
        />
      )}

      <div className={styles.reviewActions}>
        <button
          type="button"
          className={styles.approveButton}
          disabled={busy || !canAccept || alreadyAccepted}
          onClick={() => void decide('accepted')}
        >
          {alreadyAccepted ? t('caseDetail.review.accepted') : t('caseDetail.review.accept')}
        </button>
        {rejecting ? (
          <>
            <button
              type="button"
              className={styles.rejectButton}
              disabled={busy || note.trim().length < 3}
              onClick={() => void decide('rejected', note.trim())}
            >
              {busy ? t('caseDetail.review.saving') : t('caseDetail.review.confirmReject')}
            </button>
            <button
              type="button"
              className={styles.cancelButton}
              disabled={busy}
              onClick={() => {
                setRejecting(false);
                setNote('');
              }}
            >
              {t('caseDetail.review.cancel')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.rejectButton}
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            {t('caseDetail.review.rejectCase')}
          </button>
        )}
      </div>

      {!canAccept && !alreadyAccepted && (
        <p className={styles.noteWarning}>{t('caseDetail.review.blocked')}</p>
      )}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
