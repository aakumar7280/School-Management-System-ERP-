import { useEffect, useState } from 'react';

import { FinanceSectionNav } from '../components/FinanceSectionNav';
import { fetchFinanceOverview, FinanceOverview } from '../lib/api';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export function FinanceSalariesPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOverview() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchFinanceOverview(month);
        setData(response);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load salaries data');
      } finally {
        setLoading(false);
      }
    }

    loadOverview();
  }, [month]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Finance</h2>
          <p className="mt-1 text-sm text-slate-500">Teacher salary overview &amp; pending payments</p>
        </div>
        <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
      </div>

      <FinanceSectionNav />
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-xl border border-slate-200/80 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-brand-navy">Salary Details</h3>
        </div>
        {loading ? <div className="flex items-center gap-2 px-5 py-4 text-sm text-slate-500"><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Loading salaries...</div> : null}

        <div className="p-5 space-y-6">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Salaries Sent
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200/80">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Teacher</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Login ID</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Class</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Amount</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Month</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.salariesSent ?? []).map((salary) => (
                    <tr key={salary.id} className="border-b border-slate-100 table-row-hover">
                      <td className="px-4 py-3 font-medium text-slate-700">{salary.teacher.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{salary.teacher.loginId}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-brand-navy/10 px-2.5 py-0.5 text-xs font-medium text-brand-navy">{salary.teacher.assignedClass ?? '-'} / {salary.teacher.assignedSection ?? '-'}</span></td>
                      <td className="px-4 py-3 font-semibold text-emerald-600">{formatCurrency(salary.amount)}</td>
                      <td className="px-4 py-3 text-slate-500">{salary.month}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(data?.salariesSent.length ?? 0) === 0 ? <p className="px-5 py-6 text-center text-sm text-slate-400">No salaries sent for this month.</p> : null}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Pending Salaries
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200/80">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Teacher</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Login ID</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Assigned Class</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.pendingSalaries ?? []).map((teacher) => (
                    <tr key={teacher.id} className="border-b border-slate-100 table-row-hover">
                      <td className="px-4 py-3 font-medium text-slate-700">{teacher.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{teacher.loginId}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">{teacher.assignedClass ?? '-'} / {teacher.assignedSection ?? '-'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(data?.pendingSalaries.length ?? 0) === 0 ? <p className="px-5 py-6 text-center text-sm text-slate-400">No pending salaries for this month.</p> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
