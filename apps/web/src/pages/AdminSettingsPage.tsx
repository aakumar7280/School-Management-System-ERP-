import { useEffect, useState } from 'react';

import { fetchAcademicStructure, GradeSetting, updateAcademicStructure } from '../lib/api';

type GradeRow = GradeSetting & { id: string };

const DEFAULT_SECTION_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F'];

function newRow(grade = '', sections: string[] = ['A']): GradeRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    grade,
    sections
  };
}

export function AdminSettingsPage() {
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [feeDueDayOfMonth, setFeeDueDayOfMonth] = useState(1);
  const [selectedGradeId, setSelectedGradeId] = useState<string>('');
  const [newGrade, setNewGrade] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAcademicStructure();
      const rows = data.grades.map((entry) => newRow(entry.grade, entry.sections));
      setGrades(rows);
      setFeeDueDayOfMonth(data.feeDueDayOfMonth);
      setSelectedGradeId(rows[0]?.id ?? '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  const selectedGrade = grades.find((entry) => entry.id === selectedGradeId) ?? null;

  function addGrade() {
    const grade = newGrade.trim();

    if (!grade) {
      setError('Enter a grade before adding.');
      return;
    }

    const exists = grades.some((entry) => entry.grade.toLowerCase() === grade.toLowerCase());
    if (exists) {
      setError(`Grade ${grade} already exists.`);
      return;
    }

    const row = newRow(grade, ['A']);
    setGrades((prev) => [...prev, row]);
    setSelectedGradeId(row.id);
    setNewGrade('');
    setError(null);
    setMessage(null);
  }

  function removeSelectedGrade() {
    if (!selectedGrade) return;

    setGrades((prev) => {
      const next = prev.filter((entry) => entry.id !== selectedGrade.id);
      setSelectedGradeId(next[0]?.id ?? '');
      return next;
    });
    setMessage(null);
  }

  function toggleSection(section: string) {
    if (!selectedGrade) return;

    setGrades((prev) =>
      prev.map((entry) => {
        if (entry.id !== selectedGrade.id) return entry;

        const hasSection = entry.sections.includes(section);
        if (hasSection) {
          if (entry.sections.length === 1) return entry;
          return { ...entry, sections: entry.sections.filter((value) => value !== section) };
        }

        return { ...entry, sections: [...entry.sections, section] };
      })
    );
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const sanitized = grades
        .map((entry) => ({
          grade: entry.grade.trim(),
          sections: entry.sections.map((section) => section.trim()).filter(Boolean)
        }))
        .filter((entry) => entry.grade.length > 0 && entry.sections.length > 0);

      if (sanitized.length === 0) {
        throw new Error('At least one grade with one section is required.');
      }

      await updateAcademicStructure({ grades: sanitized, feeDueDayOfMonth });
      setMessage('Settings saved successfully.');
      await loadSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-10 text-center text-sm text-slate-400">Loading settings...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Configure grades, sections, and fee due dates.</p>
      </div>

      {message ? (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <span className="font-medium">Success:</span> {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          <span className="font-medium">Error:</span> {error}
        </div>
      ) : null}

      <div className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
        {/* Fee due day */}
        <section className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-700">
            <svg className="mr-1.5 inline h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Fee Due Day (Global)
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-sky"
              type="number"
              min={1}
              max={31}
              value={feeDueDayOfMonth}
              onChange={(event) => setFeeDueDayOfMonth(Math.max(1, Math.min(31, Number(event.target.value || 1))))}
            />
            <div className="rounded-lg bg-brand-sky/5 px-4 py-2.5 text-sm text-slate-600">
              All fees due on day <span className="font-bold text-brand-navy">{feeDueDayOfMonth}</span> of each month.
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">If a month has fewer days, due date auto-falls on that month&apos;s last day.</p>
        </section>

        {/* Add/remove grade */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white"
            placeholder="Add grade (e.g. 10)"
            value={newGrade}
            onChange={(event) => setNewGrade(event.target.value)}
          />
          <button type="button" onClick={addGrade} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:border-brand-sky hover:text-brand-navy">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Grade
          </button>
          <button
            type="button"
            onClick={removeSelectedGrade}
            disabled={!selectedGrade}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3" /></svg>
            Remove Selected
          </button>
        </div>

        {/* Grade chips */}
        <section className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-700">Grades</p>
          <div className="flex flex-wrap gap-2">
            {grades.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedGradeId(entry.id)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  selectedGradeId === entry.id
                    ? 'bg-brand-navy text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-sky hover:text-brand-navy'
                }`}
              >
                Grade {entry.grade}
              </button>
            ))}
            {grades.length === 0 ? <p className="text-sm text-slate-400">No grades configured yet.</p> : null}
          </div>
        </section>

        {/* Section toggles */}
        <section className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-700">
            Sections for {selectedGrade ? `Grade ${selectedGrade.grade}` : 'selected grade'}
          </p>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_SECTION_OPTIONS.map((section) => {
              const active = selectedGrade?.sections.includes(section) ?? false;
              return (
                <button
                  key={section}
                  type="button"
                  disabled={!selectedGrade}
                  onClick={() => toggleSection(section)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-brand-navy text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-sky hover:text-brand-navy'
                  } disabled:opacity-40`}
                >
                  {section}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">Select at least one section for each grade.</p>
        </section>

        <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-brand-navy px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90 active:scale-[0.98] disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
