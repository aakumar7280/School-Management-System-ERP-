import { FormEvent, useEffect, useState } from 'react';

import { createFeeInvoice, createPayStub, fetchFeeTeachers, Teacher } from '../lib/api';

export function FeesPaymentsPage() {
  const [form, setForm] = useState({
    admissionNo: '',
    title: ''
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [payStubForm, setPayStubForm] = useState({
    teacherId: '',
    month: '',
    amount: '',
    note: ''
  });

  useEffect(() => {
    async function loadTeachers() {
      try {
        const data = await fetchFeeTeachers();
        setTeachers(data);
      } catch {
        setTeachers([]);
      }
    }

    loadTeachers();
  }, []);

  async function handleSendInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    try {
      await createFeeInvoice({
        admissionNo: form.admissionNo,
        title: form.title
      });
      setMessage('Fee invoice sent to student/parent successfully.');
      setForm({ admissionNo: '', title: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invoice');
    }
  }

  async function handleSendPayStub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    try {
      await createPayStub({
        teacherId: payStubForm.teacherId,
        month: payStubForm.month,
        amount: Number(payStubForm.amount),
        note: payStubForm.note || undefined
      });
      setMessage('Teacher pay stub sent successfully.');
      setPayStubForm((prev) => ({ ...prev, amount: '', note: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send teacher pay stub');
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy">Fees and Payments</h2>
        <p className="mt-1 text-sm text-slate-500">Send fee invoices and teacher pay stubs</p>
      </div>
      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <form onSubmit={handleSendInvoice} className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
        <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Send Fees Invoice
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" placeholder="Student Admission No" value={form.admissionNo} onChange={(e) => setForm((prev) => ({ ...prev, admissionNo: e.target.value }))} required />
          <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" placeholder="Invoice Title" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} required />
          <p className="md:col-span-2 text-xs text-slate-400">Invoice amount is auto-calculated from the student billing cycle, and due date is based on global Settings due-day.</p>
          <div className="md:col-span-2 flex justify-end border-t border-slate-100 pt-3">
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              Send Fees Invoice
            </button>
          </div>
        </div>
      </form>

      <form onSubmit={handleSendPayStub} className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
        <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          Send Teacher Pay Stub
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <select className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" value={payStubForm.teacherId} onChange={(e) => setPayStubForm((prev) => ({ ...prev, teacherId: e.target.value }))} required>
            <option value="">Select Teacher</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName} ({teacher.loginId})</option>
            ))}
          </select>
          <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" placeholder="Month (YYYY-MM)" value={payStubForm.month} onChange={(e) => setPayStubForm((prev) => ({ ...prev, month: e.target.value }))} required />
          <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" placeholder="Amount" type="number" value={payStubForm.amount} onChange={(e) => setPayStubForm((prev) => ({ ...prev, amount: e.target.value }))} required />
          <input className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" placeholder="Note (optional)" value={payStubForm.note} onChange={(e) => setPayStubForm((prev) => ({ ...prev, note: e.target.value }))} />
          <div className="md:col-span-2 flex justify-end border-t border-slate-100 pt-3">
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              Send Teacher Pay Stub
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
