import { useEffect, useMemo, useState } from 'react';

import { FinanceSectionNav } from '../components/FinanceSectionNav';
import { fetchFinanceDuesReport, FinanceDuesReport } from '../lib/api';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export function FinanceDuesPage() {
  const [report, setReport] = useState<FinanceDuesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  useEffect(() => {
    async function loadReport() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchFinanceDuesReport();
        setReport(response);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load dues report');
      } finally {
        setLoading(false);
      }
    }

    loadReport();
  }, []);

  const classOptions = useMemo(() => {
    const options = new Set<string>();
    (report?.rows ?? []).forEach((row) => {
      options.add(`${row.className}/${row.section}`);
    });
    return Array.from(options).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  }, [report?.rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return (report?.rows ?? []).filter((row) => {
      if (classFilter !== 'all' && `${row.className}/${row.section}` !== classFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchable = `${row.admissionNo} ${row.studentName} ${row.className} ${row.section}`.toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [classFilter, query, report?.rows]);

  const filteredTotals = useMemo(
    () =>
      filteredRows.reduce(
        (sum, row) => ({
          totalFeesSummary: sum.totalFeesSummary + row.totalFeesSummary,
          invoiceGeneratedAmount: sum.invoiceGeneratedAmount + row.invoiceGeneratedAmount,
          invoicePaidAmount: sum.invoicePaidAmount + row.invoicePaidAmount,
          totalPending: sum.totalPending + row.totalPending
        }),
        {
          totalFeesSummary: 0,
          invoiceGeneratedAmount: 0,
          invoicePaidAmount: 0,
          totalPending: 0
        }
      ),
    [filteredRows]
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Finance</h2>
          <p className="mt-1 text-sm text-slate-500">Student-wise dues and billing summary</p>
        </div>
      </div>

      <FinanceSectionNav />

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Fees Summary</p>
          <p className="mt-2 text-xl font-bold text-brand-navy">{formatCurrency(filteredTotals.totalFeesSummary)}</p>
        </article>
        <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice Generated</p>
          <p className="mt-2 text-xl font-bold text-brand-navy">{formatCurrency(filteredTotals.invoiceGeneratedAmount)}</p>
        </article>
        <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice Paid</p>
          <p className="mt-2 text-xl font-bold text-emerald-700">{formatCurrency(filteredTotals.invoicePaidAmount)}</p>
        </article>
        <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Pending</p>
          <p className="mt-2 text-xl font-bold text-red-600">{formatCurrency(filteredTotals.totalPending)}</p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="font-semibold text-brand-navy">Student Dues Report</h3>
            <p className="mt-1 text-sm text-slate-500">All students with fee structure totals, invoice totals, and pending balances.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search student or admission no"
              className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
            />
            <select
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
            >
              <option value="all">All Classes</option>
              {classOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Admission No</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Student Name</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Class</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Total Fees</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice Generated</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice Paid</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Total Pending</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.studentId} className="border-b border-slate-100 table-row-hover">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.admissionNo}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{row.studentName}</td>
                  <td className="px-4 py-3 text-slate-600">{row.className} / {row.section}</td>
                  <td className="px-4 py-3 text-brand-navy">{formatCurrency(row.totalFeesSummary)}</td>
                  <td className="px-4 py-3 text-brand-navy">{formatCurrency(row.invoiceGeneratedAmount)}</td>
                  <td className="px-4 py-3 text-emerald-700">{formatCurrency(row.invoicePaidAmount)}</td>
                  <td className="px-4 py-3 font-semibold text-red-600">{formatCurrency(row.totalPending)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${row.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {row.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredRows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">No dues report rows found.</p> : null}
          {loading ? <p className="px-5 py-8 text-center text-sm text-slate-400">Loading dues report...</p> : null}
        </div>
      </section>
    </div>
  );
}
