import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicCountryAssignment, PublicUser } from '@medbourse/shared';
import { listCountryAssignments, listManagers, upsertCountryAssignment } from '../api';
import { countryFlag, countryName, listCountries } from '../lib/countries';
import styles from './CountryAssignmentsView.module.css';

interface Draft {
  countryCode: string;
  managerUserIds: string[];
  isActive: boolean;
}

const EMPTY_DRAFT: Draft = { countryCode: '', managerUserIds: [], isActive: true };

/** Human-readable label for a manager row, falling back through the optional fields. */
function displayName(user: PublicUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.displayName || user.email;
}

/**
 * Super Admin surface (`assignment:manage:super_admin`): binds a country to the admins who serve it.
 * This binding is what scopes admins to a country, so editing it stays with the Super Admin.
 */
export default function CountryAssignmentsView() {
  const { t, i18n } = useTranslation();
  const [assignments, setAssignments] = useState<PublicCountryAssignment[]>([]);
  const [managers, setManagers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [countryFilter, setCountryFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const countries = useMemo(() => listCountries(i18n.language), [i18n.language]);
  const visibleCountries = useMemo(() => {
    const query = countryFilter.trim().toLowerCase();
    if (!query) {
      return countries;
    }
    return countries.filter(
      (country) =>
        country.name.toLowerCase().includes(query) || country.code.toLowerCase().includes(query),
    );
  }, [countries, countryFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assignmentRes, managerRes] = await Promise.all([
        listCountryAssignments(),
        listManagers(),
      ]);
      setAssignments(assignmentRes.data);
      setManagers(managerRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('countryAssignments.loadError'));
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const managerNames = useMemo(
    () => new Map(managers.map((manager) => [manager.id, displayName(manager)])),
    [managers],
  );

  const assignedCodes = useMemo(
    () => new Set(assignments.map((assignment) => assignment.countryCode)),
    [assignments],
  );

  const knownManagerIds = useMemo(() => new Set(managers.map((manager) => manager.id)), [managers]);
  /** Selected ids that are no longer active managers (e.g. deactivated) — shown so they can be dropped. */
  const staleIds = draft.managerUserIds.filter((id) => !knownManagerIds.has(id));

  const editingExisting = assignedCodes.has(draft.countryCode);

  function toggleManager(id: string) {
    setDraft((value) => ({
      ...value,
      managerUserIds: value.managerUserIds.includes(id)
        ? value.managerUserIds.filter((item) => item !== id)
        : [...value.managerUserIds, id],
    }));
  }

  function editAssignment(assignment: PublicCountryAssignment) {
    setSaveError(null);
    setSavedNote(null);
    setCountryFilter('');
    setDraft({
      countryCode: assignment.countryCode,
      managerUserIds: [...assignment.managerUserIds],
      isActive: assignment.isActive,
    });
  }

  function clearDraft() {
    setDraft(EMPTY_DRAFT);
    setCountryFilter('');
    setSaveError(null);
    setSavedNote(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaveError(null);
    setSavedNote(null);
    const countryCode = draft.countryCode.trim().toUpperCase();
    if (countryCode.length !== 2) {
      setSaveError(t('countryAssignments.selectCountry'));
      return;
    }
    if (draft.managerUserIds.length === 0) {
      setSaveError(t('countryAssignments.noManager'));
      return;
    }
    setSaving(true);
    try {
      await upsertCountryAssignment({
        countryCode,
        managerUserIds: draft.managerUserIds,
        isActive: draft.isActive,
      });
      setSavedNote(t('countryAssignments.saved'));
      setDraft(EMPTY_DRAFT);
      setCountryFilter('');
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('countryAssignments.loadError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('countryAssignments.title')}</h2>
          <p className={styles.subtitle}>{t('countryAssignments.subtitle')}</p>
        </div>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={() => void load()}
          disabled={loading}
        >
          {t('countryAssignments.refresh')}
        </button>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {loading && <p className={styles.muted}>{t('countryAssignments.loading')}</p>}

      {!loading && assignments.length === 0 && (
        <p className={styles.muted}>{t('countryAssignments.empty')}</p>
      )}

      {!loading && assignments.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('countryAssignments.columns.country')}</th>
                <th scope="col">{t('countryAssignments.columns.managers')}</th>
                <th scope="col">{t('countryAssignments.columns.status')}</th>
                <th scope="col">{t('countryAssignments.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td>
                    <span className={styles.countryCell}>
                      <span className={styles.countryFlag} aria-hidden="true">
                        {countryFlag(assignment.countryCode)}
                      </span>
                      <span className={styles.countryName}>
                        {countryName(assignment.countryCode, i18n.language)}
                      </span>
                      <span className={styles.countryCode}>{assignment.countryCode}</span>
                    </span>
                  </td>
                  <td>
                    <span className={styles.chips}>
                      {assignment.managerUserIds.map((id) => (
                        <span key={id} className={styles.chip}>
                          {managerNames.get(id) ?? id.slice(-6)}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${
                        assignment.isActive ? styles.statusActive : styles.statusInactive
                      }`}
                    >
                      {assignment.isActive
                        ? t('countryAssignments.active')
                        : t('countryAssignments.inactive')}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() => editAssignment(assignment)}
                    >
                      {t('countryAssignments.edit')}
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
          {editingExisting
            ? t('countryAssignments.editTitle')
            : t('countryAssignments.createTitle')}
        </h3>
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <div className={styles.row}>
            <div className={styles.field}>
              <span>{t('countryAssignments.country')}</span>
              <input
                type="search"
                className={styles.searchInput}
                placeholder={t('countryAssignments.searchCountries')}
                value={countryFilter}
                onChange={(event) => setCountryFilter(event.target.value)}
              />
              <div
                className={styles.countryList}
                role="radiogroup"
                aria-label={t('countryAssignments.country')}
              >
                {visibleCountries.length === 0 && (
                  <p className={styles.hint}>{t('countryAssignments.noCountry')}</p>
                )}
                {visibleCountries.map((country) => {
                  const selected = draft.countryCode === country.code;
                  return (
                    <button
                      key={country.code}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`${styles.countryOption} ${
                        selected ? styles.countryOptionSelected : ''
                      }`}
                      onClick={() =>
                        setDraft((value) => ({ ...value, countryCode: country.code }))
                      }
                    >
                      <span className={styles.countryFlag} aria-hidden="true">
                        {country.flag}
                      </span>
                      <span className={styles.countryOptionName}>{country.name}</span>
                      <span className={styles.countryOptionCode}>{country.code}</span>
                      {assignedCodes.has(country.code) && (
                        <span className={styles.assignedBadge}>
                          {t('countryAssignments.assignedBadge')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.field}>
              <span>{t('countryAssignments.managers')}</span>
              {managers.length === 0 ? (
                <p className={styles.hint}>{t('countryAssignments.noManagers')}</p>
              ) : (
                <div
                  className={styles.managerList}
                  role="group"
                  aria-label={t('countryAssignments.managers')}
                >
                  {managers.map((manager) => (
                    <label key={manager.id} className={styles.managerOption}>
                      <input
                        type="checkbox"
                        checked={draft.managerUserIds.includes(manager.id)}
                        onChange={() => toggleManager(manager.id)}
                      />
                      <span className={styles.managerOptionText}>
                        <span className={styles.managerOptionName}>{displayName(manager)}</span>
                        <span className={styles.managerOptionMeta}>
                          {t(`roles.${manager.role}`)} · {manager.email}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {staleIds.length > 0 && (
                <div className={styles.staleRow}>
                  <span className={styles.hint}>{t('countryAssignments.unavailable')}</span>
                  {staleIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={styles.staleChip}
                      onClick={() => toggleManager(id)}
                    >
                      {id.slice(-6)} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) =>
                setDraft((value) => ({ ...value, isActive: event.target.checked }))
              }
            />
            <span>{t('countryAssignments.active')}</span>
          </label>

          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryButton} disabled={saving}>
              {saving ? t('countryAssignments.saving') : t('countryAssignments.save')}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={clearDraft}
              disabled={saving}
            >
              {t('countryAssignments.clear')}
            </button>
          </div>
        </form>
        {saveError && (
          <p className={styles.error} role="alert">
            {saveError}
          </p>
        )}
        {savedNote && !saveError && <p className={styles.note}>{savedNote}</p>}
      </div>
    </section>
  );
}
