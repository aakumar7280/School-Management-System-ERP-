import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { DashboardActivity, DashboardSummary, fetchDashboardActivity, fetchDashboardSummary } from '../lib/api';

const adminModules = [
  {
    title: 'Staff Management',
    description: 'Manage teachers and staff profiles, status, and assignments.',
    to: '/admin/staff',
    cta: 'Open Staff',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    color: 'text-purple-600 bg-purple-50'
  },
  {
    title: 'Fees & Finance',
    description: 'Track invoices, payment collection, and outstanding balances.',
    to: '/admin/finance/dashboard',
    cta: 'Open Finance',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'text-emerald-600 bg-emerald-50'
  },
  {
    title: 'Student Management',
    description: 'Handle student records, classes, and lifecycle operations.',
    to: '/admin/students',
    cta: 'Open Students',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0121 12.765M12 14l-6.16-3.422A12.083 12.083 0 003 12.765M12 14v7" />
      </svg>
    ),
    color: 'text-brand-sky bg-sky-50'
  },
  {
    title: 'Classes',
    description: 'View class-wise students, teachers and attendance snapshots.',
    to: '/admin/classes',
    cta: 'Open Classes',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    color: 'text-amber-600 bg-amber-50'
  }
];

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<DashboardActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchDashboardSummary(), fetchDashboardActivity()])
      .then(([summaryData, activityData]) => {
        setSummary(summaryData);
        setActivity(activityData);
      })
      .catch((requestError: Error) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    if (!summary) {
      return [
        { label: 'Total Students', value: '--' },
        { label: 'Total Teachers', value: '--' }
      ];
    }

    return [
      { label: 'Total Students', value: String(summary.totalStudents) },
      { label: 'Total Teachers', value: String(summary.totalTeachers) }
    ];
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-navy to-brand-navy/80 p-6 shadow-md">
        <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
        <p className="mt-1 text-sm text-white/70">Live overview of students, staff, and fee collection.</p>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading dashboard...</p> : null}
      {error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          <span className="font-medium">Error:</span> {error}
        </div>
      ) : null}

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {stats.map((item, index) => (
          <article key={item.label} className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:shadow-card-hover">
            <div className={`absolute left-0 top-0 h-full w-1 ${index === 0 ? 'bg-brand-sky' : 'bg-brand-orange'}`} />
            <p className="text-sm font-medium text-slate-500">{item.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{item.value}</p>
          </article>
        ))}
      </div>

      {/* Admin modules grid */}
      <section>
        <h3 className="mb-4 text-lg font-semibold text-slate-800">Quick Access</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {adminModules.map((module) => (
            <Link
              key={module.title}
              to={module.to}
              className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:shadow-card-hover hover:border-slate-300/80"
            >
              <div className={`mb-3 inline-flex rounded-xl p-2.5 ${module.color}`}>
                {module.icon}
              </div>
              <h4 className="font-semibold text-slate-800 group-hover:text-brand-navy">{module.title}</h4>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{module.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-navy">
                {module.cta}
                <svg className="h-3 w-3 transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
        <h3 className="text-lg font-semibold text-slate-800">Recent Activity</h3>
        {activity.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No recent activities found.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {activity.map((item, index) => (
              <li key={`${item.type}-${item.date}-${index}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-sky/10 text-brand-sky">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700">{item.message}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{item.date}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
