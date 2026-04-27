import { useEffect, useMemo, useState } from 'react';

import { fetchStudentPortalFees, payStudentPortalInvoice, StudentPortalFees } from '../lib/api';

interface StudentFeesPageProps {
  portalLabel: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export function StudentFeesPage({ portalLabel }: StudentFeesPageProps) {
  const [fees, setFees] = useState<StudentPortalFees | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [payAmountByInvoice, setPayAmountByInvoice] = useState<Record<string, string>>({});
  const [payMethodByInvoice, setPayMethodByInvoice] = useState<Record<string, 'UPI' | 'CASH'>>({});

  async function loadFees() {
    setLoading(true);
    setError(null);

    try {
      const feeData = await fetchStudentPortalFees();
      setFees(feeData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load fee details');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFees();
  }, []);

  async function handlePayInvoice(invoiceId: string, due: number) {
    if (due <= 0) return;

    const typedAmount = Number(payAmountByInvoice[invoiceId] ?? due);
    if (!Number.isFinite(typedAmount) || typedAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    setPayingInvoiceId(invoiceId);
    setError(null);
    setMessage(null);

    try {
      const response = await payStudentPortalInvoice(invoiceId, Math.min(typedAmount, due), payMethodByInvoice[invoiceId] ?? 'UPI');
      setMessage(response.message);
      setPayAmountByInvoice((previous) => ({ ...previous, [invoiceId]: '' }));
      await loadFees();
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Failed to pay invoice');
    } finally {
      setPayingInvoiceId(null);
    }
  }

  const cycleAmount = useMemo(() => {
    if (!fees?.assignedFee) return 0;

    if (fees.assignedFee.billingCycle === 'MONTHLY') return fees.assignedFee.monthlyInstallment;
    if (fees.assignedFee.billingCycle === 'QUARTERLY') return fees.assignedFee.quarterlyInstallment;
    return fees.assignedFee.annualTotal;
  }, [fees]);

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="h-8 w-8 animate-spin text-brand-navy" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    );

  return (
    <div className="animate-fade-in space-y-5">
      <h2 className="text-2xl font-bold text-brand-navy">{portalLabel}: Fees</h2>
      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="space-y-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assigned Fee Plan</h3>

        {fees?.assignedFee ? (
          <>
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
              <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-sky-400 p-4 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fee Cycle</p>
                <p className="mt-1 font-semibold text-brand-navy">{fees.assignedFee.billingCycle}</p>
              </article>
              <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-amber-400 p-4 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Yearly Fees</p>
                <p className="mt-1 text-lg font-semibold text-brand-navy">{formatCurrency(fees.assignedFee.annualTotal)}</p>
              </article>
              <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-slate-300 p-4 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Installment</p>
                <p className="mt-1 font-semibold text-brand-navy">{formatCurrency(fees.assignedFee.monthlyInstallment)}</p>
              </article>
              <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-slate-300 p-4 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Quarterly Installment</p>
                <p className="mt-1 font-semibold text-brand-navy">{formatCurrency(fees.assignedFee.quarterlyInstallment)}</p>
              </article>
            </div>

            <div className="rounded-md border border-sky-200 bg-sky-50/50 px-3 py-2 text-sm text-brand-navy">
              Current plan amount ({fees.assignedFee.billingCycle}): <span className="font-semibold">{formatCurrency(cycleAmount)}</span>
            </div>

            <div className="rounded-md border border-sky-200 bg-sky-50/50 px-3 py-2 text-sm text-brand-navy">
              Fees are due on day <span className="font-semibold">{fees.feePolicy.feeDueDayOfMonth}</span> every month.
            </div>

            <div className="space-y-1 text-sm">
              {fees.assignedFee.components.map((component) => (
                <div key={component.id} className="flex items-center justify-between rounded-md border border-slate-200/80 px-3 py-2">
                  <span>
                    {component.feeType}{' '}
                    <span className="text-xs text-slate-500">
                      ({component.cadence === 'MONTHLY' ? 'Monthly' : component.cadence === 'YEARLY' ? 'Yearly' : 'Once'})
                    </span>
                  </span>
                  <span className="font-semibold text-brand-navy">{formatCurrency(component.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-200/80 pt-2">
                <span>Subtotal</span>
                <span className="font-semibold text-brand-navy">{formatCurrency(fees.assignedFee.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Discount</span>
                <span className="font-semibold text-brand-navy">- {formatCurrency(fees.assignedFee.discountAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold text-brand-navy">
                <span>Final Total</span>
                <span>{formatCurrency(fees.assignedFee.finalTotal)}</span>
              </div>
            </div>

            {fees.assignedFee.discounts && fees.assignedFee.discounts.length > 0 ? (
              <div className="space-y-1 text-sm text-slate-600">
                {fees.assignedFee.discounts.map((discount) => (
                  <p key={discount.id}>
                    Discount: {discount.type === 'FLAT' ? 'Flat' : 'Percentage'} ({discount.value})
                    {discount.reason ? ` · ${discount.reason}` : ''}
                  </p>
                ))}
              </div>
            ) : fees.assignedFee.discount ? (
              <p className="text-sm text-slate-600">
                Discount: {fees.assignedFee.discount.type === 'FLAT' ? 'Flat' : 'Percentage'} ({fees.assignedFee.discount.value})
                {fees.assignedFee.discount.reason ? ` · ${fees.assignedFee.discount.reason}` : ''}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-500">No fee plan has been assigned by admin yet.</p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fee Invoices & Payment</h3>

        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-sky-400 p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Billed</p>
            <p className="mt-1 font-semibold text-brand-navy">{formatCurrency(fees?.totals.totalBilled ?? 0)}</p>
          </article>
          <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-emerald-400 p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Paid</p>
            <p className="mt-1 font-semibold text-brand-navy">{formatCurrency(fees?.totals.totalPaid ?? 0)}</p>
          </article>
          <article className="rounded-xl border border-slate-200/80 border-l-4 border-l-red-400 p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Due</p>
            <p className="mt-1 font-semibold text-brand-navy">{formatCurrency(fees?.totals.totalDue ?? 0)}</p>
          </article>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-slate-50/80">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Amount</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Paid</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due Date</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Mode</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Amount</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {(fees?.invoices ?? []).map((invoice) => (
                <tr key={invoice.id} className="border-b border-slate-100 table-row-hover">
                  <td className="px-4 py-3">{invoice.title}</td>
                  <td className="px-4 py-3">{formatCurrency(invoice.amount)}</td>
                  <td className="px-4 py-3">{formatCurrency(invoice.paidAmount)}</td>
                  <td className="px-4 py-3 font-semibold text-brand-navy">{formatCurrency(invoice.due)}</td>
                  <td className="px-4 py-3">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{invoice.status}</td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-md border border-slate-200 bg-slate-50/50 px-2 py-1 text-xs"
                      value={payMethodByInvoice[invoice.id] ?? 'UPI'}
                      onChange={(event) =>
                        setPayMethodByInvoice((previous) => ({
                          ...previous,
                          [invoice.id]: event.target.value as 'UPI' | 'CASH'
                        }))
                      }
                    >
                      <option value="UPI">UPI</option>
                      <option value="CASH">Cash</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="w-28 rounded-md border border-slate-200 bg-slate-50/50 px-2 py-1 text-xs"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Pay amount"
                      value={payAmountByInvoice[invoice.id] ?? ''}
                      onChange={(event) =>
                        setPayAmountByInvoice((previous) => ({
                          ...previous,
                          [invoice.id]: event.target.value
                        }))
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={invoice.due <= 0 || payingInvoiceId === invoice.id}
                      onClick={() => handlePayInvoice(invoice.id, invoice.due)}
                      className="rounded-md bg-brand-navy px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-50"
                    >
                      {payingInvoiceId === invoice.id ? 'Paying...' : invoice.due <= 0 ? 'Paid' : 'Pay'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(fees?.invoices.length ?? 0) === 0 ? <p className="pt-3 text-sm text-slate-500">No fee invoices available yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
