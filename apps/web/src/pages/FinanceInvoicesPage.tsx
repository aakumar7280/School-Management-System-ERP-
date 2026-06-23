import { useEffect, useMemo, useState } from 'react';

import { FinanceSectionNav } from '../components/FinanceSectionNav';
import {
  deleteFeeInvoiceAsAdmin,
  FeeInvoiceDetail,
  FeeInvoiceListItem,
  fetchFeeInvoiceById,
  fetchFeeInvoices
} from '../lib/api';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export function FinanceInvoicesPage() {
  const [invoices, setInvoices] = useState<FeeInvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [downloadingList, setDownloadingList] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<FeeInvoiceDetail | null>(null);
  const [viewingInvoiceLoading, setViewingInvoiceLoading] = useState(false);
  const [viewingInvoiceRequestId, setViewingInvoiceRequestId] = useState<string | null>(null);

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

  async function handleDeleteInvoice(invoice: FeeInvoiceListItem) {
    const shouldDelete = window.confirm(
      `Delete invoice "${invoice.title}" for ${invoice.student.firstName} ${invoice.student.lastName}?`
    );
    if (!shouldDelete) return;

    setDeletingInvoiceId(invoice.id);
    setError(null);
    setMessage(null);

    try {
      const response = await deleteFeeInvoiceAsAdmin(invoice.id);
      setMessage(response.message);
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete invoice');
    } finally {
      setDeletingInvoiceId(null);
    }
  }

  async function handleDownloadInvoiceList() {
    if (filteredInvoices.length === 0) {
      setError('No invoices available to download.');
      return;
    }

    setDownloadingList(true);
    setError(null);

    try {
      const rows = [
        ['Created', 'Admission No', 'Student', 'Invoice', 'Amount', 'Paid', 'Due', 'Due Date', 'Status'],
        ...filteredInvoices.map((invoice) => {
          const due = Math.max(invoice.amount - invoice.paidAmount, 0);
          return [
            new Date(invoice.createdAt).toISOString(),
            invoice.student.admissionNo,
            `${invoice.student.firstName} ${invoice.student.lastName}`,
            invoice.title,
            String(invoice.amount),
            String(invoice.paidAmount),
            String(due),
            new Date(invoice.dueDate).toISOString(),
            invoice.status
          ];
        })
      ];

      const escapeCsv = (value: string) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };

      const csv = rows.map((row) => row.map((cell) => escapeCsv(cell)).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const fileUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const dateSuffix = new Date().toISOString().slice(0, 10);
      const targetLabel = selectedAdmissionNo === 'all' ? 'all-students' : selectedAdmissionNo;
      anchor.href = fileUrl;
      anchor.download = `fee-invoices-${targetLabel}-${dateSuffix}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(fileUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Failed to download invoices');
    } finally {
      setDownloadingList(false);
    }
  }

  async function handleViewInvoice(invoiceId: string) {
    setViewingInvoiceRequestId(invoiceId);
    setViewingInvoiceLoading(true);
    setError(null);

    try {
      const invoice = await fetchFeeInvoiceById(invoiceId);
      setViewingInvoice(invoice);
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : 'Failed to load invoice details');
    } finally {
      setViewingInvoiceLoading(false);
      setViewingInvoiceRequestId(null);
    }
  }

  function closeViewInvoiceModal() {
    setViewingInvoice(null);
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
      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      <section className="rounded-xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-brand-navy">All Student Invoices</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownloadInvoiceList()}
              disabled={downloadingList || filteredInvoices.length === 0}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloadingList ? 'Downloading...' : 'Download Invoices'}
            </button>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">Latest 50</span>
          </div>
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
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</th>
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
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleViewInvoice(invoice.id)}
                          disabled={viewingInvoiceLoading}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-brand-navy hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          title="View invoice"
                        >
                          {viewingInvoiceLoading && viewingInvoiceRequestId === invoice.id ? 'Loading...' : 'View'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteInvoice(invoice)}
                          disabled={deletingInvoiceId === invoice.id}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Delete invoice"
                        >
                          {deletingInvoiceId === invoice.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filteredInvoices.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">No invoices found.</p> : null}
        </div>
      </section>

      {viewingInvoice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-brand-navy">Invoice Details</h4>
                <p className="text-xs text-slate-500">{viewingInvoice.title}</p>
              </div>
              <button
                type="button"
                onClick={closeViewInvoiceModal}
                className="rounded-md border border-slate-200 px-3 py-1 text-sm text-brand-navy hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200/80 bg-slate-50/50 p-4 text-sm md:grid-cols-2">
              <p>Student: <span className="font-semibold text-brand-navy">{viewingInvoice.student.firstName} {viewingInvoice.student.lastName}</span></p>
              <p>Admission No: <span className="font-semibold text-brand-navy">{viewingInvoice.student.admissionNo}</span></p>
              <p>Class/Section: <span className="font-semibold text-brand-navy">{viewingInvoice.student.className}/{viewingInvoice.student.section}</span></p>
              <p>Status: <span className="font-semibold text-brand-navy">{viewingInvoice.status}</span></p>
              <p>Amount: <span className="font-semibold text-brand-navy">{formatCurrency(viewingInvoice.amount)}</span></p>
              <p>Paid: <span className="font-semibold text-brand-navy">{formatCurrency(viewingInvoice.paidAmount)}</span></p>
              <p>Due: <span className="font-semibold text-brand-navy">{formatCurrency(viewingInvoice.due)}</span></p>
              <p>Due Date: <span className="font-semibold text-brand-navy">{new Date(viewingInvoice.dueDate).toLocaleDateString()}</span></p>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200/80 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h5 className="text-sm font-semibold text-brand-navy">Fee Components</h5>
              </div>
              <div className="max-h-56 overflow-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Fee Type</th>
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Cadence</th>
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingInvoice.componentBreakdown.map((component) => (
                      <tr key={`${viewingInvoice.id}-${component.feeType}-${component.cadence ?? 'none'}`} className="border-b border-slate-100">
                        <td className="px-4 py-2 text-slate-700">{component.feeType}</td>
                        <td className="px-4 py-2 text-slate-600">{component.cadence ?? '-'}</td>
                        <td className="px-4 py-2 font-semibold text-brand-navy">{formatCurrency(component.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {viewingInvoice.componentBreakdown.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">No components found.</p> : null}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200/80 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h5 className="text-sm font-semibold text-brand-navy">Payments</h5>
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Date</th>
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Method</th>
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Fee Type</th>
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Amount</th>
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Due After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingInvoice.payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-slate-100">
                        <td className="px-4 py-2 text-slate-700">{new Date(payment.paymentDate).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-slate-600">{payment.paymentMethod}</td>
                        <td className="px-4 py-2 text-slate-600">{payment.feeType ?? '-'}</td>
                        <td className="px-4 py-2 font-semibold text-brand-navy">{formatCurrency(payment.amount)}</td>
                        <td className="px-4 py-2 text-slate-600">{formatCurrency(payment.dueAfterPayment)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {viewingInvoice.payments.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">No payments recorded for this invoice yet.</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
