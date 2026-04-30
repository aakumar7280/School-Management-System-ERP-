import { useEffect, useMemo, useRef, useState } from 'react';

import { AuthSession } from '../auth/types';
import {
  ClassAttendanceDaySummary,
  ClassAttendanceRecord,
  fetchClassAttendance,
  fetchClassAttendanceHistory,
  saveClassAttendance
} from '../lib/api';

interface TeacherAttendancePageProps {
  session: AuthSession;
}

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateToIso(day: Date) {
  return day.toISOString().slice(0, 10);
}

function monthStart(day: Date) {
  return new Date(day.getFullYear(), day.getMonth(), 1);
}

function addMonths(day: Date, delta: number) {
  return new Date(day.getFullYear(), day.getMonth() + delta, 1);
}

function buildCalendarDays(activeMonth: Date) {
  const firstOfMonth = monthStart(activeMonth);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

export function TeacherAttendancePage({ session }: TeacherAttendancePageProps) {
  const className = session.user.assignedClass ?? '';
  const section = session.user.assignedSection ?? '';
  const hasClassTeacherAssignment = Boolean(className && section);

  const [date, setDate] = useState(today());
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initialDate = new Date(today());
    return monthStart(initialDate);
  });
  const [records, setRecords] = useState<ClassAttendanceRecord[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<ClassAttendanceDaySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  async function loadAttendance() {
    if (!hasClassTeacherAssignment) {
      setRecords([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchClassAttendance({ className, section, date });
      setRecords(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadAttendanceHistory() {
    if (!hasClassTeacherAssignment) {
      setAttendanceHistory([]);
      return;
    }

    setHistoryLoading(true);
    try {
      const history = await fetchClassAttendanceHistory({ className, section });
      setAttendanceHistory(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance history');
      setAttendanceHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    loadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, section, date]);

  useEffect(() => {
    loadAttendanceHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, section]);

  function updateRecord(studentId: string, patch: Partial<ClassAttendanceRecord>) {
    setRecords((previous) => previous.map((record) => (record.studentId === studentId ? { ...record, ...patch } : record)));
  }

  function toggleSelectAllPresent(nextPresent: boolean) {
    setRecords((previous) => previous.map((record) => ({ ...record, present: nextPresent })));
  }

  async function handleSave() {
    if (!hasClassTeacherAssignment || records.length === 0) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await saveClassAttendance({
        className,
        section,
        date,
        records: records.map((record) => ({
          studentId: record.studentId,
          present: record.present,
          remark: record.remark || undefined
        }))
      });

      setMessage('Attendance saved successfully.');
      await loadAttendanceHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  }

  const presentCount = records.filter((record) => record.present).length;
  const attendancePct = records.length > 0 ? Math.round((presentCount / records.length) * 100) : 0;
  const allPresentSelected = records.length > 0 && records.every((record) => record.present);
  const somePresentSelected = records.some((record) => record.present) && !allPresentSelected;
  const attendanceHistoryByDate = useMemo(
    () => new Map(attendanceHistory.map((row) => [row.date, row])),
    [attendanceHistory]
  );
  const selectedDateSummary = useMemo(() => attendanceHistoryByDate.get(date) ?? null, [attendanceHistoryByDate, date]);
  const presentStudents = useMemo(() => records.filter((record) => record.present), [records]);
  const absentStudents = useMemo(() => records.filter((record) => !record.present), [records]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const calendarMonthLabel = useMemo(
    () => calendarMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    [calendarMonth]
  );

  useEffect(() => {
    const selectedDate = new Date(date);
    if (!Number.isNaN(selectedDate.getTime())) {
      setCalendarMonth(monthStart(selectedDate));
    }
  }, [date]);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = somePresentSelected;
    }
  }, [somePresentSelected]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">Attendance</h2>
        <p className="mt-1 text-slate-500">Record and review attendance for your class-teacher class.</p>
      </div>

      {!hasClassTeacherAssignment ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Attendance can be taken only after assigning this teacher as class teacher for one class.
        </div>
      ) : (
        <>
          {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          <section className="space-y-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200/80 bg-slate-50/40 p-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Selected Date</label>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy">{date}</div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Class Teacher Class</label>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-brand-navy">
                  {className}/{section}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50">
                  <span className="text-sm font-bold text-emerald-700">{attendancePct}%</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-brand-navy">Present {presentCount} / {records.length}</p>
                  <p className="text-xs text-slate-400">for selected date</p>
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
                    <tr className="border-b border-slate-100 bg-white">
                      <th className="px-4 py-2 text-xs text-slate-500" colSpan={2}>Quick Action</th>
                      <th className="px-4 py-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-brand-navy">
                          <input
                            ref={selectAllCheckboxRef}
                            type="checkbox"
                            checked={allPresentSelected}
                            onChange={(event) => toggleSelectAllPresent(event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-navy focus:ring-brand-sky"
                          />
                          Select All Students Present
                        </label>
                      </th>
                      <th className="px-4 py-2" />
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
          </section>

          <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
            <h3 className="text-base font-semibold text-brand-navy">Attendance Calendar</h3>
            <p className="mt-1 text-xs text-slate-500">Select any day on the calendar to view attendance for that date.</p>

            {historyLoading ? (
              <div className="mt-3 text-xs text-slate-500">Loading attendance history...</div>
            ) : (
              <div className="mt-3 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((previous) => addMonths(previous, -1))}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-sky hover:text-brand-navy"
                  >
                    Prev Month
                  </button>
                  <p className="text-sm font-semibold text-brand-navy">{calendarMonthLabel}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date(today());
                        setCalendarMonth(monthStart(now));
                        setDate(dateToIso(now));
                      }}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-sky hover:text-brand-navy"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarMonth((previous) => addMonths(previous, 1))}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-sky hover:text-brand-navy"
                    >
                      Next Month
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3">
                  <div className="grid grid-cols-7 gap-2">
                    {WEEK_DAYS.map((weekDay) => (
                      <div key={weekDay} className="px-2 py-1 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {weekDay}
                      </div>
                    ))}

                    {calendarDays.map((day) => {
                      const isoDate = dateToIso(day);
                      const inActiveMonth = day.getMonth() === calendarMonth.getMonth();
                      const daySummary = attendanceHistoryByDate.get(isoDate);
                      const isSelected = isoDate === date;
                      const hasHistory = Boolean(daySummary);

                      return (
                        <button
                          key={isoDate}
                          type="button"
                          onClick={() => setDate(isoDate)}
                          className={`min-h-[88px] rounded-lg border p-2 text-left transition ${
                            isSelected
                              ? 'border-brand-navy bg-brand-navy text-white'
                              : inActiveMonth
                                ? 'border-slate-200 bg-white hover:border-brand-sky/50'
                                : 'border-slate-100 bg-slate-100/70 text-slate-400'
                          }`}
                        >
                          <p className={`text-sm font-semibold ${isSelected ? 'text-white' : inActiveMonth ? 'text-brand-navy' : 'text-slate-400'}`}>
                            {day.getDate()}
                          </p>
                          {hasHistory ? (
                            <div className="mt-2 space-y-1 text-[10px]">
                              <p className={isSelected ? 'text-emerald-100' : 'text-emerald-700'}>P: {daySummary?.presentCount ?? 0}</p>
                              <p className={isSelected ? 'text-red-100' : 'text-red-600'}>A: {daySummary?.absentCount ?? 0}</p>
                            </div>
                          ) : (
                            <p className={`mt-2 text-[10px] ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>No record</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200/80 bg-white p-3">
                  <h4 className="text-sm font-semibold text-brand-navy">Selected Date Details: {date}</h4>
                  {selectedDateSummary ? (
                    <p className="mt-1 text-xs text-slate-600">
                      Present: {selectedDateSummary.presentCount}, Absent: {selectedDateSummary.absentCount}, Marked: {selectedDateSummary.markedCount}/{selectedDateSummary.totalStudents}, Attendance: {selectedDateSummary.attendancePct}%
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">No saved attendance found for this date yet. You can mark attendance above and save.</p>
                  )}

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Present Students ({presentStudents.length})</p>
                      <div className="mt-2 max-h-44 space-y-1 overflow-auto text-xs text-emerald-800">
                        {presentStudents.length > 0 ? presentStudents.map((student) => (
                          <p key={`present-${student.studentId}`}>{student.name}</p>
                        )) : <p className="text-emerald-700/80">No present students for selected date.</p>}
                      </div>
                    </div>

                    <div className="rounded-md border border-red-200 bg-red-50/70 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-red-700">Absent Students ({absentStudents.length})</p>
                      <div className="mt-2 max-h-44 space-y-1 overflow-auto text-xs text-red-800">
                        {absentStudents.length > 0 ? absentStudents.map((student) => (
                          <p key={`absent-${student.studentId}`}>{student.name}</p>
                        )) : <p className="text-red-700/80">No absent students for selected date.</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
