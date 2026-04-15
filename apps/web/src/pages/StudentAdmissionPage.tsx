import { FormEvent, useEffect, useState } from 'react';

import {
  fetchStudentAdmissionProfile,
  StudentAdmissionProfile,
  StudentAdmissionSubmission,
  submitStudentAdmissionForm
} from '../lib/api';

interface StudentAdmissionPageProps {
  portalLabel: string;
}

function isClassOneOrAbove(className?: string) {
  const match = className?.match(/(\d+)/);
  const classNumber = match ? Number.parseInt(match[1], 10) : Number.NaN;
  return Number.isFinite(classNumber) && classNumber >= 1;
}

export function StudentAdmissionPage({ portalLabel }: StudentAdmissionPageProps) {
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [existingProfile, setExistingProfile] = useState<StudentAdmissionProfile | null>(null);

  const [form, setForm] = useState<StudentAdmissionSubmission>({
    fullName: '',
    dateOfBirth: '',
    gender: '',
    samagraId: '',
    aadhaarNumber: '',
    caste: '',
    religion: '',
    busRoute: '',
    fullAddress: '',
    city: '',
    state: '',
    pinCode: '',
    fatherName: '',
    motherName: '',
    phoneNumber: '',
    email: '',
    studentPhoneNumber: '',
    studentEmail: '',
    photo: null,
    birthCertificate: null,
    aadhaarCard: null,
    previousReportCard: null,
    transferCertificate: null
  });

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const profile = await fetchStudentAdmissionProfile();
        setExistingProfile(profile);
        setIsEditing(!profile.profileSubmittedAt);
        setForm((prev) => ({
          ...prev,
          fullName: profile.fullName,
          dateOfBirth: profile.dateOfBirth,
          gender: profile.gender,
          samagraId: profile.samagraId,
          aadhaarNumber: profile.aadhaarNumber,
          caste: profile.caste,
          religion: profile.religion,
          busRoute: profile.busRoute,
          fullAddress: profile.fullAddress,
          city: profile.city,
          state: profile.state,
          pinCode: profile.pinCode,
          fatherName: profile.fatherName,
          motherName: profile.motherName,
          phoneNumber: profile.phoneNumber,
          email: profile.email,
          studentPhoneNumber: profile.studentPhoneNumber,
          studentEmail: profile.studentEmail
        }));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load form');
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  function validateForm() {
    if (!form.fullName.trim()) return 'Full Name is required.';
    if (!form.gender) return 'Gender is required.';
    if (!form.dateOfBirth) return 'Date of Birth is required.';
    if (!form.samagraId?.trim()) return 'Samagra ID is required.';
    if (!form.fatherName?.trim() && !form.motherName?.trim()) return 'At least one parent name is required (Father or Mother).';
    if (!form.phoneNumber?.trim()) return 'Phone Number is required.';
    if (!form.email?.trim()) return 'Email is required.';
    if (!form.fullAddress?.trim()) return 'Full Address is required.';
    if (!form.city?.trim()) return 'City is required.';
    if (!form.state?.trim()) return 'State is required.';
    if (!/^\d{6}$/.test(form.pinCode ?? '')) return 'PIN Code must be 6 digits.';
    if (!existingProfile?.birthCertificateUrl && !form.birthCertificate) return 'Birth Certificate upload is required.';
    if (!existingProfile?.photoUrl && !form.photo) return 'Photo upload is required.';
    if (isClassOneOrAbove(existingProfile?.className)) {
      if (!existingProfile?.previousReportCardUrl && !form.previousReportCard) return 'Previous Report Card upload is required for class 1 and above.';
      if (!existingProfile?.transferCertificateUrl && !form.transferCertificate) return 'Transfer Certificate upload is required for class 1 and above.';
    }
    return null;
  }

  function resetFormFromProfile(profile: StudentAdmissionProfile) {
    setForm((prev) => ({
      ...prev,
      fullName: profile.fullName,
      dateOfBirth: profile.dateOfBirth,
      gender: profile.gender,
      samagraId: profile.samagraId,
      aadhaarNumber: profile.aadhaarNumber,
      caste: profile.caste,
      religion: profile.religion,
      busRoute: profile.busRoute,
      fullAddress: profile.fullAddress,
      city: profile.city,
      state: profile.state,
      pinCode: profile.pinCode,
      fatherName: profile.fatherName,
      motherName: profile.motherName,
      phoneNumber: profile.phoneNumber,
      email: profile.email,
      studentPhoneNumber: profile.studentPhoneNumber,
      studentEmail: profile.studentEmail,
      photo: null,
      birthCertificate: null,
      aadhaarCard: null,
      previousReportCard: null,
      transferCertificate: null
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const result = await submitStudentAdmissionForm(form);
      setMessage(result.message);
      const refreshed = await fetchStudentAdmissionProfile();
      setExistingProfile(refreshed);
      resetFormFromProfile(refreshed);
      setIsEditing(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <svg className="h-8 w-8 animate-spin text-brand-navy" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="ml-3 text-sm text-slate-500">Loading admission form…</span>
    </div>
  );

  const apiOrigin = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api').replace('/api', '');
  const requiresHigherClassDocs = isClassOneOrAbove(existingProfile?.className);

  if (!isEditing && existingProfile) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-brand-navy">{portalLabel}: Profile</h2>
            <p className="mt-1 text-sm text-slate-500">View and manage your admission profile details</p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetFormFromProfile(existingProfile);
              setIsEditing(true);
              setError(null);
              setMessage(null);
            }}
            className="rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90"
          >
            Edit Profile
          </button>
        </div>

        {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200/80 bg-white p-6 text-sm shadow-card md:grid-cols-2">
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Full Name</span><p className="mt-1 text-slate-700">{existingProfile.fullName || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Date of Birth</span><p className="mt-1 text-slate-700">{existingProfile.dateOfBirth ? new Date(existingProfile.dateOfBirth).toLocaleDateString() : '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gender</span><p className="mt-1 text-slate-700">{existingProfile.gender || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Class / Section</span><p className="mt-1 text-slate-700">{existingProfile.className || '-'} / {existingProfile.section || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Samagra ID</span><p className="mt-1 text-slate-700">{existingProfile.samagraId || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Aadhaar Number</span><p className="mt-1 text-slate-700">{existingProfile.aadhaarNumber || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Caste</span><p className="mt-1 text-slate-700">{existingProfile.caste || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Religion</span><p className="mt-1 text-slate-700">{existingProfile.religion || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bus Route</span><p className="mt-1 text-slate-700">{existingProfile.busRoute || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Student Phone</span><p className="mt-1 text-slate-700">{existingProfile.studentPhoneNumber || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Student Email</span><p className="mt-1 text-slate-700">{existingProfile.studentEmail || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Parent Phone</span><p className="mt-1 text-slate-700">{existingProfile.phoneNumber || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Parent Email</span><p className="mt-1 text-slate-700">{existingProfile.email || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Father Name</span><p className="mt-1 text-slate-700">{existingProfile.fatherName || '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Mother Name</span><p className="mt-1 text-slate-700">{existingProfile.motherName || '-'}</p></div>
          <div className="md:col-span-2"><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Address</span><p className="mt-1 text-slate-700">{existingProfile.fullAddress || '-'}{existingProfile.city ? `, ${existingProfile.city}` : ''}{existingProfile.state ? `, ${existingProfile.state}` : ''}{existingProfile.pinCode ? ` - ${existingProfile.pinCode}` : ''}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Photo</span><p className="mt-1 text-slate-700">{existingProfile.photoUrl ? <a className="text-brand-navy underline" href={`${apiOrigin}${existingProfile.photoUrl}`} target="_blank" rel="noreferrer">View</a> : '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Birth Certificate</span><p className="mt-1 text-slate-700">{existingProfile.birthCertificateUrl ? <a className="text-brand-navy underline" href={`${apiOrigin}${existingProfile.birthCertificateUrl}`} target="_blank" rel="noreferrer">View</a> : '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Aadhaar Card</span><p className="mt-1 text-slate-700">{existingProfile.aadhaarCardUrl ? <a className="text-brand-navy underline" href={`${apiOrigin}${existingProfile.aadhaarCardUrl}`} target="_blank" rel="noreferrer">View</a> : '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Previous Report Card</span><p className="mt-1 text-slate-700">{existingProfile.previousReportCardUrl ? <a className="text-brand-navy underline" href={`${apiOrigin}${existingProfile.previousReportCardUrl}`} target="_blank" rel="noreferrer">View</a> : '-'}</p></div>
          <div><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Transfer Certificate</span><p className="mt-1 text-slate-700">{existingProfile.transferCertificateUrl ? <a className="text-brand-navy underline" href={`${apiOrigin}${existingProfile.transferCertificateUrl}`} target="_blank" rel="noreferrer">View</a> : '-'}</p></div>
        </section>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">{portalLabel}: Profile</h2>
        <p className="mt-1 text-sm text-slate-500">
          Fill student/parent details only. Admission number, class, and roll number are assigned by admin after submission.
        </p>
      </div>

      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200/80 bg-white p-6 shadow-card">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-navy">Personal Information</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Full Name" value={form.fullName} onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))} required />
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" type="date" value={form.dateOfBirth} onChange={(e) => setForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))} required />
            <select className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" value={form.gender} onChange={(e) => setForm((prev) => ({ ...prev, gender: e.target.value }))} required>
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Samagra ID" value={form.samagraId} onChange={(e) => setForm((prev) => ({ ...prev, samagraId: e.target.value }))} required />
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Aadhaar Number (optional)" value={form.aadhaarNumber} onChange={(e) => setForm((prev) => ({ ...prev, aadhaarNumber: e.target.value }))} />
            <select className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" value={form.religion} onChange={(e) => setForm((prev) => ({ ...prev, religion: e.target.value as StudentAdmissionSubmission['religion'] }))}>
              <option value="">Religion (optional)</option>
              <option value="Hindu">Hindu</option>
              <option value="Muslim">Muslim</option>
              <option value="Christian">Christian</option>
            </select>
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Caste (optional)" value={form.caste} onChange={(e) => setForm((prev) => ({ ...prev, caste: e.target.value }))} />
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Bus Route (optional)" value={form.busRoute} onChange={(e) => setForm((prev) => ({ ...prev, busRoute: e.target.value }))} />
          </div>
        </div>

        <hr className="border-slate-200" />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-navy">Parent / Guardian Details</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Father Name" value={form.fatherName} onChange={(e) => setForm((prev) => ({ ...prev, fatherName: e.target.value }))} />
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Mother Name" value={form.motherName} onChange={(e) => setForm((prev) => ({ ...prev, motherName: e.target.value }))} />
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Parent Phone Number" value={form.phoneNumber} onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))} required />
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" type="email" placeholder="Parent Email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Student Phone Number (optional)" value={form.studentPhoneNumber} onChange={(e) => setForm((prev) => ({ ...prev, studentPhoneNumber: e.target.value }))} />
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="Student Email (optional)" value={form.studentEmail} onChange={(e) => setForm((prev) => ({ ...prev, studentEmail: e.target.value }))} />
          </div>
        </div>

        <hr className="border-slate-200" />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-navy">Address</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white md:col-span-2" placeholder="Full Address" value={form.fullAddress} onChange={(e) => setForm((prev) => ({ ...prev, fullAddress: e.target.value }))} required />
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="City" value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} required />
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="State" value={form.state} onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))} required />
            <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" placeholder="PIN Code" value={form.pinCode} onChange={(e) => setForm((prev) => ({ ...prev, pinCode: e.target.value }))} required />
          </div>
        </div>

        <hr className="border-slate-200" />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand-navy">Document Uploads</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Photo Upload</label>
              <input className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" type="file" accept="image/*" onChange={(e) => setForm((prev) => ({ ...prev, photo: e.target.files?.[0] ?? null }))} />
              {existingProfile?.photoUrl ? <p className="mt-1 text-xs text-slate-500">Existing photo uploaded.</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Birth Certificate Upload</label>
              <input className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" type="file" accept=".pdf,image/*" onChange={(e) => setForm((prev) => ({ ...prev, birthCertificate: e.target.files?.[0] ?? null }))} />
              {existingProfile?.birthCertificateUrl ? <p className="mt-1 text-xs text-slate-500">Existing birth certificate uploaded.</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Aadhaar Card Upload (optional)</label>
              <input className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" type="file" accept=".pdf,image/*" onChange={(e) => setForm((prev) => ({ ...prev, aadhaarCard: e.target.files?.[0] ?? null }))} />
              {existingProfile?.aadhaarCardUrl ? <p className="mt-1 text-xs text-slate-500">Existing Aadhaar card uploaded.</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Previous Report Card ({requiresHigherClassDocs ? 'required for class 1+' : 'optional'})</label>
              <input className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" type="file" accept=".pdf,image/*" onChange={(e) => setForm((prev) => ({ ...prev, previousReportCard: e.target.files?.[0] ?? null }))} />
              {existingProfile?.previousReportCardUrl ? <p className="mt-1 text-xs text-slate-500">Existing report card uploaded.</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Transfer Certificate ({requiresHigherClassDocs ? 'required for class 1+' : 'optional'})</label>
              <input className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 transition-colors focus:border-brand-sky focus:bg-white" type="file" accept=".pdf,image/*" onChange={(e) => setForm((prev) => ({ ...prev, transferCertificate: e.target.files?.[0] ?? null }))} />
              {existingProfile?.transferCertificateUrl ? <p className="mt-1 text-xs text-slate-500">Existing transfer certificate uploaded.</p> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          {existingProfile?.profileSubmittedAt ? (
            <button
              type="button"
              onClick={() => {
                if (existingProfile) {
                  resetFormFromProfile(existingProfile);
                }
                setIsEditing(false);
                setError(null);
              }}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700"
            >
              Cancel
            </button>
          ) : null}
          <button type="submit" disabled={submitting} className="rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60">
            {submitting ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                Saving…
              </span>
            ) : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
