import { FormEvent, useEffect, useMemo, useState } from 'react';

import { createTeacher, fetchAcademicStructure, fetchTeachers, GradeSetting, Teacher, updateTeacher } from '../lib/api';

export function StaffManagementPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gradeSettings, setGradeSettings] = useState<GradeSetting[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [selectedSection, setSelectedSection] = useState('ALL');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);

  const [teacherForm, setTeacherForm] = useState({
    loginId: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    assignedClass: '',
    assignedSection: '',
    subjects: ''
  });

  const [editForm, setEditForm] = useState({
    loginId: '',
    firstName: '',
    lastName: '',
    email: '',
    assignedClass: '',
    assignedSection: '',
    subjects: ''
  });
  const [updating, setUpdating] = useState(false);

  async function loadTeachers() {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchTeachers();
      setTeachers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teachers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeachers();
    fetchAcademicStructure()
      .then((data) => setGradeSettings(data.grades))
      .catch(() => setGradeSettings([]));
  }, []);

  async function handleCreateTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    try {
      await createTeacher({
        ...teacherForm,
        loginId: teacherForm.loginId.trim(),
        email: teacherForm.email.trim().toLowerCase(),
        subjects: teacherForm.subjects
          .split(',')
          .map((subject) => subject.trim())
          .filter(Boolean)
      });
      setTeacherForm({
        loginId: '',
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        assignedClass: '',
        assignedSection: '',
        subjects: ''
      });
      setShowAddForm(false);
      setMessage('Teacher added successfully.');
      await loadTeachers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create teacher');
    }
  }

  function handleSelectTeacher(teacher: Teacher) {
    setSelectedTeacher(teacher);
    setEditForm({
      loginId: teacher.loginId,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      email: teacher.email,
      assignedClass: teacher.assignedClass ?? '',
      assignedSection: teacher.assignedSection ?? '',
      subjects: teacher.subjects.join(', ')
    });
  }

  async function handleUpdateTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTeacher) return;

    setUpdating(true);
    setMessage(null);
    setError(null);

    try {
      await updateTeacher(selectedTeacher.id, {
        ...editForm,
        subjects: editForm.subjects
          .split(',')
          .map((subject) => subject.trim())
          .filter(Boolean)
      });
      setMessage('Teacher details updated.');
      await loadTeachers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update teacher');
    } finally {
      setUpdating(false);
    }
  }

  const classOptions = useMemo(() => Array.from(new Set(teachers.map((teacher) => teacher.assignedClass).filter(Boolean) as string[])).sort(), [teachers]);
  const sectionOptions = useMemo(() => Array.from(new Set(teachers.map((teacher) => teacher.assignedSection).filter(Boolean) as string[])).sort(), [teachers]);
  const allowedGrades = useMemo(() => gradeSettings.map((entry) => entry.grade), [gradeSettings]);
  const addAllowedSections = useMemo(() => gradeSettings.find((entry) => entry.grade === teacherForm.assignedClass)?.sections ?? [], [gradeSettings, teacherForm.assignedClass]);
  const editAllowedSections = useMemo(() => gradeSettings.find((entry) => entry.grade === editForm.assignedClass)?.sections ?? [], [gradeSettings, editForm.assignedClass]);

  useEffect(() => {
    if (!teacherForm.assignedClass) return;
    if (addAllowedSections.length > 0 && !addAllowedSections.includes(teacherForm.assignedSection)) {
      setTeacherForm((prev) => ({ ...prev, assignedSection: addAllowedSections[0] }));
    }
  }, [teacherForm.assignedClass, teacherForm.assignedSection, addAllowedSections]);

  useEffect(() => {
    if (!editForm.assignedClass) return;
    if (editAllowedSections.length > 0 && !editAllowedSections.includes(editForm.assignedSection)) {
      setEditForm((prev) => ({ ...prev, assignedSection: editAllowedSections[0] }));
    }
  }, [editForm.assignedClass, editForm.assignedSection, editAllowedSections]);

  const filteredTeachers = useMemo(
    () =>
      teachers.filter((teacher) => {
        const classMatch = selectedClass === 'ALL' || teacher.assignedClass === selectedClass;
        const sectionMatch = selectedSection === 'ALL' || teacher.assignedSection === selectedSection;
        return classMatch && sectionMatch;
      }),
    [teachers, selectedClass, selectedSection]
  );

  if (loading) return <p className="py-10 text-center text-sm text-slate-400">Loading staff...</p>;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Staff Management</h2>
        <p className="mt-1 text-sm text-slate-500">Manage teacher profiles, assignments, and credentials.</p>
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
        <button
          type="button"
          onClick={() => setShowAddForm((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90 active:scale-[0.98]"
        >
          {showAddForm ? (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              Close
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Add Teacher
            </>
          )}
        </button>
        <div className="h-6 w-px bg-slate-200" />
        <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-brand-sky focus:bg-white" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
          <option value="ALL">All Classes</option>
          {classOptions.map((className) => (
            <option key={className} value={className}>{className}</option>
          ))}
        </select>
        <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-brand-sky focus:bg-white" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
          <option value="ALL">All Sections</option>
          {sectionOptions.map((section) => (
            <option key={section} value={section}>{section}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-slate-400">
          {filteredTeachers.length} teacher{filteredTeachers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Add teacher form */}
      {showAddForm ? (
        <form onSubmit={handleCreateTeacher} className="animate-slide-up rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h3 className="mb-4 text-base font-semibold text-slate-800">New Teacher</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white" placeholder="Teacher Login ID" value={teacherForm.loginId} onChange={(e) => setTeacherForm((prev) => ({ ...prev, loginId: e.target.value }))} required />
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white" placeholder="First Name" value={teacherForm.firstName} onChange={(e) => setTeacherForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white" placeholder="Last Name" value={teacherForm.lastName} onChange={(e) => setTeacherForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white" placeholder="Email" type="email" value={teacherForm.email} onChange={(e) => setTeacherForm((prev) => ({ ...prev, email: e.target.value }))} required />
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white" placeholder="Password" type="password" value={teacherForm.password} onChange={(e) => setTeacherForm((prev) => ({ ...prev, password: e.target.value }))} required />
            <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-brand-sky focus:bg-white" value={teacherForm.assignedClass} onChange={(e) => setTeacherForm((prev) => ({ ...prev, assignedClass: e.target.value, assignedSection: '' }))} required>
              <option value="">Select Class</option>
              {allowedGrades.map((grade) => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </select>
            <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-brand-sky focus:bg-white" value={teacherForm.assignedSection} onChange={(e) => setTeacherForm((prev) => ({ ...prev, assignedSection: e.target.value }))} required>
              <option value="">Select Section</option>
              {addAllowedSections.map((section) => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white md:col-span-2" placeholder="Subjects (comma separated)" value={teacherForm.subjects} onChange={(e) => setTeacherForm((prev) => ({ ...prev, subjects: e.target.value }))} required />
          </div>
          <div className="mt-4">
            <button type="submit" className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90 active:scale-[0.98]">Add Teacher</button>
          </div>
        </form>
      ) : null}

      {/* Teachers table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Login ID</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Teacher</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Email</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Assigned Class</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredTeachers.map((teacher) => (
              <tr
                key={teacher.id}
                className={`cursor-pointer table-row-hover ${selectedTeacher?.id === teacher.id ? 'bg-brand-navy/5' : 'hover:bg-slate-50/50'}`}
                onClick={() => handleSelectTeacher(teacher)}
              >
                <td className="px-5 py-3 font-mono text-xs font-medium text-brand-navy">{teacher.loginId}</td>
                <td className="px-5 py-3 font-medium text-slate-700">{teacher.firstName} {teacher.lastName}</td>
                <td className="px-5 py-3 text-slate-500">{teacher.email}</td>
                <td className="px-5 py-3">
                  {teacher.assignedClass ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {teacher.assignedClass} {teacher.assignedSection ?? ''}
                    </span>
                  ) : <span className="text-slate-300">-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredTeachers.length === 0 && <p className="px-5 py-6 text-center text-sm text-slate-400">No teachers found.</p>}
      </div>

      {selectedTeacher ? (
        <form onSubmit={handleUpdateTeacher} className="animate-slide-up rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Edit Teacher: <span className="text-brand-navy">{selectedTeacher.firstName} {selectedTeacher.lastName}</span></h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white" placeholder="Login ID" value={editForm.loginId} onChange={(e) => setEditForm((prev) => ({ ...prev, loginId: e.target.value }))} required />
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white" placeholder="First Name" value={editForm.firstName} onChange={(e) => setEditForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white" placeholder="Last Name" value={editForm.lastName} onChange={(e) => setEditForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white" placeholder="Email" value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} required />
            <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-brand-sky focus:bg-white" value={editForm.assignedClass} onChange={(e) => setEditForm((prev) => ({ ...prev, assignedClass: e.target.value, assignedSection: '' }))} required>
              <option value="">Select Class</option>
              {allowedGrades.map((grade) => (
                <option key={grade} value={grade}>{grade}</option>
              ))}
            </select>
            <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm focus:border-brand-sky focus:bg-white" value={editForm.assignedSection} onChange={(e) => setEditForm((prev) => ({ ...prev, assignedSection: e.target.value }))} required>
              <option value="">Select Section</option>
              {editAllowedSections.map((section) => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white md:col-span-3" placeholder="Subjects (comma separated)" value={editForm.subjects} onChange={(e) => setEditForm((prev) => ({ ...prev, subjects: e.target.value }))} required />
          </div>
          <div className="mt-4">
            <button type="submit" disabled={updating} className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90 active:scale-[0.98] disabled:opacity-60">
              {updating ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-center text-sm text-slate-400">Click any teacher row to edit details and assignment.</p>
      )}
    </div>
  );
}
