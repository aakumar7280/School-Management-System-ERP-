import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  ClassOverview,
  DashboardActivity,
  DashboardSummary,
  FinanceOverview,
  fetchClassesOverview,
  fetchDashboardActivity,
  fetchDashboardSummary,
  fetchFinanceOverview
} from '../lib/api';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

const quickLinks = [
  { title: 'Add Student', to: '/admin/students' },
  { title: 'Add Teacher', to: '/admin/staff' },
  { title: 'Collect Fee', to: '/admin/finance/fees' },
  { title: 'Attendance', to: '/admin/classes' },
  { title: 'Exam Schedule', to: '/admin/classes' },
  { title: 'Reports', to: '/admin/finance/dashboard' }
];

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<DashboardActivity[]>([]);
  const [classes, setClasses] = useState<ClassOverview[]>([]);
  const [finance, setFinance] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchDashboardSummary(), fetchDashboardActivity(), fetchClassesOverview(), fetchFinanceOverview()])
      .then(([summaryData, activityData, classData, financeData]) => {
        setSummary(summaryData);
        setActivity(activityData);
        setClasses(classData);
        setFinance(financeData);
      })
      .catch((requestError: Error) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const totalClasses = useMemo(() => {
    const classSectionPairs = new Set(classes.map((entry) => `${entry.className}-${entry.section}`));
    return classSectionPairs.size;
  }, [classes]);

  const classBandData = useMemo(() => {
    const grouped = {
      KG: 0,
      Primary: 0,
      Middle: 0,
      'High School': 0,
      'Higher Sec.': 0
    };

    classes.forEach((entry) => {
      const normalized = entry.className.replace(/\s+/g, '').toUpperCase();
      const numericClass = Number.parseInt(entry.className.match(/\d+/)?.[0] ?? '', 10);

      if (['PLAY', 'PLAYGROUP', 'NURSERY', 'KG1', 'KG2', 'LKG', 'UKG'].includes(normalized)) {
        grouped.KG += entry.studentCount;
      } else if (Number.isFinite(numericClass) && numericClass <= 5) {
        grouped.Primary += entry.studentCount;
      } else if (Number.isFinite(numericClass) && numericClass <= 8) {
        grouped.Middle += entry.studentCount;
      } else if (Number.isFinite(numericClass) && numericClass <= 10) {
        grouped['High School'] += entry.studentCount;
      } else {
        grouped['Higher Sec.'] += entry.studentCount;
      }
    });

    return [
      { label: 'KG', value: grouped.KG, color: '#a855f7' },
      { label: 'Primary', value: grouped.Primary, color: '#8b5cf6' },
      { label: 'Middle', value: grouped.Middle, color: '#6366f1' },
      { label: 'High School', value: grouped['High School'], color: '#4f46e5' },
      { label: 'Higher Sec.', value: grouped['Higher Sec.'], color: '#3b82f6' }
    ];
  }, [classes]);

  const maxClassBand = useMemo(() => Math.max(1, ...classBandData.map((item) => item.value)), [classBandData]);
  const feeTarget = Math.max(finance?.summary.totalBilled ?? 0, 1);
  const feeCollected = finance?.summary.totalCollected ?? 0;
  const feeProgress = Math.min(Math.round((feeCollected / feeTarget) * 100), 100);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl font-bold text-slate-900">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">Key insights at a glance</p>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading dashboard...</p> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}

      <section className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Students</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{summary?.totalStudents ?? '--'}</p>
        </article>
        <article className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Teachers</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{summary?.totalTeachers ?? '--'}</p>
        </article>
        <article className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Classes</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{totalClasses}</p>
        </article>
        <article className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pending Fees</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{formatCurrency(finance?.summary.totalDue ?? 0)}</p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h3 className="text-base font-semibold text-slate-800">Fee Collection <span className="text-slate-400">(This Month)</span></h3>
          <p className="mt-4 text-4xl font-bold text-slate-900">{formatCurrency(feeCollected)}</p>
          <p className="mt-1 text-sm text-slate-500">of {formatCurrency(feeTarget)}</p>
          <div className="mt-5 h-2.5 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${feeProgress}%` }} />
          </div>
          <p className="mt-2 text-right text-sm font-semibold text-slate-600">{feeProgress}%</p>
        </article>

        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h3 className="text-base font-semibold text-slate-800">Students Overview</h3>
          <div className="mt-4 flex h-44 items-end gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            {classBandData.map((item) => (
              <div key={item.label} className="flex min-w-[52px] flex-1 flex-col items-center justify-end gap-1.5">
                <div className="w-full rounded-md" style={{ height: `${Math.max(10, Math.round((item.value / maxClassBand) * 130))}px`, backgroundColor: item.color }} />
                <p className="text-[11px] font-medium text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Quick Links</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {quickLinks.map((link) => (
              <Link
                key={link.title}
                to={link.to}
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-sm font-semibold text-slate-700 hover:bg-white hover:text-brand-navy"
              >
                {link.title}
              </Link>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Recent Activities</h3>
            <span className="text-xs font-semibold text-slate-400">View All</span>
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-slate-500">No recent activities found.</p>
          ) : (
            <ul className="space-y-2">
              {activity.slice(0, 5).map((item, index) => (
                <li key={`${item.type}-${item.date}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50/40 px-3 py-2.5">
                  <p className="text-sm text-slate-700">{item.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{item.date}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
