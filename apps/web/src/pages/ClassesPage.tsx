import { useEffect, useMemo, useState } from 'react';

import { ClassAttendanceRecord, ClassOverview, fetchClassAttendance, fetchClassesOverview } from '../lib/api';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function ClassesPage() {
  const [overview, setOverview] = useState<ClassOverview[]>([]);
  const [records, setRecords] = useState<ClassAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(today());

  useEffect(() => {
    async function loadOverview() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchClassesOverview();
        setOverview(data);
        if (data.length > 0) {
          setSelectedClass(data[0].className);
          setSelectedSection(data[0].section);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load classes');
      } finally {
        setLoading(false);
      }
    }

    loadOverview();
  }, []);

  const sectionsForSelectedClass = useMemo(() => {
    return overview
      .filter((item) => item.className === selectedClass)
      .map((item) => item.section)
      .sort();
  }, [overview, selectedClass]);

  useEffect(() => {
    if (!selectedClass) return;
    if (!sectionsForSelectedClass.includes(selectedSection) && sectionsForSelectedClass.length > 0) {
      setSelectedSection(sectionsForSelectedClass[0]);
    }
  }, [sectionsForSelectedClass, selectedSection, selectedClass]);

  async function loadAttendance() {
    if (!selectedClass || !selectedSection) return;
    setLoadingAttendance(true);
    setError(null);
    try {
      const data = await fetchClassAttendance({ className: selectedClass, section: selectedSection, date: attendanceDate });
      setRecords(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance');
      setRecords([]);
    } finally {
      setLoadingAttendance(false);
    }
  }

  useEffect(() => {
    if (selectedClass && selectedSection) {
      loadAttendance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, selectedSection, attendanceDate]);

  if (loading) return <p className="py-10 text-center text-sm text-slate-400">Loading classes...</p>;

  const classOptions = Array.from(new Set(overview.map((item) => item.className))).sort();
  const presentCount = records.filter((record) => record.present).length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Classes</h2>
        <p className="mt-1 text-sm text-slate-500">View class-wise students, teachers, and attendance.</p>
      </div>
      {error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          <span className="font-medium">Error:</span> {error}
        </div>
      ) : null}

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card md:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Class</label>
          <select className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-brand-sky focus:bg-white" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
            {classOptions.map((className) => (
              <option key={className} value={className}>{className}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Section</label>
          <select className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-brand-sky focus:bg-white" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
            {sectionsForSelectedClass.map((section) => (
              <option key={section} value={section}>{section}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Date</label>
          <input className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-brand-sky focus:bg-white" type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} />
        </div>
      </div>

      {/* Class info cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {overview
          .filter((item) => item.className === selectedClass && item.section === selectedSection)
          .map((item) => (
            <article key={`${item.className}-${item.section}`} className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
              <div className="absolute left-0 top-0 h-full w-1 bg-brand-sky" />
              <h3 className="text-lg font-bold text-slate-800">Class {item.className} - Section {item.section}</h3>
              <div className="mt-3 space-y-1.5">
                <p className="flex items-center gap-2 text-sm text-slate-600">
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0v7" /></svg>
                  <span><span className="font-semibold text-slate-800">{item.studentCount}</span> Students</span>
                </p>
                <p className="flex items-start gap-2 text-sm text-slate-600">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <span>{item.teachers.length > 0 ? item.teachers.map((teacher) => `${teacher.name} (${teacher.subjects.join(', ')})`).join(', ') : <em className="text-slate-400">Not assigned</em>}</span>
                </p>
              </div>
            </article>
          ))}
      </div>

      {/* Attendance table */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Class Attendance</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Present <span className="font-semibold text-emerald-600">{presentCount}</span> / {records.length} student(s)
            </p>
          </div>
          {records.length > 0 && (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-600">
              {records.length > 0 ? Math.round((presentCount / records.length) * 100) : 0}%
            </div>
          )}
        </div>

        {loadingAttendance ? (
          <p className="px-5 py-6 text-sm text-slate-400">Loading attendance...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Admission No</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Name</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {records.map((record) => (
                  <tr key={record.studentId} className="table-row-hover hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-medium text-slate-700">{record.admissionNo}</td>
                    <td className="px-5 py-3 text-slate-600">{record.name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${record.present ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                        {record.present ? 'Present' : 'Absent'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{record.remark || <span className="text-slate-300">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
