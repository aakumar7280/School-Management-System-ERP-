import { useEffect, useMemo, useState } from 'react';

import { AuthSession } from '../auth/types';
import { ClassAttendanceRecord, fetchClassAttendance } from '../lib/api';

interface TeacherPortalPageProps {
  session: AuthSession;
}

interface TeachingClassEntry {
  className: string;
  section: string;
  subjects: string[];
  isClassTeacher: boolean;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeSubjectLabel(rawSubject: string) {
  const [subjectName] = rawSubject.split('@');
  return subjectName.trim();
}

function parseSubjectClassAssignments(subjects: string[] = []) {
  const assignments: Array<{ subject: string; className: string; section: string }> = [];

  subjects.forEach((item) => {
    const trimmed = item.trim();
    const match = trimmed.match(/^(.+?)\s*@\s*([^/\-\s]+)\s*[\/\-]\s*([^/\-\s]+)$/i);
    if (!match) {
      return;
    }

    assignments.push({
      subject: match[1].trim(),
      className: match[2].trim().toUpperCase(),
      section: match[3].trim().toUpperCase()
    });
  });

  return assignments;
}

function classKey(className: string, section: string) {
  return `${className}::${section}`;
}

export function TeacherPortalPage({ session }: TeacherPortalPageProps) {
  const assignedClass = session.user.assignedClass ?? '';
  const assignedSection = session.user.assignedSection ?? '';
  const parsedAssignments = useMemo(() => parseSubjectClassAssignments(session.user.subjects ?? []), [session.user.subjects]);

  const teachingClasses = useMemo(() => {
    const classesMap = new Map<string, TeachingClassEntry>();

    if (assignedClass && assignedSection) {
      classesMap.set(classKey(assignedClass, assignedSection), {
        className: assignedClass,
        section: assignedSection,
        subjects: [],
        isClassTeacher: true
      });
    }

    parsedAssignments.forEach((assignment) => {
      const key = classKey(assignment.className, assignment.section);
      const existing = classesMap.get(key);
      if (existing) {
        existing.subjects = Array.from(new Set([...existing.subjects, assignment.subject]));
        return;
      }

      classesMap.set(key, {
        className: assignment.className,
        section: assignment.section,
        subjects: [assignment.subject],
        isClassTeacher: false
      });
    });

    return Array.from(classesMap.values()).sort((left, right) => {
      if (left.isClassTeacher && !right.isClassTeacher) return -1;
      if (!left.isClassTeacher && right.isClassTeacher) return 1;
      if (left.className === right.className) {
        return left.section.localeCompare(right.section);
      }
      return left.className.localeCompare(right.className);
    });
  }, [assignedClass, assignedSection, parsedAssignments]);

  const primaryClass = useMemo(() => teachingClasses.find((item) => item.isClassTeacher) ?? null, [teachingClasses]);

  const dashboardDate = useMemo(() => today(), []);
  const [selectedDashboardClassKey, setSelectedDashboardClassKey] = useState('');
  const [recordsByClass, setRecordsByClass] = useState<Record<string, ClassAttendanceRecord[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectBadges = useMemo(
    () => Array.from(new Set((session.user.subjects ?? []).map((subject) => normalizeSubjectLabel(subject)).filter((subject) => subject.length > 0))),
    [session.user.subjects]
  );

  useEffect(() => {
    if (teachingClasses.length === 0) {
      setSelectedDashboardClassKey('');
      return;
    }

    if (
      !selectedDashboardClassKey ||
      !teachingClasses.some((entry) => classKey(entry.className, entry.section) === selectedDashboardClassKey)
    ) {
      setSelectedDashboardClassKey(classKey(teachingClasses[0].className, teachingClasses[0].section));
    }
  }, [selectedDashboardClassKey, teachingClasses]);

  const selectedDashboardClass = useMemo(
    () => teachingClasses.find((entry) => classKey(entry.className, entry.section) === selectedDashboardClassKey) ?? null,
    [selectedDashboardClassKey, teachingClasses]
  );

  const selectedDashboardRecords = useMemo(
    () => (selectedDashboardClassKey ? recordsByClass[selectedDashboardClassKey] ?? [] : []),
    [recordsByClass, selectedDashboardClassKey]
  );

  async function loadAttendance() {
    if (teachingClasses.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const rows = await Promise.all(
        teachingClasses.map(async (entry) => {
          const data = await fetchClassAttendance({
            className: entry.className,
            section: entry.section,
            date: dashboardDate
          });
          return [classKey(entry.className, entry.section), data] as const;
        })
      );

      setRecordsByClass(Object.fromEntries(rows));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load class attendance');
      setRecordsByClass({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardDate, teachingClasses]);

  if (teachingClasses.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
        No class assignment found for this teacher. Please contact admin to assign class-teacher class or subject classes.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">Dashboard</h2>
        <p className="mt-1 text-slate-500">Welcome {session.user.name}. This is your class and teaching overview.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {subjectBadges.length > 0
            ? subjectBadges.map((subj: string) => (
                <span key={subj} className="rounded-full bg-brand-navy/10 px-3 py-0.5 text-xs font-medium text-brand-navy">{subj}</span>
              ))
            : <span className="text-xs text-slate-400">No subjects assigned</span>}
        </div>
      </div>

      <section className="space-y-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
        <div>
          <h3 className="text-base font-semibold text-brand-navy">Dashboard</h3>
          <p className="mt-1 text-xs text-slate-500">Class overview for class teacher and teaching assignments. Attendance actions are available in the Attendance tab.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {teachingClasses.map((entry) => {
            const key = classKey(entry.className, entry.section);
            const classRecords = recordsByClass[key] ?? [];

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDashboardClassKey(key)}
                className={`rounded-xl border px-4 py-3 text-left shadow-card transition ${
                  selectedDashboardClassKey === key
                    ? 'border-brand-navy/40 bg-brand-navy/5'
                    : 'border-slate-200/80 bg-white hover:border-brand-sky/40'
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {entry.isClassTeacher ? 'Class Teacher' : 'Teaching Class'}
                </p>
                <p className="mt-1 text-base font-semibold text-brand-navy">
                  Class {entry.className} / {entry.section}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {entry.subjects.length > 0 ? `Subjects: ${entry.subjects.join(', ')}` : 'Primary class assignment'}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Students: {classRecords.length}
                </p>
              </button>
            );
          })}
        </div>

        {selectedDashboardClass ? (
          <div className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-3">
            <p className="text-sm font-semibold text-brand-navy">
              Viewing Class {selectedDashboardClass.className}/{selectedDashboardClass.section}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Total active students: {selectedDashboardRecords.length}
            </p>
          </div>
        ) : null}

        <div>
          <h4 className="text-sm font-semibold text-brand-navy">All Assigned Classes Student List</h4>
          <p className="mt-1 text-xs text-slate-500">Students visible for each class you are assigned to teach.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {teachingClasses.map((entry) => {
              const key = classKey(entry.className, entry.section);
              const classRecords = recordsByClass[key] ?? [];

              return (
                <div key={`students-${key}`} className="rounded-lg border border-slate-200/80 bg-slate-50/40 p-3">
                  <p className="text-sm font-semibold text-brand-navy">Class {entry.className}/{entry.section}</p>
                  <p className="text-xs text-slate-500">
                    {entry.isClassTeacher ? 'Class teacher class' : `Subjects: ${entry.subjects.join(', ') || 'Assigned subject classes'}`}
                  </p>
                  {classRecords.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">No active students found for selected date.</p>
                  ) : (
                    <div className="mt-2 max-h-40 overflow-auto rounded-md border border-slate-200 bg-white p-2">
                      {classRecords.map((record) => (
                        <div key={`student-list-${key}-${record.studentId}`} className="flex items-center justify-between border-b border-slate-100 py-1 text-xs last:border-b-0">
                          <span className="font-medium text-slate-700">{record.name}</span>
                          <span className="text-slate-400">{record.admissionNo}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {primaryClass ? (
          <div className="rounded-lg border border-slate-200/80 bg-white p-3">
            <h4 className="text-sm font-semibold text-brand-navy">Teaching Snapshot</h4>
            <p className="mt-1 text-xs text-slate-500">Overview of your assigned class-teacher and teaching classes.</p>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-3">
                <p className="text-xs text-slate-500">Class Teacher</p>
                <p className="text-lg font-semibold text-brand-navy">{primaryClass.className}/{primaryClass.section}</p>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-3">
                <p className="text-xs text-slate-500">Total Classes Assigned</p>
                <p className="text-lg font-semibold text-brand-navy">{teachingClasses.length}</p>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-3">
                <p className="text-xs text-slate-500">Subjects</p>
                <p className="text-lg font-semibold text-brand-navy">{subjectBadges.length}</p>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
