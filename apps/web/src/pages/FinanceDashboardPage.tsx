import { useEffect, useMemo, useState } from 'react';

import { FinanceSectionNav } from '../components/FinanceSectionNav';
import { fetchFinanceOverview, FinanceOverview } from '../lib/api';

const CHART_COLORS = {
  fees: {
    'Fees Due': '#ef4444',
    'Fees Collected': '#22c55e'
  },
  salaries: {
    'Salaries Due': '#ef4444',
    'Salaries Processed': '#22c55e'
  },
  revenue: {
    UPI: '#1b4d9b',
    Cash: '#f97316'
  }
} as const;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function PieChart({
  data,
  colorMap,
  valueFormatter
}: {
  data: { label: string; value: number }[];
  colorMap: Record<string, string>;
  valueFormatter?: (value: number) => string;
}) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0) {
    return <p className="text-sm text-slate-500">No finance data available for this month.</p>;
  }

  const nonZeroSlices = data.filter((slice) => slice.value > 0);

  if (nonZeroSlices.length === 1) {
    const onlySlice = nonZeroSlices[0];
    const color = colorMap[onlySlice.label] ?? '#1b4d9b';

    return (
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <svg viewBox="0 0 200 200" className="h-52 w-52">
          <circle cx="100" cy="100" r="70" fill={color} />
          <circle cx="100" cy="100" r="35" fill="white" />
        </svg>

        <div className="space-y-2">
          {data.map((slice) => {
            const percent = total > 0 ? (slice.value / total) * 100 : 0;
            return (
              <div key={slice.label} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: colorMap[slice.label] ?? '#1b4d9b' }} />
                <span>{slice.label}</span>
                <span className="font-semibold text-brand-navy">{valueFormatter ? valueFormatter(slice.value) : formatCurrency(slice.value)}</span>
                <span className="text-slate-500">({percent.toFixed(1)}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  let cumulative = 0;
  const slices = data.map((slice, index) => {
    const startAngle = (cumulative / total) * 360;
    cumulative += slice.value;
    const endAngle = (cumulative / total) * 360;
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    const start = {
      x: 100 + 70 * Math.cos((Math.PI * (startAngle - 90)) / 180),
      y: 100 + 70 * Math.sin((Math.PI * (startAngle - 90)) / 180)
    };

    const end = {
      x: 100 + 70 * Math.cos((Math.PI * (endAngle - 90)) / 180),
      y: 100 + 70 * Math.sin((Math.PI * (endAngle - 90)) / 180)
    };

    return {
      ...slice,
      path: `M 100 100 L ${start.x} ${start.y} A 70 70 0 ${largeArc} 1 ${end.x} ${end.y} Z`,
      color: colorMap[slice.label] ?? ['#1b4d9b', '#f97316', '#0ea5e9'][index % 3],
      percent: (slice.value / total) * 100
    };
  });

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center">
      <svg viewBox="0 0 200 200" className="h-52 w-52">
        {slices.map((slice) => (
          <path key={slice.label} d={slice.path} fill={slice.color} />
        ))}
        <circle cx="100" cy="100" r="35" fill="white" />
      </svg>

      <div className="space-y-2">
        {slices.map((slice) => (
          <div key={slice.label} className="flex items-center gap-2 text-sm text-slate-700">
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: slice.color }} />
            <span>{slice.label}</span>
            <span className="font-semibold text-brand-navy">{valueFormatter ? valueFormatter(slice.value) : formatCurrency(slice.value)}</span>
            <span className="text-slate-500">({slice.percent.toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinanceDashboardPage() {
  const [view, setView] = useState<'month' | 'year'>('month');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOverview() {
      setLoading(true);
      setError(null);
      try {
        const response =
          view === 'year'
            ? await fetchFinanceOverview({ view: 'year', year })
            : await fetchFinanceOverview({ view: 'month', month });
        setData(response);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load finance dashboard');
      } finally {
        setLoading(false);
      }
    }

    loadOverview();
  }, [view, month, year]);

  const summary = useMemo(() => data?.summary, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Finance</h2>
          <p className="mt-0.5 text-sm text-slate-500">Overview of fees, salaries, and revenue.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setView('month')}
              className={`px-3.5 py-2 text-sm font-medium transition ${view === 'month' ? 'bg-brand-navy text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setView('year')}
              className={`px-3.5 py-2 text-sm font-medium transition ${view === 'year' ? 'bg-brand-navy text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Whole Year
            </button>
          </div>

          {view === 'month' ? (
            <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand-sky focus:bg-white" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          ) : (
            <input
              className="w-28 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-brand-sky focus:bg-white"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => setYear(event.target.value.slice(0, 4))}
            />
          )}
        </div>
      </div>

      <FinanceSectionNav />
      {error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          <span className="font-medium">Error:</span> {error}
        </div>
      ) : null}

      {/* Charts row */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Fees</h3>
          {loading || !data ? <p className="text-sm text-slate-400">Loading fees chart...</p> : <PieChart data={data.feesChart} colorMap={CHART_COLORS.fees} />}
        </article>

        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Salaries</h3>
          {loading || !data ? <p className="text-sm text-slate-400">Loading salaries chart...</p> : <PieChart data={data.salariesChart} colorMap={CHART_COLORS.salaries} valueFormatter={(value) => value.toString()} />}
        </article>

        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Revenue by Mode</h3>
          {loading || !data ? <p className="text-sm text-slate-400">Loading revenue chart...</p> : <PieChart data={data.revenueChart} colorMap={CHART_COLORS.revenue} />}
        </article>
      </section>

      {/* Summary cards */}
      {summary ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <article className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
            <div className="absolute left-0 top-0 h-full w-1 bg-emerald-500" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fees Collected</p>
            <p className="mt-2 text-xl font-bold text-slate-800">{formatCurrency(summary.totalCollected)}</p>
          </article>
          <article className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
            <div className="absolute left-0 top-0 h-full w-1 bg-red-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fees Due</p>
            <p className="mt-2 text-xl font-bold text-slate-800">{formatCurrency(summary.totalDue)}</p>
          </article>
          <article className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
            <div className="absolute left-0 top-0 h-full w-1 bg-brand-sky" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Salaries Sent</p>
            <p className="mt-2 text-xl font-bold text-slate-800">{formatCurrency(summary.salaryPaid)}</p>
          </article>
          <article className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
            <div className="absolute left-0 top-0 h-full w-1 bg-amber-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending Salaries</p>
            <p className="mt-2 text-xl font-bold text-slate-800">{summary.pendingSalariesCount}</p>
          </article>
        </section>
      ) : null}
    </div>
  );
}
