import { FormEvent, useEffect, useMemo, useState } from 'react';

import { createTeacher, fetchAcademicStructure, fetchTeachers, GradeSetting, Teacher, updateTeacher } from '../lib/api';

type TeacherEditForm = {
  loginId: string;
  password: string;
  firstName: string;
  lastName: string;
  email: string;
  assignedClass: string;
  assignedSection: string;
  subjects: string;
};

type StaffEditDraft = {
  selectedTeacherId: string;
  editForm: TeacherEditForm;
  showEditPassword: boolean;
};

const STAFF_EDIT_DRAFT_KEY = 'school_erp_staff_edit_draft';

const defaultEditForm: TeacherEditForm = {
  loginId: '',
  password: '',
  firstName: '',
  lastName: '',
  email: '',
  assignedClass: '',
  assignedSection: '',
  subjects: ''
};

function readStaffEditDraft(): StaffEditDraft | null {
  try {
    const raw = sessionStorage.getItem(STAFF_EDIT_DRAFT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StaffEditDraft>;
    if (!parsed.selectedTeacherId || !parsed.editForm) {
      return null;
    }

    return {
      selectedTeacherId: parsed.selectedTeacherId,
      editForm: {
        ...defaultEditForm,
        ...parsed.editForm
      },
      showEditPassword: Boolean(parsed.showEditPassword)
    };
  } catch {
    return null;
  }
}

export function StaffManagementPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gradeSettings, setGradeSettings] = useState<GradeSetting[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [selectedSection, setSelectedSection] = useState('ALL');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(() => readStaffEditDraft()?.selectedTeacherId ?? null);

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

  const [editForm, setEditForm] = useState<TeacherEditForm>(() => readStaffEditDraft()?.editForm ?? defaultEditForm);
  const [updating, setUpdating] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(() => readStaffEditDraft()?.showEditPassword ?? false);

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
    setSelectedTeacherId(teacher.id);
    setEditForm({
      loginId: teacher.loginId,
      password: '',
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

    const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId) ?? null;
    if (!selectedTeacher) return;

    setUpdating(true);
    setMessage(null);
    setError(null);

    try {
      await updateTeacher(selectedTeacher.id, {
        loginId: editForm.loginId.trim(),
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email.trim().toLowerCase(),
        password: editForm.password.trim() ? editForm.password.trim() : undefined,
        assignedClass: editForm.assignedClass,
        assignedSection: editForm.assignedSection,
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
  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => teacher.id === selectedTeacherId) ?? null,
    [teachers, selectedTeacherId]
  );

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

  useEffect(() => {
    if (!selectedTeacherId) {
      sessionStorage.removeItem(STAFF_EDIT_DRAFT_KEY);
      return;
    }

    const draft: StaffEditDraft = {
      selectedTeacherId,
      editForm,
      showEditPassword
    };
    sessionStorage.setItem(STAFF_EDIT_DRAFT_KEY, JSON.stringify(draft));
  }, [selectedTeacherId, editForm, showEditPassword]);

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
            <div className="relative">
              <input
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 pr-10 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white"
                placeholder="Password"
                type={showCreatePassword ? 'text' : 'password'}
                value={teacherForm.password}
                onChange={(e) => setTeacherForm((prev) => ({ ...prev, password: e.target.value }))}
                required
              />
              <button
                type="button"
                onClick={() => setShowCreatePassword((prev) => !prev)}
                className="absolute inset-y-0 right-2 inline-flex items-center text-slate-500 hover:text-brand-navy"
                aria-label={showCreatePassword ? 'Hide password' : 'Show password'}
              >
                {showCreatePassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.956 9.956 0 012.287-3.592m3.11-2.122A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a9.962 9.962 0 01-4.276 5.268M15 12a3 3 0 11-6 0 3 3 0 016 0zm6 9L3 3" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
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
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white md:col-span-2" placeholder="Subjects (comma separated). Optional extra class map: Science@8/B" value={teacherForm.subjects} onChange={(e) => setTeacherForm((prev) => ({ ...prev, subjects: e.target.value }))} required />
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
            <div className="relative">
              <input
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 pr-10 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white"
                placeholder="New Password (optional, min 6)"
                type={showEditPassword ? 'text' : 'password'}
                value={editForm.password}
                onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))}
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowEditPassword((prev) => !prev)}
                className="absolute inset-y-0 right-2 inline-flex items-center text-slate-500 hover:text-brand-navy"
                aria-label={showEditPassword ? 'Hide password' : 'Show password'}
              >
                {showEditPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.956 9.956 0 012.287-3.592m3.11-2.122A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a9.962 9.962 0 01-4.276 5.268M15 12a3 3 0 11-6 0 3 3 0 016 0zm6 9L3 3" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
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
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-sky focus:bg-white md:col-span-3" placeholder="Subjects (comma separated). Optional extra class map: Science@8/B" value={editForm.subjects} onChange={(e) => setEditForm((prev) => ({ ...prev, subjects: e.target.value }))} required />
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
