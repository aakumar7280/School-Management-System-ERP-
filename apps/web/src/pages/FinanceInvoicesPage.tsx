import { useEffect, useMemo, useState } from 'react';

import { FinanceSectionNav } from '../components/FinanceSectionNav';
import {
  FeeInvoiceListItem,
  fetchFeeInvoices
} from '../lib/api';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export function FinanceInvoicesPage() {
  const [invoices, setInvoices] = useState<FeeInvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const studentOptions = useMemo(() => {
    const map = new Map<string, string>();

    invoices.forEach((invoice) => {
      map.set(invoice.student.admissionNo, `${invoice.student.admissionNo} - ${invoice.student.firstName} ${invoice.student.lastName}`);
    });

    return Array.from(map.entries()).map(([admissionNo, label]) => ({ admissionNo, label }));
  }, [invoices]);

  const [selectedAdmissionNo, setSelectedAdmissionNo] = useState('all');

  const filteredInvoices = useMemo(() => {
    if (selectedAdmissionNo === 'all') return invoices;
    return invoices.filter((invoice) => invoice.student.admissionNo === selectedAdmissionNo);
  }, [invoices, selectedAdmissionNo]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const invoicesResponse = await fetchFeeInvoices();
      setInvoices(invoicesResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">Finance</h2>
          <p className="mt-1 text-sm text-slate-500">Invoice records for all students</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
            value={selectedAdmissionNo}
            onChange={(event) => setSelectedAdmissionNo(event.target.value)}
          >
            <option value="all">All Students</option>
            {studentOptions.map((option) => (
              <option key={option.admissionNo} value={option.admissionNo}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <FinanceSectionNav />

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-brand-navy">All Student Invoices</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">Latest 50</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Created</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Admission No</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Student</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Amount</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Paid</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due Date</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => {
                const due = Math.max(invoice.amount - invoice.paidAmount, 0);
                return (
                  <tr key={invoice.id} className="border-b border-slate-100 table-row-hover">
                    <td className="px-4 py-3 text-slate-500">{new Date(invoice.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-mono text-xs">{invoice.student.admissionNo}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{invoice.student.firstName} {invoice.student.lastName}</td>
                    <td className="px-4 py-3">{invoice.title}</td>
                    <td className="px-4 py-3">{formatCurrency(invoice.amount)}</td>
                    <td className="px-4 py-3 text-emerald-600">{formatCurrency(invoice.paidAmount)}</td>
                    <td className="px-4 py-3 font-semibold text-brand-navy">{formatCurrency(due)}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        invoice.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
                        invoice.status === 'PARTIAL' ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-600'
                      }`}>{invoice.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filteredInvoices.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">No invoices found.</p> : null}
        </div>
      </section>
    </div>
  );
}
