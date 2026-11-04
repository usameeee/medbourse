import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_LOCALES, DOCUMENT_KINDS, emptyLocalizedText } from '@medbourse/shared';
import type { AppLocale, DocumentKind, LocalizedText, PublicDocumentRequirement } from '@medbourse/shared';
import {
  createDocumentRequirement,
  listDocumentRequirements,
  updateDocumentRequirement,
} from '../api';
import styles from './DocumentLibraryView.module.css';

interface RequirementForm {
  key: string;
  kind: DocumentKind;
  order: number;
  isActive: boolean;
  title: LocalizedText;
  description: LocalizedText;
}

const emptyForm = (): RequirementForm => ({
  key: '',
  kind: 'identity',
  order: 0,
  isActive: true,
  title: emptyLocalizedText(),
  description: emptyLocalizedText(),
});

/** Reads one locale from a localized value, falling back to English. */
function pickLocalized(value: LocalizedText, locale: AppLocale): string {
  return (value[locale] || value.en || '').trim();
}

/** True when every locale of a localized value is blank. */
function localizedIsEmpty(value: LocalizedText): boolean {
  return APP_LOCALES.every((code) => !value[code].trim());
}

/**
 * Super Admin surface for the reusable document library. A document is defined once
 * here and then picked by any number of services, so it is never retyped per package.
 * Cases freeze a copy of the checklist when they open, so edits here never rewrite
 * documents a customer was already asked for.
 */
export default function DocumentLibraryView() {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language.split('-')[0] || 'en') as AppLocale;
  const [items, setItems] = useState<PublicDocumentRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<RequirementForm>(emptyForm);
  const [formLocale, setFormLocale] = useState<AppLocale>('en');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listDocumentRequirements();
      setItems(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('documentLibrary.loadError'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function setLocalized(field: 'title' | 'description', value: string) {
    setForm((current) => ({ ...current, [field]: { ...current[field], [formLocale]: value } }));
  }

  function startEdit(item: PublicDocumentRequirement) {
    setEditingId(item.id);
    setFormError(null);
    setSavedNote(null);
    setFormLocale('en');
    setForm({
      key: item.key,
      kind: item.kind,
      order: item.order,
      isActive: item.isActive,
      title: item.title,
      description: item.description ?? emptyLocalizedText(),
    });
  }

  function resetForm() {
    setEditingId(null);
    setFormError(null);
    setFormLocale('en');
    setForm(emptyForm());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSavedNote(null);
    setSaving(true);
    try {
      const payload = {
        key: form.key.trim().toLowerCase(),
        kind: form.kind,
        order: form.order,
        isActive: form.isActive,
        title: form.title,
        description: localizedIsEmpty(form.description) ? null : form.description,
      };
      if (editingId) {
        await updateDocumentRequirement(editingId, payload);
      } else {
        await createDocumentRequirement(payload);
      }
      setSavedNote(t('documentLibrary.saved'));
      resetForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('documentLibrary.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('documentLibrary.title')}</h2>
          <p className={styles.subtitle}>{t('documentLibrary.subtitle')}</p>
        </div>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={() => void load()}
          disabled={loading}
        >
          {t('documentLibrary.refresh')}
        </button>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className={styles.muted}>{t('documentLibrary.loading')}</p>
      ) : items.length === 0 ? (
        <p className={styles.muted}>{t('documentLibrary.empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('documentLibrary.columns.title')}</th>
                <th scope="col">{t('documentLibrary.columns.key')}</th>
                <th scope="col">{t('documentLibrary.columns.kind')}</th>
                <th scope="col">{t('documentLibrary.columns.order')}</th>
                <th scope="col">{t('documentLibrary.columns.active')}</th>
                <th scope="col">{t('documentLibrary.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className={styles.titleCell}>
                    {pickLocalized(item.title, locale) || item.key}
                  </td>
                  <td className={styles.monoCell}>{item.key}</td>
                  <td>{t(`documentLibrary.kind.${item.kind}`)}</td>
                  <td>{item.order}</td>
                  <td>
                    <span className={item.isActive ? styles.pillActive : styles.pillInactive}>
                      {item.isActive ? t('documentLibrary.active') : t('documentLibrary.inactive')}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => startEdit(item)}
                    >
                      {t('documentLibrary.edit')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          {editingId ? t('documentLibrary.editTitle') : t('documentLibrary.createTitle')}
        </h3>
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>{t('documentLibrary.key')}</span>
              <input
                type="text"
                required
                maxLength={60}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="passport-copy"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>{t('documentLibrary.kindLabel')}</span>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as DocumentKind })}
              >
                {DOCUMENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`documentLibrary.kind.${kind}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>{t('documentLibrary.order')}</span>
              <input
                type="number"
                min={0}
                step={1}
                value={form.order}
                onChange={(e) => setForm({ ...form, order: Number(e.target.value) || 0 })}
              />
            </label>
            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span>{t('documentLibrary.active')}</span>
            </label>
          </div>

          <div className={styles.localeBlock}>
            <div className={styles.localeTabs} role="tablist" aria-label={t('language.label')}>
              {APP_LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  role="tab"
                  aria-selected={formLocale === code}
                  className={`${styles.localeTab} ${
                    formLocale === code ? styles.localeTabActive : ''
                  }`}
                  onClick={() => setFormLocale(code)}
                >
                  {t(`language.${code}`)}
                </button>
              ))}
            </div>
            <div className={styles.localePanel}>
              <label className={styles.field}>
                <span>
                  {t('documentLibrary.documentTitle')}
                  {formLocale === 'en' && <span className={styles.required}> *</span>}
                </span>
                <input
                  type="text"
                  maxLength={160}
                  value={form.title[formLocale]}
                  onChange={(e) => setLocalized('title', e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>{t('documentLibrary.description')}</span>
                <textarea
                  rows={3}
                  maxLength={800}
                  value={form.description[formLocale]}
                  onChange={(e) => setLocalized('description', e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={saving || !form.title.en.trim()}
            >
              {editingId ? t('documentLibrary.save') : t('documentLibrary.create')}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={resetForm}
              disabled={saving}
            >
              {t('documentLibrary.cancel')}
            </button>
          </div>
        </form>
        {formError && (
          <p className={styles.error} role="alert">
            {formError}
          </p>
        )}
        {savedNote && !formError && <p className={styles.note}>{savedNote}</p>}
      </div>
    </section>
  );
}
