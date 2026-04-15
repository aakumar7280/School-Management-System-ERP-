import { useEffect, useState } from 'react';

import { fetchStudentAdmissionProfile, StudentAdmissionProfile } from '../lib/api';

interface StudentDashboardPageProps {
  portalLabel: string;
}

export function StudentDashboardPage({ portalLabel }: StudentDashboardPageProps) {
  const [profile, setProfile] = useState<StudentAdmissionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const profileData = await fetchStudentAdmissionProfile();
        setProfile(profileData);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load student dashboard');
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-500"><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Loading dashboard...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">{portalLabel}: Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">Overview of your academic information</p>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-brand-sky">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assigned Class</p>
              <p className="mt-1 text-xl font-bold text-brand-navy">
                {profile?.className ? `Class ${profile.className}` : 'Not assigned'}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Section</p>
              <p className="mt-1 text-xl font-bold text-brand-navy">{profile?.section || 'Not assigned'}</p>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Timetable</p>
              <p className="mt-1 text-sm text-slate-500">Coming soon to this dashboard.</p>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
