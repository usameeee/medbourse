import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_LOCALES, PAGE_CONTENT_KEYS, SOCIAL_NETWORKS, SOCIAL_NETWORK_LABELS, emptyLocalizedText } from '@medbourse/shared';
import type {
  AppLocale,
  LocalizedText,
  PageContentKey,
  PublicPageContent,
  PublicSiteContent,
  PublicSocialAccount,
} from '@medbourse/shared';
import { getSiteContentAll, updateSiteContent, type SiteContentInput } from '../api';
import styles from './SiteContentView.module.css';

type LoadState = 'loading' | 'ready' | 'error';
type Tab = 'social' | 'pages';

/** New rows get a client id so they keep their identity across saves. */
function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 12);
}

function cloneContent(content: PublicSiteContent): PublicSiteContent {
  return {
    social: content.social.map((account) => ({ ...account })),
    pages: content.pages.map((page) => ({
      ...page,
      eyebrow: { ...page.eyebrow },
      title: { ...page.title },
      lead: { ...page.lead },
      sections: page.sections.map((section) => ({
        ...section,
        title: { ...section.title },
        body: { ...section.body },
      })),
    })),
  };
}

function emptyPage(key: PageContentKey): PublicPageContent {
  return {
    key,
    isActive: true,
    eyebrow: emptyLocalizedText(),
    title: emptyLocalizedText(),
    lead: emptyLocalizedText(),
    updated: '',
    sections: [],
  };
}

/** Guarantees every editable page has a working record, so a fresh install is still editable. */
function withAllPages(content: PublicSiteContent): PublicSiteContent {
  const filled = cloneContent(content);
  for (const key of PAGE_CONTENT_KEYS) {
    if (!filled.pages.some((page) => page.key === key)) {
      filled.pages.push(emptyPage(key));
    }
  }
  return filled;
}

/** Super Admin editor for the public social accounts and page copy. */
export default function SiteContentView() {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>('loading');
  const [tab, setTab] = useState<Tab>('social');
  const [locale, setLocale] = useState<AppLocale>('en');
  const [activePage, setActivePage] = useState<PageContentKey>('faq');
  const [draft, setDraft] = useState<PublicSiteContent>({ social: [], pages: [] });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const res = await getSiteContentAll();
      setDraft(withAllPages(res));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function persist(input: SiteContentInput) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await updateSiteContent(input);
      setDraft(withAllPages(res));
      setNotice(t('site.saved'));
    } catch {
      setError(t('site.saveError'));
    } finally {
      setSaving(false);
    }
  }

  /* ── Social ── */
  function addSocial() {
    setDraft((current) => ({
      ...current,
      social: [
        ...current.social,
        {
          id: uid(),
          network: 'instagram',
          url: '',
          order: current.social.length,
          isActive: true,
        },
      ],
    }));
  }

  function updateSocial(id: string, patch: Partial<PublicSocialAccount>) {
    setDraft((current) => ({
      ...current,
      social: current.social.map((account) =>
        account.id === id ? { ...account, ...patch } : account,
      ),
    }));
  }

  /* ── Pages ── */
  const page = draft.pages.find((candidate) => candidate.key === activePage);

  function updatePage(patch: Partial<PublicPageContent>) {
    setDraft((current) => ({
      ...current,
      pages: current.pages.map((candidate) =>
        candidate.key === activePage ? { ...candidate, ...patch } : candidate,
      ),
    }));
  }

  function updatePageLocalized(field: 'eyebrow' | 'title' | 'lead', value: string) {
    setDraft((current) => ({
      ...current,
      pages: current.pages.map((candidate) =>
        candidate.key === activePage
          ? { ...candidate, [field]: { ...candidate[field], [locale]: value } }
          : candidate,
      ),
    }));
  }

  function addSection() {
    setDraft((current) => ({
      ...current,
      pages: current.pages.map((candidate) =>
        candidate.key === activePage
          ? {
              ...candidate,
              sections: [
                ...candidate.sections,
                { id: uid(), title: emptyLocalizedText(), body: emptyLocalizedText() },
              ],
            }
          : candidate,
      ),
    }));
  }

  function updateSectionLocalized(
    sectionId: string,
    field: 'title' | 'body',
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      pages: current.pages.map((candidate) =>
        candidate.key === activePage
          ? {
              ...candidate,
              sections: candidate.sections.map((section) =>
                section.id === sectionId
                  ? { ...section, [field]: { ...section[field], [locale]: value } }
                  : section,
              ),
            }
          : candidate,
      ),
    }));
  }

  function removeSection(sectionId: string) {
    setDraft((current) => ({
      ...current,
      pages: current.pages.map((candidate) =>
        candidate.key === activePage
          ? {
              ...candidate,
              sections: candidate.sections.filter((section) => section.id !== sectionId),
            }
          : candidate,
      ),
    }));
  }

  /** A localized text field, bound to the language the editor is currently showing. */
  function localizedField(
    label: string,
    value: LocalizedText,
    onChange: (next: string) => void,
    multiline = false,
  ) {
    return (
      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {label} · {t(`language.${locale}`)}
        </span>
        {multiline ? (
          <textarea
            className={styles.textarea}
            rows={3}
            value={value[locale]}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <input
            className={styles.input}
            value={value[locale]}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </label>
    );
  }

  const saveButton = (
    key: string,
    onSave: () => void,
  ) => (
    <button
      key={key}
      type="button"
      className={styles.primary}
      onClick={onSave}
      disabled={saving}
    >
      {saving ? t('site.saving') : t('site.save')}
    </button>
  );

  return (
    <section className={styles.wrap} aria-labelledby="site-content-title">
      <div className={styles.header}>
        <div>
          <h1 className={styles.title} id="site-content-title">
            {t('site.title')}
          </h1>
          <p className={styles.lead}>{t('site.lead')}</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.ghost} onClick={() => void reload()}>
            {t('site.refresh')}
          </button>
        </div>
      </div>

      <div className={styles.localeTabs} role="tablist" aria-label={t('language.label')}>
        {APP_LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            role="tab"
            aria-selected={locale === code}
            className={`${styles.localeTab} ${locale === code ? styles.localeTabActive : ''}`}
            onClick={() => setLocale(code)}
          >
            {t(`language.${code}`)}
          </button>
        ))}
      </div>

      <div className={styles.tabs} role="tablist">
        {(['social', 'pages'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
            onClick={() => {
              setTab(id);
              setNotice(null);
              setError(null);
            }}
          >
            {t(`site.tabs.${id}`)}
          </button>
        ))}
      </div>

      {notice && <p className={styles.notice}>{notice}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {state === 'loading' && <p className={styles.muted}>{t('site.loading')}</p>}
      {state === 'error' && (
        <p className={styles.error} role="alert">
          {t('site.loadError')}
        </p>
      )}

      {state === 'ready' && tab === 'social' && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>{t('site.social.heading')}</h2>
              <p className={styles.panelHint}>{t('site.social.hint')}</p>
            </div>
            <div className={styles.panelActions}>
              <button type="button" className={styles.ghost} onClick={addSocial}>
                {t('site.social.add')}
              </button>
              {saveButton('social', () => void persist({ social: draft.social }))}
            </div>
          </div>

          {draft.social.length === 0 && <p className={styles.muted}>{t('site.social.empty')}</p>}

          <ul className={styles.rows}>
            {draft.social.map((account) => (
              <li key={account.id} className={styles.row}>
                <div className={styles.rowGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{t('site.social.network')}</span>
                    <select
                      className={styles.select}
                      value={account.network}
                      onChange={(event) =>
                        updateSocial(account.id, {
                          network: event.target.value as (typeof SOCIAL_NETWORKS)[number],
                        })
                      }
                    >
                      {SOCIAL_NETWORKS.map((network) => (
                        <option key={network} value={network}>
                          {SOCIAL_NETWORK_LABELS[network]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{t('site.social.url')}</span>
                    <input
                      className={styles.input}
                      value={account.url}
                      onChange={(event) => updateSocial(account.id, { url: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{t('site.order')}</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      max={999}
                      value={account.order}
                      onChange={(event) =>
                        updateSocial(account.id, { order: Number(event.target.value) || 0 })
                      }
                    />
                  </label>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={account.isActive}
                      onChange={(event) =>
                        updateSocial(account.id, { isActive: event.target.checked })
                      }
                    />
                    {t('site.active')}
                  </label>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        social: current.social.filter((item) => item.id !== account.id),
                      }))
                    }
                  >
                    {t('site.social.remove')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {state === 'ready' && tab === 'pages' && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>{t('site.pages.heading')}</h2>
              <p className={styles.panelHint}>{t('site.pages.hint')}</p>
            </div>
            <div className={styles.panelActions}>
              {saveButton('pages', () => {
                if (page) void persist({ pages: [page] });
              })}
            </div>
          </div>

          <div className={styles.pageTabs} role="tablist">
            {PAGE_CONTENT_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activePage === key}
                className={`${styles.pageTab} ${activePage === key ? styles.pageTabActive : ''}`}
                onClick={() => setActivePage(key)}
              >
                {t(`site.pageNames.${key}`)}
              </button>
            ))}
          </div>

          {page && (
            <div className={styles.pageBody}>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={page.isActive}
                  onChange={(event) => updatePage({ isActive: event.target.checked })}
                />
                {t('site.pages.active')}
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('site.pages.updated')}</span>
                <input
                  className={styles.input}
                  value={page.updated}
                  placeholder={t('site.pages.updatedHint')}
                  onChange={(event) => updatePage({ updated: event.target.value })}
                />
              </label>

              <div className={styles.localePanel}>
                {localizedField(t('site.pages.eyebrow'), page.eyebrow, (value) =>
                  updatePageLocalized('eyebrow', value),
                )}
                {localizedField(t('site.pages.title'), page.title, (value) =>
                  updatePageLocalized('title', value),
                )}
                {localizedField(
                  t('site.pages.lead'),
                  page.lead,
                  (value) => updatePageLocalized('lead', value),
                  true,
                )}
              </div>

              <div className={styles.sections}>
                <div className={styles.sectionsHead}>
                  <h3 className={styles.subTitle}>{t('site.pages.sections')}</h3>
                  <button type="button" className={styles.ghost} onClick={addSection}>
                    {t('site.pages.addSection')}
                  </button>
                </div>
                {page.sections.length === 0 && (
                  <p className={styles.muted}>{t('site.pages.emptySections')}</p>
                )}
                {page.sections.map((section, index) => (
                  <div key={section.id} className={styles.sectionBlock}>
                    <div className={styles.sectionHead}>
                      <span className={styles.sectionIndex}>{index + 1}</span>
                      <button
                        type="button"
                        className={styles.danger}
                        onClick={() => removeSection(section.id)}
                      >
                        {t('site.pages.removeSection')}
                      </button>
                    </div>
                    {localizedField(t('site.pages.sectionTitle'), section.title, (value) =>
                      updateSectionLocalized(section.id, 'title', value),
                    )}
                    {localizedField(
                      t('site.pages.sectionBody'),
                      section.body,
                      (value) => updateSectionLocalized(section.id, 'body', value),
                      true,
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
