import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';

import {
  AdminStudentProfile,
  createStudent,
  fetchAcademicStructure,
  fetchAdminStudentProfile,
  fetchStudents,
  GradeSetting,
  Student,
  updateAdminStudentProfile,
  updateStudent
} from '../lib/api';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function isClassOneOrAbove(className?: string) {
  if (!className) return false;
  const numericMatch = className.match(/\d+/);
  if (!numericMatch) return false;
  return Number(numericMatch[0]) >= 1;
}

type ProfileFormState = {
  admissionNo: string;
  firstName: string;
  lastName: string;
  className: string;
  section: string;
  guardianPhone: string;
  dateOfBirth: string;
  gender: string;
  samagraId: string;
  aadhaarNumber: string;
  fullAddress: string;
  city: string;
  state: string;
  pinCode: string;
  caste: string;
  religion: '' | 'Hindu' | 'Muslim' | 'Christian';
  busRoute: string;
  fatherName: string;
  motherName: string;
  parentPhone: string;
  parentEmail: string;
  studentPhone: string;
  studentEmail: string;
  isActive: boolean;
};

export function StudentsPage() {
  const apiOrigin = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api').replace('/api', '');
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gradeSettings, setGradeSettings] = useState<GradeSetting[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [selectedSection, setSelectedSection] = useState('ALL');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [form, setForm] = useState({
    admissionNo: '',
    firstName: '',
    lastName: '',
    className: '',
    section: '',
    guardianPhone: ''
  });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [brokenPhotoIds, setBrokenPhotoIds] = useState<Record<string, boolean>>({});

  const [editForm, setEditForm] = useState({
    admissionNo: '',
    firstName: '',
    lastName: '',
    className: '',
    section: '',
    guardianPhone: ''
  });
  const [profileTab, setProfileTab] = useState<'personal' | 'fees' | 'grades' | 'attendance'>('personal');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [studentProfile, setStudentProfile] = useState<AdminStudentProfile | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [feesViewMonth, setFeesViewMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    admissionNo: '',
    firstName: '',
    lastName: '',
    className: '',
    section: '',
    guardianPhone: '',
    dateOfBirth: '',
    gender: '',
    samagraId: '',
    aadhaarNumber: '',
    fullAddress: '',
    city: '',
    state: '',
    pinCode: '',
    caste: '',
    religion: '',
    busRoute: '',
    fatherName: '',
    motherName: '',
    parentPhone: '',
    parentEmail: '',
    studentPhone: '',
    studentEmail: '',
    isActive: true
  });
  const [profileFiles, setProfileFiles] = useState({
    photo: null as File | null,
    birthCertificate: null as File | null,
    aadhaarCard: null as File | null,
    previousReportCard: null as File | null,
    transferCertificate: null as File | null
  });

  async function loadStudents() {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchStudents();
      setStudents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStudents();
    fetchAcademicStructure()
      .then((data) => setGradeSettings(data.grades))
      .catch(() => setGradeSettings([]));
  }, []);

  async function handleCreateStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await createStudent(form);
      setForm({
        admissionNo: '',
        firstName: '',
        lastName: '',
        className: '',
        section: '',
        guardianPhone: ''
      });
      setShowAddForm(false);
      setMessage('Student added successfully.');
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create student');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedStudent) return;

    setEditing(true);
    setError(null);
    setMessage(null);

    try {
      await updateStudent(selectedStudent.id, editForm);
      setMessage('Student updated successfully.');
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update student');
    } finally {
      setEditing(false);
    }
  }

  function handleSelectStudent(student: Student) {
    setSelectedStudent(student);
    setShowFullDetails(true);
    setProfileTab('personal');
    setProfileError(null);
    setEditForm({
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      className: student.className,
      section: student.section,
      guardianPhone: student.guardianPhone
    });
    void loadStudentProfile(student.id);
  }

  async function loadStudentProfile(studentId: string) {
    setProfileLoading(true);
    setProfileError(null);

    try {
      const profile = await fetchAdminStudentProfile(studentId);
      setStudentProfile(profile);
      setProfileForm({
        admissionNo: profile.personal.admissionNo,
        firstName: profile.personal.firstName,
        lastName: profile.personal.lastName,
        className: profile.personal.className,
        section: profile.personal.section,
        guardianPhone: profile.personal.guardianPhone,
        dateOfBirth: profile.personal.dateOfBirth ? profile.personal.dateOfBirth.slice(0, 10) : '',
        gender: profile.personal.gender ?? '',
        samagraId: profile.personal.samagraId ?? '',
        aadhaarNumber: profile.personal.aadhaarNumber ?? '',
        fullAddress: profile.personal.fullAddress ?? '',
        city: profile.personal.city ?? '',
        state: profile.personal.state ?? '',
        pinCode: profile.personal.pinCode ?? '',
        caste: profile.personal.caste ?? '',
        religion: profile.personal.religion ?? '',
        busRoute: profile.personal.busRoute ?? '',
        fatherName: profile.personal.fatherName ?? '',
        motherName: profile.personal.motherName ?? '',
        parentPhone: profile.personal.parentPhone ?? '',
        parentEmail: profile.personal.parentEmail ?? '',
        studentPhone: profile.personal.studentPhone ?? '',
        studentEmail: profile.personal.studentEmail ?? '',
        isActive: profile.personal.isActive ?? true
      });
      setProfileFiles({
        photo: null,
        birthCertificate: null,
        aadhaarCard: null,
        previousReportCard: null,
        transferCertificate: null
      });
    } catch (profileLoadError) {
      setProfileError(profileLoadError instanceof Error ? profileLoadError.message : 'Failed to load student profile');
      setStudentProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStudent) return;

    const hasName = profileForm.firstName.trim().length > 0 && profileForm.lastName.trim().length > 0;
    if (!hasName) {
      setProfileError('Student name is required. Enter both first and last name.');
      return;
    }

    if (!profileForm.gender.trim()) {
      setProfileError('Gender is required.');
      return;
    }

    if (!profileForm.dateOfBirth) {
      setProfileError('Date of birth is required.');
      return;
    }

    if (!profileForm.fullAddress.trim()) {
      setProfileError('Address is required.');
      return;
    }

    const hasParentName = profileForm.fatherName.trim().length > 0 || profileForm.motherName.trim().length > 0;
    if (!hasParentName) {
      setProfileError('Parent name is required. Add at least father name or mother name.');
      return;
    }

    if (!profileForm.parentPhone.trim() || !profileForm.parentEmail.trim()) {
      setProfileError('Parent phone and parent email are required.');
      return;
    }

    if (!profileForm.samagraId.trim()) {
      setProfileError('Samagra ID is required.');
      return;
    }

    const hasPhoto = Boolean(profileFiles.photo || studentProfile?.personal.photoUrl);
    if (!hasPhoto) {
      setProfileError('Student photo is required. Upload a photo or keep the existing one.');
      return;
    }

    const hasBirthCertificate = Boolean(profileFiles.birthCertificate || studentProfile?.personal.birthCertificateUrl);
    if (!hasBirthCertificate) {
      setProfileError('Birth Certificate is required. Upload it or keep the existing one.');
      return;
    }

    if (isClassOneOrAbove(profileForm.className)) {
      const hasPreviousReportCard = Boolean(profileFiles.previousReportCard || studentProfile?.personal.previousReportCardUrl);
      if (!hasPreviousReportCard) {
        setProfileError('Previous Report Card is required for Class 1 and above.');
        return;
      }

      const hasTransferCertificate = Boolean(profileFiles.transferCertificate || studentProfile?.personal.transferCertificateUrl);
      if (!hasTransferCertificate) {
        setProfileError('Transfer Certificate is required for Class 1 and above.');
        return;
      }
    }

    setProfileSaving(true);
    setProfileError(null);
    setMessage(null);

    try {
      await updateAdminStudentProfile(selectedStudent.id, {
        ...profileForm,
        photo: profileFiles.photo,
        birthCertificate: profileFiles.birthCertificate,
        aadhaarCard: profileFiles.aadhaarCard,
        previousReportCard: profileFiles.previousReportCard,
        transferCertificate: profileFiles.transferCertificate
      });

      setMessage('Student profile updated successfully.');
      await loadStudents();
      await loadStudentProfile(selectedStudent.id);
    } catch (saveError) {
      setProfileError(saveError instanceof Error ? saveError.message : 'Failed to save student profile');
    } finally {
      setProfileSaving(false);
    }
  }

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) => {
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const classMatch = selectedClass === 'ALL' || student.className === selectedClass;
      const sectionMatch = selectedSection === 'ALL' || student.section === selectedSection;
      const searchMatch = !query || fullName.includes(query) || student.admissionNo.toLowerCase().includes(query);
      return classMatch && sectionMatch && searchMatch;
    });
  }, [students, search, selectedClass, selectedSection]);

  const classOptions = useMemo(() => Array.from(new Set(students.map((student) => student.className))).sort(), [students]);
  const sectionOptions = useMemo(() => Array.from(new Set(students.map((student) => student.section))).sort(), [students]);
  const allowedGrades = useMemo(() => gradeSettings.map((entry) => entry.grade), [gradeSettings]);
  const addAllowedSections = useMemo(() => gradeSettings.find((entry) => entry.grade === form.className)?.sections ?? [], [gradeSettings, form.className]);
  const editAllowedSections = useMemo(() => gradeSettings.find((entry) => entry.grade === editForm.className)?.sections ?? [], [gradeSettings, editForm.className]);

  const feesMonthWindow = useMemo(() => {
    const [yearPart, monthPart] = feesViewMonth.split('-').map((value) => Number(value));
    const start = new Date(yearPart, monthPart - 1, 1);
    const end = new Date(yearPart, monthPart, 1);
    return { start, end };
  }, [feesViewMonth]);

  const payableDueInvoices = useMemo(() => {
    if (!studentProfile) return [];

    return studentProfile.fees.invoices
      .filter((invoice) => invoice.due > 0 && new Date(invoice.dueDate) < feesMonthWindow.end)
      .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime());
  }, [studentProfile, feesMonthWindow.end]);

  const carryForwardDueInvoices = useMemo(
    () => payableDueInvoices.filter((invoice) => new Date(invoice.dueDate) < feesMonthWindow.start),
    [payableDueInvoices, feesMonthWindow.start]
  );

  const selectedMonthDueInvoices = useMemo(
    () =>
      payableDueInvoices.filter((invoice) => {
        const dueDate = new Date(invoice.dueDate);
        return dueDate >= feesMonthWindow.start && dueDate < feesMonthWindow.end;
      }),
    [payableDueInvoices, feesMonthWindow.end, feesMonthWindow.start]
  );

  const carryForwardDueTotal = useMemo(
    () => carryForwardDueInvoices.reduce((sum, invoice) => sum + invoice.due, 0),
    [carryForwardDueInvoices]
  );

  const selectedMonthDueTotal = useMemo(
    () => selectedMonthDueInvoices.reduce((sum, invoice) => sum + invoice.due, 0),
    [selectedMonthDueInvoices]
  );

  const totalPayableForSelectedMonth = useMemo(
    () => carryForwardDueTotal + selectedMonthDueTotal,
    [carryForwardDueTotal, selectedMonthDueTotal]
  );

  useEffect(() => {
    if (!form.className) return;
    if (addAllowedSections.length > 0 && !addAllowedSections.includes(form.section)) {
      setForm((prev) => ({ ...prev, section: addAllowedSections[0] }));
    }
  }, [form.className, form.section, addAllowedSections]);

  useEffect(() => {
    if (!editForm.className) return;
    if (editAllowedSections.length > 0 && !editAllowedSections.includes(editForm.section)) {
      setEditForm((prev) => ({ ...prev, section: editAllowedSections[0] }));
    }
  }, [editForm.className, editForm.section, editAllowedSections]);

  function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const nextChar = line[index + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          index += 1;
          continue;
        }

        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    values.push(current.trim());
    return values;
  }

  async function handleImportCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setImporting(true);
    setError(null);
    setMessage(null);

    try {
      const text = await file.text();
      const rows = text
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter((row) => row.length > 0);

      if (rows.length < 2) {
        throw new Error('CSV is empty. Add header and at least one student row.');
      }

      const headers = parseCsvLine(rows[0]).map((header) => header.toLowerCase());
      const requiredHeaders = ['admissionno', 'firstname', 'lastname', 'classname', 'section', 'guardianphone'];

      const missingHeaders = requiredHeaders.filter((requiredHeader) => !headers.includes(requiredHeader));
      if (missingHeaders.length > 0) {
        throw new Error(`Missing required CSV columns: ${missingHeaders.join(', ')}`);
      }

      const getValue = (columns: string[], columnName: string) => {
        const columnIndex = headers.indexOf(columnName);
        return columnIndex >= 0 ? (columns[columnIndex] ?? '').trim() : '';
      };

      let successCount = 0;
      const failures: string[] = [];

      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const columns = parseCsvLine(rows[rowIndex]);

        const payload = {
          admissionNo: getValue(columns, 'admissionno'),
          firstName: getValue(columns, 'firstname'),
          lastName: getValue(columns, 'lastname'),
          className: getValue(columns, 'classname'),
          section: getValue(columns, 'section'),
          guardianPhone: getValue(columns, 'guardianphone')
        };

        if (!payload.admissionNo || !payload.firstName || !payload.lastName || !payload.className || !payload.section || !payload.guardianPhone) {
          failures.push(`Row ${rowIndex + 1}: one or more required fields are empty.`);
          continue;
        }

        try {
          await createStudent(payload);
          successCount += 1;
        } catch (rowError) {
          failures.push(`Row ${rowIndex + 1}: ${rowError instanceof Error ? rowError.message : 'Failed to import student'}`);
        }
      }

      await loadStudents();

      if (failures.length === 0) {
        setMessage(`CSV import complete. Added ${successCount} student(s).`);
      } else {
        setError(failures.slice(0, 5).join(' | '));
        setMessage(`CSV import finished. Added ${successCount} student(s), failed ${failures.length}.`);
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Failed to import CSV');
    } finally {
      setImporting(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-navy" />
    </div>
  );

  return (
    <div className="animate-fade-in space-y-5">
      <h2 className="text-2xl font-bold text-brand-navy">Student Management</h2>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
        <button
          type="button"
          onClick={() => setShowAddForm((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
          {showAddForm ? 'Close Add Student' : 'Add Student'}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-slate-50">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
          {importing ? 'Importing CSV...' : 'Import Students CSV'}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCsv} disabled={importing} />
        </label>
        <input
          className="w-full max-w-md rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
          placeholder="Search by student name or admission number"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
          <option value="ALL">All Classes</option>
          {classOptions.map((className) => (
            <option key={className} value={className}>{className}</option>
          ))}
        </select>
        <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
          <option value="ALL">All Sections</option>
          {sectionOptions.map((section) => (
            <option key={section} value={section}>{section}</option>
          ))}
        </select>
      </div>

      <p className="text-[11px] text-slate-400">CSV columns required: admissionNo, firstName, lastName, className, section, guardianPhone</p>

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-navy/40" />
        Showing {filteredStudents.length} student(s)
        {selectedClass !== 'ALL' ? ` in Class ${selectedClass}` : ''}
        {selectedSection !== 'ALL' ? ` Section ${selectedSection}` : ''}.
      </p>

      {showAddForm ? (
        <form onSubmit={handleCreateStudent} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card md:grid-cols-3">
          <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Admission No" value={form.admissionNo} onChange={(e) => setForm((prev) => ({ ...prev, admissionNo: e.target.value }))} required />
          <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="First Name" value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
          <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Last Name" value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
          <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" value={form.className} onChange={(e) => setForm((prev) => ({ ...prev, className: e.target.value, section: '' }))} required>
            <option value="">Select Class</option>
            {allowedGrades.map((grade) => (
              <option key={grade} value={grade}>{grade}</option>
            ))}
          </select>
          <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" value={form.section} onChange={(e) => setForm((prev) => ({ ...prev, section: e.target.value }))} required>
            <option value="">Select Section</option>
            {addAllowedSections.map((section) => (
              <option key={section} value={section}>{section}</option>
            ))}
          </select>
          <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Guardian Phone" value={form.guardianPhone} onChange={(e) => setForm((prev) => ({ ...prev, guardianPhone: e.target.value }))} required />
          <div className="md:col-span-3">
            <button type="submit" disabled={saving} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60">
              {saving ? 'Adding student...' : 'Add Student'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-card">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b bg-slate-50/80">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Photo</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Admission No</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Name</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Class</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Section</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Guardian Phone</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => (
              <tr
                key={student.id}
                className={`cursor-pointer border-b border-slate-100 table-row-hover hover:bg-slate-50 ${selectedStudent?.id === student.id ? 'bg-brand-navy/5' : ''}`}
                onClick={() => handleSelectStudent(student)}
              >
                <td className="px-4 py-3">
                  {student.photoUrl && !brokenPhotoIds[student.id] ? (
                    <img
                      src={`${apiOrigin}${student.photoUrl}`}
                      alt={`${student.firstName} ${student.lastName}`}
                      className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                      onError={() => setBrokenPhotoIds((prev) => ({ ...prev, [student.id]: true }))}
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-navy/10 text-xs font-semibold text-brand-navy">
                      {`${student.firstName?.[0] ?? ''}${student.lastName?.[0] ?? ''}`.toUpperCase() || 'ST'}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">{student.admissionNo}</td>
                <td className="px-4 py-3">{student.firstName} {student.lastName}</td>
                <td className="px-4 py-3">{student.className}</td>
                <td className="px-4 py-3">{student.section}</td>
                <td className="px-4 py-3">{student.guardianPhone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedStudent && showFullDetails ? (
        <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-brand-navy">
              Student Profile: {selectedStudent.admissionNo} - {selectedStudent.firstName} {selectedStudent.lastName}
            </h3>
            <div className="flex items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200/80">
                <button type="button" onClick={() => setProfileTab('personal')} className={`px-3 py-1.5 text-sm ${profileTab === 'personal' ? 'bg-brand-navy text-white' : 'bg-white text-brand-navy hover:bg-slate-50'}`}>Personal</button>
                <button type="button" onClick={() => setProfileTab('fees')} className={`px-3 py-1.5 text-sm ${profileTab === 'fees' ? 'bg-brand-navy text-white' : 'bg-white text-brand-navy hover:bg-slate-50'}`}>Fees</button>
                <button type="button" onClick={() => setProfileTab('grades')} className={`px-3 py-1.5 text-sm ${profileTab === 'grades' ? 'bg-brand-navy text-white' : 'bg-white text-brand-navy hover:bg-slate-50'}`}>Grades</button>
                <button type="button" onClick={() => setProfileTab('attendance')} className={`px-3 py-1.5 text-sm ${profileTab === 'attendance' ? 'bg-brand-navy text-white' : 'bg-white text-brand-navy hover:bg-slate-50'}`}>Attendance</button>
              </div>
              <button
                type="button"
                onClick={() => setShowFullDetails(false)}
                className="rounded-lg border border-slate-200/80 px-3 py-1.5 text-sm font-semibold text-brand-navy hover:bg-slate-50"
                aria-label="Close full student profile"
              >
                ×
              </button>
            </div>
          </div>

          {profileError ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{profileError}</div> : null}
          {profileLoading ? <p className="text-sm text-slate-500">Loading full student profile...</p> : null}

          {!profileLoading && studentProfile && profileTab === 'personal' ? (
            <form onSubmit={handleSaveProfile} className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Admission No" value={profileForm.admissionNo} onChange={(e) => setProfileForm((prev) => ({ ...prev, admissionNo: e.target.value }))} required />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="First Name" value={profileForm.firstName} onChange={(e) => setProfileForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Last Name" value={profileForm.lastName} onChange={(e) => setProfileForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
              <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" value={profileForm.className} onChange={(e) => setProfileForm((prev) => ({ ...prev, className: e.target.value, section: '' }))} required>
                <option value="">Select Class</option>
                {allowedGrades.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>
              <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" value={profileForm.section} onChange={(e) => setProfileForm((prev) => ({ ...prev, section: e.target.value }))} required>
                <option value="">Select Section</option>
                {(gradeSettings.find((entry) => entry.grade === profileForm.className)?.sections ?? []).map((section) => (
                  <option key={section} value={section}>{section}</option>
                ))}
              </select>
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Guardian Phone" value={profileForm.guardianPhone} onChange={(e) => setProfileForm((prev) => ({ ...prev, guardianPhone: e.target.value }))} required />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" type="date" value={profileForm.dateOfBirth} onChange={(e) => setProfileForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))} required />
              <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" value={profileForm.gender} onChange={(e) => setProfileForm((prev) => ({ ...prev, gender: e.target.value }))} required>
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Samagra ID" value={profileForm.samagraId} onChange={(e) => setProfileForm((prev) => ({ ...prev, samagraId: e.target.value }))} required />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Aadhaar Number" value={profileForm.aadhaarNumber} onChange={(e) => setProfileForm((prev) => ({ ...prev, aadhaarNumber: e.target.value }))} />
              <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" value={profileForm.religion} onChange={(e) => setProfileForm((prev) => ({ ...prev, religion: e.target.value as '' | 'Hindu' | 'Muslim' | 'Christian' }))}>
                <option value="">Select Religion</option>
                <option value="Hindu">Hindu</option>
                <option value="Muslim">Muslim</option>
                <option value="Christian">Christian</option>
              </select>
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Caste (Optional)" value={profileForm.caste} onChange={(e) => setProfileForm((prev) => ({ ...prev, caste: e.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Bus Route (Optional)" value={profileForm.busRoute} onChange={(e) => setProfileForm((prev) => ({ ...prev, busRoute: e.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white md:col-span-3" placeholder="Full Address" value={profileForm.fullAddress} onChange={(e) => setProfileForm((prev) => ({ ...prev, fullAddress: e.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="City" value={profileForm.city} onChange={(e) => setProfileForm((prev) => ({ ...prev, city: e.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="State" value={profileForm.state} onChange={(e) => setProfileForm((prev) => ({ ...prev, state: e.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="PIN Code" value={profileForm.pinCode} onChange={(e) => setProfileForm((prev) => ({ ...prev, pinCode: e.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Father Name" value={profileForm.fatherName} onChange={(e) => setProfileForm((prev) => ({ ...prev, fatherName: e.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Mother Name" value={profileForm.motherName} onChange={(e) => setProfileForm((prev) => ({ ...prev, motherName: e.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Parent Phone" value={profileForm.parentPhone} onChange={(e) => setProfileForm((prev) => ({ ...prev, parentPhone: e.target.value }))} required />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Parent Email" value={profileForm.parentEmail} onChange={(e) => setProfileForm((prev) => ({ ...prev, parentEmail: e.target.value }))} required />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Student Phone" value={profileForm.studentPhone} onChange={(e) => setProfileForm((prev) => ({ ...prev, studentPhone: e.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Student Email" value={profileForm.studentEmail} onChange={(e) => setProfileForm((prev) => ({ ...prev, studentEmail: e.target.value }))} />

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 md:col-span-3">
                <p className="text-sm font-semibold text-brand-navy">Documents Upload</p>
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-sm text-slate-700">Photo
                    <input type="file" accept="image/*,.pdf" className="mt-1 block w-full text-xs" onChange={(e) => setProfileFiles((prev) => ({ ...prev, photo: e.target.files?.[0] ?? null }))} />
                    {studentProfile.personal.photoUrl ? <a className="text-xs text-brand-navy underline" href={`${apiOrigin}${studentProfile.personal.photoUrl}`} target="_blank" rel="noreferrer">Current file</a> : null}
                  </label>
                  <label className="text-sm text-slate-700">Birth Certificate
                    <input type="file" accept="image/*,.pdf" className="mt-1 block w-full text-xs" onChange={(e) => setProfileFiles((prev) => ({ ...prev, birthCertificate: e.target.files?.[0] ?? null }))} />
                    {studentProfile.personal.birthCertificateUrl ? <a className="text-xs text-brand-navy underline" href={`${apiOrigin}${studentProfile.personal.birthCertificateUrl}`} target="_blank" rel="noreferrer">Current file</a> : null}
                  </label>
                  <label className="text-sm text-slate-700">Aadhaar Card
                    <input type="file" accept="image/*,.pdf" className="mt-1 block w-full text-xs" onChange={(e) => setProfileFiles((prev) => ({ ...prev, aadhaarCard: e.target.files?.[0] ?? null }))} />
                    {studentProfile.personal.aadhaarCardUrl ? <a className="text-xs text-brand-navy underline" href={`${apiOrigin}${studentProfile.personal.aadhaarCardUrl}`} target="_blank" rel="noreferrer">Current file</a> : null}
                  </label>
                  <label className="text-sm text-slate-700">Previous Report Card (Required for Class 1+)
                    <input type="file" accept="image/*,.pdf" className="mt-1 block w-full text-xs" onChange={(e) => setProfileFiles((prev) => ({ ...prev, previousReportCard: e.target.files?.[0] ?? null }))} />
                    {studentProfile.personal.previousReportCardUrl ? <a className="text-xs text-brand-navy underline" href={`${apiOrigin}${studentProfile.personal.previousReportCardUrl}`} target="_blank" rel="noreferrer">Current file</a> : null}
                  </label>
                  <label className="text-sm text-slate-700">Transfer Certificate (Required for Class 1+)
                    <input type="file" accept="image/*,.pdf" className="mt-1 block w-full text-xs" onChange={(e) => setProfileFiles((prev) => ({ ...prev, transferCertificate: e.target.files?.[0] ?? null }))} />
                    {studentProfile.personal.transferCertificateUrl ? <a className="text-xs text-brand-navy underline" href={`${apiOrigin}${studentProfile.personal.transferCertificateUrl}`} target="_blank" rel="noreferrer">Current file</a> : null}
                  </label>
                </div>
              </div>

              <div className="md:col-span-3">
                <button type="submit" disabled={profileSaving} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-orange disabled:opacity-60">
                  {profileSaving ? 'Saving profile...' : 'Save Full Student Profile'}
                </button>
              </div>
            </form>
          ) : null}

          {!profileLoading && studentProfile && profileTab === 'fees' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" type="month" value={feesViewMonth} onChange={(event) => setFeesViewMonth(event.target.value)} />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-sky-400 bg-slate-50/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Due In Selected Month</p>
                  <p className="text-lg font-semibold text-brand-navy">{formatCurrency(selectedMonthDueTotal)}</p>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{selectedMonthDueInvoices.length} invoice(s)</p>
                </article>
                <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-amber-400 bg-slate-50/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Carry-Forward Due (Previous Months)</p>
                  <p className="text-lg font-semibold text-brand-navy">{formatCurrency(carryForwardDueTotal)}</p>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{carryForwardDueInvoices.length} invoice(s)</p>
                </article>
                <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-red-400 bg-slate-50/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Payable For Month</p>
                  <p className="text-lg font-semibold text-red-600">{formatCurrency(totalPayableForSelectedMonth)}</p>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Carry-forward + selected month due</p>
                </article>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50/80">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due Type</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payableDueInvoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-slate-100 table-row-hover">
                        <td className="px-4 py-3">{invoice.title}</td>
                        <td className="px-4 py-3 font-semibold text-brand-navy">{formatCurrency(invoice.due)}</td>
                        <td className="px-4 py-3">
                          {new Date(invoice.dueDate) < feesMonthWindow.start ? (
                            <span className="rounded-full border border-brand-orange/40 bg-brand-orange/10 px-2 py-0.5 text-xs font-semibold text-brand-navy">Carry Forward</span>
                          ) : (
                            <span className="rounded-full border border-brand-sky/40 bg-brand-sky/10 px-2 py-0.5 text-xs font-semibold text-brand-navy">Selected Month</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{invoice.status}</td>
                        <td className="px-4 py-3">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {payableDueInvoices.length === 0 ? <p className="p-3 text-sm text-slate-500">No unpaid dues for the selected month context.</p> : null}
              </div>
            </div>
          ) : null}

          {!profileLoading && studentProfile && profileTab === 'grades' ? (
            <section className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 text-sm text-slate-600">
              Grade records are not available in the current data model yet. This section is ready and will display marks/results once grade modules are added.
            </section>
          ) : null}

          {!profileLoading && studentProfile && profileTab === 'attendance' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-slate-400 bg-slate-50/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Records</p>
                  <p className="text-lg font-semibold text-brand-navy">{studentProfile.attendance.summary.total}</p>
                </article>
                <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-emerald-400 bg-slate-50/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Present</p>
                  <p className="text-lg font-semibold text-green-700">{studentProfile.attendance.summary.present}</p>
                </article>
                <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-red-400 bg-slate-50/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Absent</p>
                  <p className="text-lg font-semibold text-red-600">{studentProfile.attendance.summary.absent}</p>
                </article>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50/80">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Date</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentProfile.attendance.records.map((record) => (
                      <tr key={record.id} className="border-b border-slate-100 table-row-hover">
                        <td className="px-4 py-3">{new Date(record.date).toLocaleDateString()}</td>
                        <td className="px-4 py-3">{record.present ? 'Present' : 'Absent'}</td>
                        <td className="px-4 py-3">{record.remark || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {studentProfile.attendance.records.length === 0 ? <p className="p-3 text-sm text-slate-500">No attendance records found.</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-slate-400">Click any student row to view full details. Use × to collapse the panel and return to full-page list view.</p>
      )}
    </div>
  );
}
