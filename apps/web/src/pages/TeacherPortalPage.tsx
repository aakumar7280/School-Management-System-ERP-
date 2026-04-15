import { useEffect, useState } from 'react';

import { AuthSession } from '../auth/types';
import { ClassAttendanceRecord, fetchClassAttendance, saveClassAttendance } from '../lib/api';

interface TeacherPortalPageProps {
  session: AuthSession;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function TeacherPortalPage({ session }: TeacherPortalPageProps) {
  const assignedClass = session.user.assignedClass ?? '';
  const assignedSection = session.user.assignedSection ?? '';

  const [date, setDate] = useState(today());
  const [records, setRecords] = useState<ClassAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadAttendance() {
    if (!assignedClass || !assignedSection) return;

    setLoading(true);
    setError(null);
    try {
      const data = await fetchClassAttendance({ className: assignedClass, section: assignedSection, date });
      setRecords(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load class attendance');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, assignedClass, assignedSection]);

  function updateRecord(studentId: string, patch: Partial<ClassAttendanceRecord>) {
    setRecords((prev) => prev.map((record) => (record.studentId === studentId ? { ...record, ...patch } : record)));
  }

  async function handleSave() {
    if (!assignedClass || !assignedSection) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await saveClassAttendance({
        className: assignedClass,
        section: assignedSection,
        date,
        records: records.map((record) => ({
          studentId: record.studentId,
          present: record.present,
          remark: record.remark || undefined
        }))
      });
      setMessage('Attendance saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  }

  if (!assignedClass || !assignedSection) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
        No class/section assignment found for this teacher. Please contact admin.
      </div>
    );
  }

  const presentCount = records.filter((record) => record.present).length;
  const attendancePct = records.length > 0 ? Math.round((presentCount / records.length) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">Teacher Portal</h2>
        <p className="mt-1 text-slate-500">Class {assignedClass} &middot; Section {assignedSection}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {session.user.subjects && session.user.subjects.length > 0
            ? session.user.subjects.map((subj: string) => (
                <span key={subj} className="rounded-full bg-brand-navy/10 px-3 py-0.5 text-xs font-medium text-brand-navy">{subj}</span>
              ))
            : <span className="text-xs text-slate-400">No subjects assigned</span>}
        </div>
      </div>

      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Date</label>
          <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50">
            <span className="text-sm font-bold text-emerald-700">{attendancePct}%</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-navy">Present {presentCount} / {records.length}</p>
            <p className="text-xs text-slate-400">students marked</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Loading attendance list...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-card">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Admission No</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Student</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Present</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Remark</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.studentId} className="border-b border-slate-100 table-row-hover">
                  <td className="px-4 py-3 font-mono text-xs">{record.admissionNo}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{record.name}</td>
                  <td className="px-4 py-3">
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={record.present}
                        onChange={(e) => updateRecord(record.studentId, { present: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-brand-navy focus:ring-brand-sky"
                      />
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${record.present ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                        {record.present ? 'Present' : 'Absent'}
                      </span>
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-2 py-1 text-sm transition-colors focus:border-brand-sky focus:bg-white"
                      value={record.remark}
                      onChange={(e) => updateRecord(record.studentId, { remark: e.target.value })}
                      placeholder="Optional remark"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-navy/90 disabled:opacity-60"
        >
          {saving ? (
            <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving...</>
          ) : (
            <><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Save Attendance</>
          )}
        </button>
      </div>
    </div>
  );
}
