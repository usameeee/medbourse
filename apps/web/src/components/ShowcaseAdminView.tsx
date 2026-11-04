import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_LOCALES, SERVICE_CATEGORIES, emptyLocalizedText } from '@medbourse/shared';
import type { AppLocale, LocalizedText, PublicShowcaseSlide, ServiceCategory } from '@medbourse/shared';
import {
  apiUrl,
  createShowcaseSlide,
  deleteShowcaseSlide,
  listAllShowcase,
  updateShowcaseSlide,
  uploadMedia,
  type ApiError,
} from '../api';
import styles from './ShowcaseAdminView.module.css';

type LoadState = 'loading' | 'ready' | 'error';
type LocalizedField = 'name' | 'eyebrow' | 'headline' | 'narrative' | 'altText';

interface SlideFormFrame {
  mediaId: string;
  imageUrl: string;
  focalX: number;
  focalY: number;
}

interface SlideForm {
  frames: SlideFormFrame[];
  category: ServiceCategory | '';
  order: number;
  isActive: boolean;
  name: LocalizedText;
  eyebrow: LocalizedText;
  headline: LocalizedText;
  narrative: LocalizedText;
  altText: LocalizedText;
}

const emptyForm = (): SlideForm => ({
  frames: [],
  category: '',
  order: 0,
  isActive: true,
  name: emptyLocalizedText(),
  eyebrow: emptyLocalizedText(),
  headline: emptyLocalizedText(),
  narrative: emptyLocalizedText(),
  altText: emptyLocalizedText(),
});

function formFromSlide(slide: PublicShowcaseSlide): SlideForm {
  return {
    frames: slide.frames
      .filter((frame): frame is SlideFormFrame => Boolean(frame.mediaId) && Boolean(frame.imageUrl))
      .map((frame) => ({
        mediaId: frame.mediaId,
        imageUrl: frame.imageUrl,
        focalX: frame.focalX,
        focalY: frame.focalY,
      })),
    category: slide.category ?? '',
    order: slide.order,
    isActive: slide.isActive,
    name: slide.name,
    eyebrow: slide.eyebrow,
    headline: slide.headline,
    narrative: slide.narrative,
    altText: slide.altText,
  };
}

/** Slides store relative media paths; the browser needs an absolute URL to render them. */
function resolveImage(url: string | null): string | null {
  if (!url) {
    return null;
  }
  return url.startsWith('http') ? url : apiUrl(url);
}

export default function ShowcaseAdminView() {
  const { t } = useTranslation();
  const [slides, setSlides] = useState<PublicShowcaseSlide[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SlideForm>(emptyForm);
  const [locale, setLocale] = useState<AppLocale>('en');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setState('loading');
    try {
      const res = await listAllShowcase();
      setSlides(res.data);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setLocale('en');
    setError(null);
    setEditorOpen(true);
  }

  function openEdit(slide: PublicShowcaseSlide) {
    setEditingId(slide.id);
    setForm(formFromSlide(slide));
    setLocale('en');
    setError(null);
    setEditorOpen(true);
  }

  function setLocalized(field: LocalizedField, value: string) {
    setForm((current) => ({ ...current, [field]: { ...current[field], [locale]: value } }));
  }

  /** The API rejects a duplicate position inside one category; explain it in the active language. */
  function saveErrorMessage(err: unknown): string {
    if ((err as Partial<ApiError>)?.code === 'ORDER_TAKEN') {
      return t('showcase.orderTaken');
    }
    return (err as Error).message || t('showcase.saveError');
  }

  async function handleAddFrame(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const { media } = await uploadMedia(file);
      setForm((current) => ({
        ...current,
        frames: [
          ...current.frames,
          { mediaId: media.id, imageUrl: media.url, focalX: 50, focalY: 50 },
        ],
      }));
    } catch (err) {
      setError((err as Error).message || t('showcase.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  function updateFrame(index: number, patch: Partial<SlideFormFrame>) {
    setForm((current) => ({
      ...current,
      frames: current.frames.map((frame, i) => (i === index ? { ...frame, ...patch } : frame)),
    }));
  }

  function removeFrame(index: number) {
    setForm((current) => ({
      ...current,
      frames: current.frames.filter((_, i) => i !== index),
    }));
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const frames = form.frames.map((f) => ({
        mediaId: f.mediaId,
        focalX: f.focalX,
        focalY: f.focalY,
      }));
      const input = {
        mediaId: frames[0]?.mediaId ?? null,
        frames,
        category: form.category === '' ? null : form.category,
        order: form.order,
        isActive: form.isActive,
        name: form.name,
        eyebrow: form.eyebrow,
        headline: form.headline,
        narrative: form.narrative,
        altText: form.altText,
      };
      if (editingId) {
        await updateShowcaseSlide(editingId, input);
      } else {
        await createShowcaseSlide(input);
      }
      setEditorOpen(false);
      await reload();
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(slide: PublicShowcaseSlide) {
    if (!window.confirm(t('showcase.deleteConfirm'))) {
      return;
    }
    try {
      await deleteShowcaseSlide(slide.id);
      await reload();
    } catch (err) {
      setError((err as Error).message || t('showcase.deleteError'));
    }
  }

  return (
    <section className={styles.wrap} aria-labelledby="showcase-admin-title">
      <div className={styles.header}>
        <div>
          <h1 className={styles.title} id="showcase-admin-title">
            {t('showcase.title')}
          </h1>
          <p className={styles.lead}>{t('showcase.lead')}</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.ghost} onClick={() => void reload()}>
            {t('showcase.refresh')}
          </button>
          <button type="button" className={styles.primary} onClick={openCreate}>
            {t('showcase.create')}
          </button>
        </div>
      </div>

      {state === 'loading' && <p className={styles.muted}>{t('showcase.loading')}</p>}
      {state === 'error' && (
        <p className={styles.error} role="alert">
          {t('showcase.loadError')}
        </p>
      )}
      {state === 'ready' && slides.length === 0 && (
        <p className={styles.muted}>{t('showcase.empty')}</p>
      )}

      {state === 'ready' && slides.length > 0 && (
        <ul className={styles.grid}>
          {slides.map((slide) => {
            const image = resolveImage(slide.imageUrl);
            return (
              <li key={slide.id} className={styles.card}>
                <div className={styles.thumb}>
                  {image ? (
                    <img className={styles.thumbImage} src={image} alt={slide.altText.en} />
                  ) : (
                    <span className={styles.thumbEmpty}>{t('showcase.noPhoto')}</span>
                  )}
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardMeta}>
                    <div className={styles.metaGroup}>
                      <span className={styles.orderBadge}>
                        {t('showcase.order')} {slide.order}
                      </span>
                      <span className={styles.frameCount}>
                        {t('showcase.frameCount', { count: slide.frames.length })}
                      </span>
                    </div>
                    <span className={slide.isActive ? styles.pillActive : styles.pillInactive}>
                      {slide.isActive ? t('showcase.state.active') : t('showcase.state.inactive')}
                    </span>
                  </div>
                  <p className={styles.cardHeadline}>{slide.headline.en || '—'}</p>
                  {slide.category && (
                    <p className={styles.cardCategory}>{t(`categories.${slide.category}`)}</p>
                  )}
                  <div className={styles.cardActions}>
                    <button type="button" className={styles.ghost} onClick={() => openEdit(slide)}>
                      {t('showcase.edit')}
                    </button>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() => void handleDelete(slide)}
                    >
                      {t('showcase.delete')}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editorOpen && (
        <form className={styles.editor} onSubmit={handleSave}>
          <h2 className={styles.editorTitle}>
            {editingId ? t('showcase.edit') : t('showcase.create')}
          </h2>
          <p className={styles.editorHint}>{t('showcase.hint')}</p>

          <div className={styles.framesSection}>
            <div className={styles.framesHeader}>
              <span className={styles.fieldLabel}>{t('showcase.framesTitle')}</span>
              <span className={styles.fieldHint}>{t('showcase.framesHint')}</span>
            </div>

            {form.frames.length === 0 && <p className={styles.muted}>{t('showcase.noFrames')}</p>}

            {form.frames.map((frame, index) => (
              <div key={`${frame.mediaId}-${index}`} className={styles.frameRow}>
                <div className={styles.frameThumb}>
                  {resolveImage(frame.imageUrl) ? (
                    <img
                      className={styles.frameThumbImage}
                      src={resolveImage(frame.imageUrl) ?? ''}
                      alt=""
                    />
                  ) : (
                    <span className={styles.thumbEmpty}>{t('showcase.noPhoto')}</span>
                  )}
                </div>
                <div className={styles.frameControls}>
                  <label className={styles.frameNumber}>
                    <span className={styles.fieldHint}>{`${t('showcase.focalPoint')} X`}</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={frame.focalX}
                      onChange={(event) =>
                        updateFrame(index, { focalX: Number(event.target.value) || 0 })
                      }
                    />
                  </label>
                  <label className={styles.frameNumber}>
                    <span className={styles.fieldHint}>{`${t('showcase.focalPoint')} Y`}</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={frame.focalY}
                      onChange={(event) =>
                        updateFrame(index, { focalY: Number(event.target.value) || 0 })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() => removeFrame(index)}
                  >
                    {t('showcase.removeFrame')}
                  </button>
                </div>
              </div>
            ))}

            <div className={styles.addFrameRow}>
              <label className={styles.uploadButton}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  className={styles.fileInput}
                  onChange={(event) => void handleAddFrame(event)}
                  disabled={uploading}
                />
                {uploading ? t('showcase.uploading') : t('showcase.addFrame')}
              </label>
            </div>
          </div>

          <div className={styles.metaRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('showcase.order')}</span>
              <input
                className={styles.input}
                type="number"
                min={0}
                max={999}
                value={form.order}
                onChange={(event) =>
                  setForm((current) => ({ ...current, order: Number(event.target.value) || 0 }))
                }
              />
              <span className={styles.fieldHint}>{t('showcase.orderHint')}</span>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('showcase.category')}</span>
              <select
                className={styles.input}
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value as ServiceCategory | '',
                  }))
                }
              >
                <option value="">{t('showcase.categoryNone')}</option>
                {SERVICE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`categories.${category}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              {t('showcase.state.active')}
            </label>
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

          <div className={styles.localePanel}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('showcase.fields.name')}</span>
              <input
                className={styles.input}
                value={form.name[locale]}
                onChange={(event) => setLocalized('name', event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('showcase.fields.eyebrow')}</span>
              <input
                className={styles.input}
                value={form.eyebrow[locale]}
                onChange={(event) => setLocalized('eyebrow', event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('showcase.fields.headline')}</span>
              <input
                className={styles.input}
                value={form.headline[locale]}
                onChange={(event) => setLocalized('headline', event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('showcase.fields.narrative')}</span>
              <textarea
                className={styles.textarea}
                rows={3}
                value={form.narrative[locale]}
                onChange={(event) => setLocalized('narrative', event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('showcase.fields.altText')}</span>
              <input
                className={styles.input}
                value={form.altText[locale]}
                onChange={(event) => setLocalized('altText', event.target.value)}
              />
            </label>
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.editorActions}>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setEditorOpen(false)}
              disabled={saving}
            >
              {t('showcase.cancel')}
            </button>
            <button type="submit" className={styles.primary} disabled={saving || uploading}>
              {saving ? t('showcase.saving') : t('showcase.save')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
