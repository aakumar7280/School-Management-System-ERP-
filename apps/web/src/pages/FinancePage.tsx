import { ReactNode, useEffect, useMemo, useState } from 'react';

import {
  clearFeeTransactionsAsAdmin,
  createFeeInvoice,
  deleteFeeInvoiceAsAdmin,
  fetchFeeStudents,
  fetchFinanceOverview,
  fetchStudentFeeAssignments,
  FinanceOverview,
  FeeStudentOption,
  generateBulkFeeInvoices,
  payFeeInvoiceAsAdmin,
  StudentFeeAssignment,
  upsertStudentFeeAssignment
} from '../lib/api';
import { FinanceSectionNav } from '../components/FinanceSectionNav';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

interface CollapsiblePanelProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
  rightSlot?: ReactNode;
}

type AccordionPanelKey = 'studentSelection' | 'feeComponents' | 'discount' | 'dues' | 'transactions';
type PinnedPanelKey = 'studentSelection' | 'summary';

function CollapsiblePanel({ title, isOpen, onToggle, children, rightSlot }: CollapsiblePanelProps) {
  return (
    <section className="rounded-xl border border-slate-200/80 shadow-card p-4">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
      >
        <h4 className="font-semibold text-brand-navy">{title}</h4>
        <div className="flex items-center gap-3">
          {rightSlot ? <div onClick={(event) => event.stopPropagation()}>{rightSlot}</div> : null}
          <span className="text-xs font-medium text-slate-400">{isOpen ? 'Hide' : 'Show'}</span>
        </div>
      </div>
      {isOpen ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

export function FinancePage() {
  const [students, setStudents] = useState<FeeStudentOption[]>([]);
  const [assignments, setAssignments] = useState<StudentFeeAssignment[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('all');
  const [billingCycle, setBillingCycle] = useState<'YEARLY' | 'QUARTERLY' | 'MONTHLY'>('MONTHLY');
  const [components, setComponents] = useState<Array<{ feeType: string; cadence: 'MONTHLY' | 'YEARLY'; amount: string }>>([]);
  const [discountType, setDiscountType] = useState<'FLAT' | 'PERCENTAGE'>('FLAT');
  const [discountValue, setDiscountValue] = useState('0');
  const [discountReason, setDiscountReason] = useState('');
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [bulkInvoiceSaving, setBulkInvoiceSaving] = useState(false);
  const [previousDueSaving, setPreviousDueSaving] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [previousDueAmount, setPreviousDueAmount] = useState('');
  const [previousDueDate, setPreviousDueDate] = useState('');
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);

  const [activePaymentInvoiceId, setActivePaymentInvoiceId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CASH'>('UPI');
  const [paymentFeeType, setPaymentFeeType] = useState('Tuition');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [clearingTransactions, setClearingTransactions] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activeAccordionPanel, setActiveAccordionPanel] = useState<AccordionPanelKey | null>('studentSelection');
  const [pinnedPanels, setPinnedPanels] = useState<PinnedPanelKey[]>(['summary']);

  const feeTypeOptions = ['Tuition', 'Transport', 'Meals', 'Sports', 'Lab', 'Library', 'Hostel', 'Exam', 'Other'];

  const classFilterOptions = useMemo(() => {
    const options = new Set<string>();
    students.forEach((student) => {
      options.add(`${student.className}/${student.section}`);
    });
    return Array.from(options).sort((left, right) => left.localeCompare(right));
  }, [students]);

  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();

    return students
      .filter((student) => {
        if (studentClassFilter !== 'all' && `${student.className}/${student.section}` !== studentClassFilter) {
          return false;
        }

        if (!query) {
          return true;
        }

        const searchable = `${student.admissionNo} ${student.firstName} ${student.lastName} ${student.className} ${student.section}`.toLowerCase();
        return searchable.includes(query);
      });
  }, [students, studentSearch, studentClassFilter]);

  const selectedStudent = useMemo(() => students.find((student) => student.id === selectedStudentId) ?? null, [students, selectedStudentId]);
  const selectedSavedAssignment = useMemo(() => assignments.find((assignment) => assignment.studentId === selectedStudentId) ?? null, [assignments, selectedStudentId]);

  const filteredDueStudents = useMemo(() => {
    const allDue = overview?.dueStudents ?? [];
    if (!selectedStudent) return [];
    return allDue.filter((invoice) => invoice.student.admissionNo === selectedStudent.admissionNo);
  }, [overview?.dueStudents, selectedStudent]);

  const selectedMonthWindow = useMemo(() => {
    const [yearPart, monthPart] = month.split('-').map((value) => Number(value));
    const start = new Date(yearPart, monthPart - 1, 1);
    const end = new Date(yearPart, monthPart, 1);
    return { start, end };
  }, [month]);

  const carryForwardDueStudents = useMemo(
    () => filteredDueStudents.filter((invoice) => new Date(invoice.dueDate) < selectedMonthWindow.start),
    [filteredDueStudents, selectedMonthWindow.start]
  );

  const currentMonthDueStudents = useMemo(
    () =>
      filteredDueStudents.filter((invoice) => {
        const dueDate = new Date(invoice.dueDate);
        return dueDate >= selectedMonthWindow.start && dueDate < selectedMonthWindow.end;
      }),
    [filteredDueStudents, selectedMonthWindow.end, selectedMonthWindow.start]
  );

  const nextMonthWindow = useMemo(() => {
    const start = new Date(selectedMonthWindow.end);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }, [selectedMonthWindow.end]);

  const nextMonthDueStudents = useMemo(
    () =>
      filteredDueStudents.filter((invoice) => {
        const dueDate = new Date(invoice.dueDate);
        return dueDate >= nextMonthWindow.start && dueDate < nextMonthWindow.end;
      }),
    [filteredDueStudents, nextMonthWindow.end, nextMonthWindow.start]
  );

  const carryForwardDueTotal = useMemo(
    () => carryForwardDueStudents.reduce((sum, invoice) => sum + invoice.due, 0),
    [carryForwardDueStudents]
  );

  const currentMonthDueTotal = useMemo(
    () => currentMonthDueStudents.reduce((sum, invoice) => sum + invoice.due, 0),
    [currentMonthDueStudents]
  );

  const nextMonthDueTotal = useMemo(
    () => nextMonthDueStudents.reduce((sum, invoice) => sum + invoice.due, 0),
    [nextMonthDueStudents]
  );

  const nextMonthLabel = useMemo(() => {
    const [yearPart, monthPart] = month.split('-').map((value) => Number(value));
    const date = new Date(yearPart, monthPart - 1, 1);
    date.setMonth(date.getMonth() + 1);
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [month]);

  const defaultPreviousDueDate = useMemo(() => {
    const previousDate = new Date(selectedMonthWindow.start);
    previousDate.setDate(previousDate.getDate() - 1);
    const year = previousDate.getFullYear();
    const monthPart = String(previousDate.getMonth() + 1).padStart(2, '0');
    const day = String(previousDate.getDate()).padStart(2, '0');
    return `${year}-${monthPart}-${day}`;
  }, [selectedMonthWindow.start]);

  const filteredTransactions = useMemo(() => {
    const allTransactions = overview?.feeTransactions ?? [];
    if (!selectedStudent) return [];
    return allTransactions.filter((transaction) => transaction.student.admissionNo === selectedStudent.admissionNo);
  }, [overview?.feeTransactions, selectedStudent]);

  const yearlySubtotal = useMemo(
    () =>
      components
        .filter((component) => component.cadence === 'YEARLY')
        .reduce((sum, component) => sum + (Number.isFinite(Number(component.amount)) ? Number(component.amount) : 0), 0),
    [components]
  );

  const monthlySubtotal = useMemo(
    () =>
      components
        .filter((component) => component.cadence === 'MONTHLY')
        .reduce((sum, component) => sum + (Number.isFinite(Number(component.amount)) ? Number(component.amount) : 0), 0),
    [components]
  );

  const subtotal = useMemo(() => yearlySubtotal + monthlySubtotal * 12, [yearlySubtotal, monthlySubtotal]);

  const computedDiscountAmount = useMemo(() => {
    const parsed = Number(discountValue || 0);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    if (discountType === 'PERCENTAGE') return (subtotal * parsed) / 100;
    return parsed;
  }, [discountType, discountValue, subtotal]);

  const finalTotal = useMemo(() => Math.max(subtotal - computedDiscountAmount, 0), [subtotal, computedDiscountAmount]);
  const configuredInstallmentAmount = useMemo(() => {
    if (billingCycle === 'MONTHLY') return finalTotal / 12;
    if (billingCycle === 'QUARTERLY') return finalTotal / 4;
    return finalTotal;
  }, [billingCycle, finalTotal]);

  const nextInstallmentPreviewAmount = useMemo(
    () => Math.max(selectedSavedAssignment?.installmentAmount ?? configuredInstallmentAmount, 0),
    [selectedSavedAssignment?.installmentAmount, configuredInstallmentAmount]
  );

  const effectiveNextMonthDue = useMemo(
    () => (nextMonthDueTotal > 0 ? nextMonthDueTotal : nextInstallmentPreviewAmount),
    [nextMonthDueTotal, nextInstallmentPreviewAmount]
  );

  const projectedNextMonthPayable = useMemo(
    () => carryForwardDueTotal + effectiveNextMonthDue,
    [carryForwardDueTotal, effectiveNextMonthDue]
  );

  function togglePinnedPanel(panel: PinnedPanelKey) {
    setPinnedPanels((previous) => (previous.includes(panel) ? previous.filter((item) => item !== panel) : [...previous, panel]));
  }

  function isPanelPinned(panel: PinnedPanelKey) {
    return pinnedPanels.includes(panel);
  }


  function resetDynamicFeeForm() {
    setBillingCycle('MONTHLY');
    setComponents([]);
    setDiscountType('FLAT');
    setDiscountValue('0');
    setDiscountReason('');
  }

  function selectStudentForAssignment(studentId: string) {
    setSelectedStudentId(studentId);
    const existing = assignments.find((assignment) => assignment.studentId === studentId);

    if (existing) {
      fillFormFromAssignment(existing);
      return;
    }

    resetDynamicFeeForm();
    setAssignmentMessage(null);
    setAssignmentError(null);
  }

  useEffect(() => {
    async function loadAssignments() {
      setAssignmentLoading(true);
      setAssignmentError(null);

      try {
        const [studentsResponse, assignmentsResponse] = await Promise.all([fetchFeeStudents(), fetchStudentFeeAssignments()]);
        setStudents(studentsResponse);
        setAssignments(assignmentsResponse);

        if (!selectedStudentId && studentsResponse.length > 0) {
          const firstStudentId = studentsResponse[0].id;
          setSelectedStudentId(firstStudentId);

          const existing = assignmentsResponse.find((assignment) => assignment.studentId === firstStudentId);
          if (existing) {
            fillFormFromAssignment(existing);
          }
        }
      } catch (loadError) {
        setAssignmentError(loadError instanceof Error ? loadError.message : 'Failed to load student fee assignments');
      } finally {
        setAssignmentLoading(false);
      }
    }

    loadAssignments();
  }, []);

  async function loadFinanceData(targetMonth: string) {
    setFinanceLoading(true);
    setFinanceError(null);

    try {
      const overviewResponse = await fetchFinanceOverview(targetMonth);
      setOverview(overviewResponse);
    } catch (loadError) {
      setFinanceError(loadError instanceof Error ? loadError.message : 'Failed to load finance overview');
    } finally {
      setFinanceLoading(false);
    }
  }

  useEffect(() => {
    loadFinanceData(month);
  }, [month]);

  useEffect(() => {
    setPreviousDueDate(defaultPreviousDueDate);
  }, [defaultPreviousDueDate]);

  function fillFormFromAssignment(assignment: StudentFeeAssignment) {
    setSelectedStudentId(assignment.studentId);
    setBillingCycle(assignment.billingCycle);
    setComponents(assignment.components.map((component) => ({ feeType: component.feeType, cadence: component.cadence, amount: String(component.amount) })));
    setDiscountType(assignment.discount?.type ?? 'FLAT');
    setDiscountValue(String(assignment.discount?.value ?? 0));
    setDiscountReason(assignment.discount?.reason ?? '');
    setAssignmentMessage(null);
    setAssignmentError(null);
  }

  function addFeeComponentRow() {
    setComponents((previous) => [...previous, { feeType: 'Tuition', cadence: 'YEARLY', amount: '' }]);
  }

  function updateFeeComponentRow(index: number, updates: Partial<{ feeType: string; cadence: 'MONTHLY' | 'YEARLY'; amount: string }>) {
    setComponents((previous) => previous.map((component, componentIndex) => (componentIndex === index ? { ...component, ...updates } : component)));
  }

  function removeFeeComponentRow(index: number) {
    const nextComponents = components.filter((_, componentIndex) => componentIndex !== index);
    setComponents(nextComponents);

    if (!selectedStudentId) {
      return;
    }

    void persistAssignment(nextComponents, nextComponents.length === 0 ? 'All fee components removed.' : 'Fee component removed successfully.');
  }

  async function persistAssignment(
    componentsState: Array<{ feeType: string; cadence: 'MONTHLY' | 'YEARLY'; amount: string }>,
    successMessage: string
  ) {
    if (!selectedStudentId) {
      setAssignmentError('Please select a student.');
      return;
    }

    setAssignmentSaving(true);
    setAssignmentError(null);
    setAssignmentMessage(null);

    try {
      const normalizedComponents = componentsState
        .map((component) => ({
          feeType: component.feeType.trim(),
          cadence: component.cadence,
          amount: Number(component.amount || 0)
        }))
        .filter((component) => component.feeType.length > 0 && Number.isFinite(component.amount) && component.amount >= 0);

      const parsedDiscountValue = Number(discountValue || 0);

      await upsertStudentFeeAssignment(selectedStudentId, {
        billingCycle,
        components: normalizedComponents,
        discount:
          Number.isFinite(parsedDiscountValue) && parsedDiscountValue > 0
            ? {
                type: discountType,
                value: parsedDiscountValue,
                reason: discountReason.trim() || undefined
              }
            : undefined
      });

      const refreshed = await fetchStudentFeeAssignments();
      setAssignments(refreshed);
      setAssignmentMessage(successMessage);

      const updatedCurrent = refreshed.find((assignment) => assignment.studentId === selectedStudentId);
      if (updatedCurrent) {
        fillFormFromAssignment(updatedCurrent);
      }
    } catch (saveError) {
      setAssignmentError(saveError instanceof Error ? saveError.message : 'Failed to save student fee structure');
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function handleSaveAssignment() {
    await persistAssignment(components, 'Student fee structure saved successfully.');
  }

  async function handleGenerateInvoice() {
    if (!selectedStudent) {
      setAssignmentError('Please select a student first.');
      return;
    }

    if (!selectedSavedAssignment || selectedSavedAssignment.finalTotal <= 0) {
      setAssignmentError('Save a valid fee structure before generating invoice.');
      return;
    }

    setInvoiceSaving(true);
    setAssignmentError(null);

    try {
      const fallbackTitle = `${selectedSavedAssignment.billingCycle} Fee Invoice`;
      await createFeeInvoice({
        admissionNo: selectedStudent.admissionNo,
        title: fallbackTitle
      });
      await loadFinanceData(month);
      setAssignmentMessage('Fee invoice generated successfully.');
    } catch (saveError) {
      setAssignmentError(saveError instanceof Error ? saveError.message : 'Failed to generate fee invoice');
    } finally {
      setInvoiceSaving(false);
    }
  }

  async function handleGenerateBulkInvoices() {
    setBulkInvoiceSaving(true);
    setAssignmentError(null);

    try {
      const response = await generateBulkFeeInvoices();
      await loadFinanceData(month);
      const skipped = response.summary.skippedReasons;

      setAssignmentMessage(
        `${response.message} Missing school config: ${skipped.missingSchoolConfig}, invalid installment: ${skipped.invalidInstallment}, existing same due-date invoice: ${skipped.existingInvoiceForDueDate}.`
      );
    } catch (saveError) {
      setAssignmentError(saveError instanceof Error ? saveError.message : 'Failed to generate invoices for eligible students');
    } finally {
      setBulkInvoiceSaving(false);
    }
  }

  async function handleAddPreviousDue() {
    if (!selectedStudent) {
      setAssignmentError('Please select a student first.');
      return;
    }

    const amount = Number(previousDueAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setAssignmentError('Enter a valid previous due amount greater than 0.');
      return;
    }

    if (!previousDueDate) {
      setAssignmentError('Please select a due date for previous due.');
      return;
    }

    setPreviousDueSaving(true);
    setAssignmentError(null);

    try {
      await createFeeInvoice({
        admissionNo: selectedStudent.admissionNo,
        title: 'Previous Session Due',
        amount,
        dueDate: previousDueDate
      });

      await loadFinanceData(month);
      setPreviousDueAmount('');
      setAssignmentMessage('Previous due added successfully. It will carry forward until paid.');
    } catch (saveError) {
      setAssignmentError(saveError instanceof Error ? saveError.message : 'Failed to add previous due');
    } finally {
      setPreviousDueSaving(false);
    }
  }

  function openRecordPayment(invoiceId: string) {
    const invoice = filteredDueStudents.find((row) => row.id === invoiceId);
    if (!invoice) return;

    setActivePaymentInvoiceId(invoiceId);
    setIsPaymentModalOpen(true);
    setPaymentAmount(String(invoice.due));
    setPaymentMethod('UPI');
    setPaymentFeeType('Tuition');
    setPaymentError(null);
    setPaymentMessage(null);
  }

  function closeRecordPaymentModal() {
    setIsPaymentModalOpen(false);
    setActivePaymentInvoiceId(null);
    setPaymentAmount('');
  }

  function handleOpenPrimaryPaymentModal() {
    if (filteredDueStudents.length === 0) {
      setPaymentError('No due invoices available for the selected student.');
      return;
    }

    const firstDueInvoice = filteredDueStudents[0];
    openRecordPayment(firstDueInvoice.id);
  }

  function handlePaymentInvoiceChange(invoiceId: string) {
    setActivePaymentInvoiceId(invoiceId);
    const selectedInvoice = filteredDueStudents.find((row) => row.id === invoiceId);
    if (selectedInvoice) {
      setPaymentAmount(String(selectedInvoice.due));
    }
  }

  async function handleRecordPayment() {
    const invoice = filteredDueStudents.find((row) => row.id === activePaymentInvoiceId);
    if (!invoice) {
      setPaymentError('Please select a due record first.');
      return;
    }

    const typedAmount = Number(paymentAmount || invoice.due);

    if (!Number.isFinite(typedAmount) || typedAmount <= 0) {
      setPaymentError('Enter a valid payment amount greater than 0.');
      return;
    }

    setPaymentSaving(true);
    setPaymentMessage(null);
    setPaymentError(null);

    try {
      await payFeeInvoiceAsAdmin(invoice.id, {
        amount: Math.min(typedAmount, invoice.due),
        paymentMethod,
        feeType: paymentFeeType
      });

      await loadFinanceData(month);
      setPaymentMessage('Fee payment recorded successfully.');
      closeRecordPaymentModal();
    } catch (saveError) {
      setPaymentError(saveError instanceof Error ? saveError.message : 'Failed to record payment');
    } finally {
      setPaymentSaving(false);
    }
  }

  async function handleDeleteDue(invoiceId: string) {
    const shouldDelete = window.confirm('Are you sure you want to delete this due record?');
    if (!shouldDelete) return;

    setDeletingInvoiceId(invoiceId);
    setPaymentError(null);
    setPaymentMessage(null);

    try {
      await deleteFeeInvoiceAsAdmin(invoiceId);
      await loadFinanceData(month);
      if (activePaymentInvoiceId === invoiceId) {
        setActivePaymentInvoiceId(null);
        setPaymentAmount('');
      }
      setPaymentMessage('Fee due deleted successfully.');
    } catch (deleteError) {
      setPaymentError(deleteError instanceof Error ? deleteError.message : 'Failed to delete due record');
    } finally {
      setDeletingInvoiceId(null);
    }
  }

  async function handleClearTransactionLog() {
    const shouldClear = window.confirm('Clear all transaction logs? This will also reset all invoice paid amounts to 0.');
    if (!shouldClear) return;

    setClearingTransactions(true);
    setPaymentError(null);
    setPaymentMessage(null);

    try {
      await clearFeeTransactionsAsAdmin();
      await loadFinanceData(month);
      setActivePaymentInvoiceId(null);
      setPaymentAmount('');
      setPaymentMessage('Transaction log cleared successfully.');
    } catch (clearError) {
      setPaymentError(clearError instanceof Error ? clearError.message : 'Failed to clear transaction log');
    } finally {
      setClearingTransactions(false);
    }
  }

  const studentSelectionContent = (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-3 md:col-span-2">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white md:col-span-2"
              placeholder="Search student by admission no, name, class, section"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
            />
            <select
              className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
              value={studentClassFilter}
              onChange={(event) => setStudentClassFilter(event.target.value)}
            >
              <option value="all">All Classes/Sections</option>
              {classFilterOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-52 overflow-y-auto rounded-md border border-slate-200/80">
            {filteredStudents.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">No students found for current search/filter.</p>
            ) : (
              filteredStudents.map((student) => {
                const isSelected = student.id === selectedStudentId;
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => selectStudentForAssignment(student.id)}
                    className={`flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 ${
                      isSelected ? 'bg-brand-navy/5 text-brand-navy' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span>
                      {student.admissionNo} - {student.firstName} {student.lastName}
                    </span>
                    <span className="text-xs text-slate-500">
                      {student.className}/{student.section}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <p className="text-xs text-slate-500">Showing all matches. Keep typing to narrow quickly.</p>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-brand-navy">
          <p>
            Selected: <span className="font-semibold">{selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName}` : 'None'}</span>
          </p>
          {selectedStudent ? <p>Class/Section: <span className="font-semibold">{selectedStudent.className}/{selectedStudent.section}</span></p> : null}
          <p>Final Total: <span className="font-semibold">{formatCurrency(finalTotal)}</span></p>
        </div>
      </div>

      {selectedStudent ? (
        <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Student Summary</p>
          <p className="text-lg font-semibold text-brand-navy">
            {selectedStudent.firstName} {selectedStudent.lastName}
          </p>
          <p className="text-sm text-slate-600">Admission: {selectedStudent.admissionNo} · Class {selectedStudent.className}/{selectedStudent.section}</p>
        </div>
      ) : null}
    </>
  );

  const summaryContent = (
    <div className="space-y-1 text-sm">
      {components.map((component, index) => (
        <div key={`summary-${index}`} className="flex items-center justify-between">
          <span>{component.feeType} ({component.cadence === 'MONTHLY' ? 'Monthly' : 'Yearly'})</span>
          <span className="font-medium text-brand-navy">{formatCurrency(Number(component.amount || 0))}</span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-slate-200/80 pt-2">
        <span>Subtotal (Annualized)</span>
        <span className="font-medium text-brand-navy">{formatCurrency(subtotal)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span>Yearly Components Total</span>
        <span className="font-medium text-brand-navy">{formatCurrency(yearlySubtotal)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span>Monthly Components Total</span>
        <span className="font-medium text-brand-navy">{formatCurrency(monthlySubtotal)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span>Discount</span>
        <span className="font-medium text-brand-navy">- {formatCurrency(computedDiscountAmount)}</span>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200/80 pt-2 text-base">
        <span className="font-semibold text-brand-navy">Final Total</span>
        <span className="text-xl font-bold text-brand-navy">{formatCurrency(finalTotal)}</span>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-brand-navy">Finance</h2>
        <button
          type="button"
          onClick={handleGenerateBulkInvoices}
          disabled={bulkInvoiceSaving || assignmentSaving || invoiceSaving || assignmentLoading}
          className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-slate-50 disabled:opacity-60"
        >
          {bulkInvoiceSaving ? 'Generating All Invoices...' : 'Generate Invoices For All Eligible Students'}
        </button>
      </div>

      <FinanceSectionNav />

      <section className="rounded-xl border border-slate-200/80 shadow-card bg-white p-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
        {financeError ? <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{financeError}</div> : null}
        {paymentMessage ? <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{paymentMessage}</div> : null}
        {paymentError ? <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{paymentError}</div> : null}
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <section className="space-y-4 rounded-xl border border-slate-200/80 shadow-card bg-white p-4">
            <h3 className="text-lg font-semibold text-brand-navy">Assign Fee Structure Per Student</h3>
            <p className="text-sm text-slate-600">Set base fees and additional components for each student individually.</p>

            {assignmentMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{assignmentMessage}</div> : null}
            {assignmentError ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{assignmentError}</div> : null}

            {assignmentLoading ? (
              <p className="text-sm text-slate-500">Loading students and fee structures...</p>
            ) : (
              <>
                <CollapsiblePanel
                  title="Student Selection"
                  isOpen={activeAccordionPanel === 'studentSelection'}
                  onToggle={() => setActiveAccordionPanel((previous) => (previous === 'studentSelection' ? null : 'studentSelection'))}
                  rightSlot={
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        togglePinnedPanel('studentSelection');
                      }}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs text-brand-navy hover:bg-slate-50"
                    >
                      {isPanelPinned('studentSelection') ? 'Unpin' : 'Pin'}
                    </button>
                  }
                >
                  {studentSelectionContent}
                </CollapsiblePanel>

                <CollapsiblePanel
                  title="Fee Components"
                  isOpen={activeAccordionPanel === 'feeComponents'}
                  onToggle={() => setActiveAccordionPanel((previous) => (previous === 'feeComponents' ? null : 'feeComponents'))}
                >
              <div className="space-y-3">
                {components.length === 0 ? <p className="text-sm text-slate-500">No fee components added yet.</p> : null}
                <div className="space-y-2">
                  {components.map((component, index) => (
                    <div key={`${component.feeType}-${component.cadence}-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-12">
                      <select
                        className="rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white md:col-span-4"
                        value={component.feeType}
                        onChange={(event) => updateFeeComponentRow(index, { feeType: event.target.value })}
                      >
                        {feeTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <select
                        className="rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white md:col-span-3"
                        value={component.cadence}
                        onChange={(event) => updateFeeComponentRow(index, { cadence: event.target.value as 'MONTHLY' | 'YEARLY' })}
                      >
                        <option value="YEARLY">Yearly</option>
                        <option value="MONTHLY">Monthly</option>
                      </select>
                      <div className="flex items-center rounded-md border border-slate-200/80 bg-slate-50/50 px-3 transition-colors focus-within:border-brand-sky focus-within:bg-white md:col-span-3">
                        <span className="mr-2 text-sm text-slate-500">₹</span>
                        <input
                          className="w-full py-2 text-sm outline-none"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Enter amount"
                          value={component.amount}
                          onChange={(event) => updateFeeComponentRow(index, { amount: event.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFeeComponentRow(index)}
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 md:col-span-2"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addFeeComponentRow}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50"
                >
                  + Add Fee Component
                </button>
              </div>
                </CollapsiblePanel>

                <CollapsiblePanel
                  title="Discount"
                  isOpen={activeAccordionPanel === 'discount'}
                  onToggle={() => setActiveAccordionPanel((previous) => (previous === 'discount' ? null : 'discount'))}
                >
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <select className="rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" value={discountType} onChange={(e) => setDiscountType(e.target.value as 'FLAT' | 'PERCENTAGE')}>
                  <option value="FLAT">Flat Amount (₹)</option>
                  <option value="PERCENTAGE">Percentage (%)</option>
                </select>
                <input
                  className="rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={discountType === 'FLAT' ? 'Enter amount' : 'Enter percentage'}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                />
                <input
                  className="rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
                  placeholder="Reason (optional)"
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                />
              </div>
                </CollapsiblePanel>

            <section className="space-y-3 rounded-xl border border-slate-200/80 p-4">
              <h4 className="font-semibold text-brand-navy">Payment & Invoice Actions</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <select className="rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as 'YEARLY' | 'QUARTERLY' | 'MONTHLY')}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
                <div className="rounded-md border border-brand-orange/40 bg-brand-orange/5 px-3 py-2 text-sm">Current {billingCycle} Due: <span className="font-semibold text-brand-navy">{formatCurrency(configuredInstallmentAmount)}</span></div>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className="flex items-center rounded-md border border-slate-200/80 bg-slate-50/50 px-3 transition-colors focus-within:border-brand-sky focus-within:bg-white">
                  <span className="mr-2 text-sm text-slate-500">₹</span>
                  <input
                    className="w-full py-2 text-sm outline-none"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Previous due amount"
                    value={previousDueAmount}
                    onChange={(event) => setPreviousDueAmount(event.target.value)}
                  />
                </div>
                <input
                  className="rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
                  type="date"
                  value={previousDueDate}
                  onChange={(event) => setPreviousDueDate(event.target.value)}
                />
                <button
                  type="button"
                  onClick={handleAddPreviousDue}
                  disabled={previousDueSaving || !selectedStudent}
                  className="rounded-md border border-brand-orange/30 bg-brand-orange/10 px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-orange/20 disabled:opacity-60"
                >
                  {previousDueSaving ? 'Adding Previous Due...' : 'Add Previous Due'}
                </button>
              </div>

              <p className="text-xs text-slate-500">Use this for existing students with outstanding fees from earlier sessions/months. These dues remain pending and continue as carry-forward until paid.</p>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
                <h5 className="font-semibold text-brand-navy">Selected Student Pending Invoices</h5>
                <p className="mt-1 text-xs text-slate-500">Previous dues and upcoming dues are shown here for quick admin visibility.</p>

                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                    <p className="text-xs text-slate-500">Previous Due Outstanding</p>
                    <p className="text-base font-semibold text-brand-navy">{formatCurrency(carryForwardDueTotal)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                    <p className="text-xs text-slate-500">Current Month Due</p>
                    <p className="text-base font-semibold text-brand-navy">{formatCurrency(currentMonthDueTotal)}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                    <p className="text-xs text-slate-500">Next Month Due ({nextMonthLabel})</p>
                    <p className="text-base font-semibold text-brand-navy">{formatCurrency(effectiveNextMonthDue)}</p>
                  </div>
                </div>

                <div className="mt-3 max-h-56 overflow-auto rounded-md border border-slate-200/80 bg-white">
                  <table className="min-w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80">
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Invoice</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Due</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Due Date</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDueStudents.map((invoice) => {
                        const dueDate = new Date(invoice.dueDate);
                        const dueType = dueDate < selectedMonthWindow.start
                          ? 'Previous Due'
                          : dueDate < selectedMonthWindow.end
                            ? 'Current Month'
                            : dueDate < nextMonthWindow.end
                              ? 'Next Month'
                              : 'Future';

                        return (
                          <tr key={`pending-invoice-${invoice.id}`} className="border-b border-slate-100">
                            <td className="px-3 py-2 text-slate-700">{invoice.title}</td>
                            <td className="px-3 py-2 font-semibold text-brand-navy">{formatCurrency(invoice.due)}</td>
                            <td className="px-3 py-2 text-slate-600">{dueDate.toLocaleDateString()}</td>
                            <td className="px-3 py-2 text-slate-600">{dueType}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredDueStudents.length === 0 ? <p className="px-3 py-2 text-xs text-slate-500">No pending invoices for this student.</p> : null}
                </div>
              </div>

              <div className="flex justify-end">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveAssignment}
                    disabled={assignmentSaving || !selectedStudentId}
                    className="rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60"
                  >
                    {assignmentSaving ? 'Saving Fee Structure...' : 'Save Student Fee Structure'}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateInvoice}
                    disabled={invoiceSaving || !selectedStudent || !selectedSavedAssignment}
                    className="rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60"
                  >
                    {invoiceSaving ? 'Generating Invoice...' : 'Generate Fee Invoice'}
                  </button>
                </div>
              </div>
            </section>

              </>
            )}
          </section>

          <CollapsiblePanel
            title="Students with Fee Due"
            isOpen={activeAccordionPanel === 'dues'}
            onToggle={() => setActiveAccordionPanel((previous) => (previous === 'dues' ? null : 'dues'))}
          >
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <article className="rounded-lg border border-slate-200/80 border-l-4 border-l-amber-400 bg-slate-50/50 p-3">
            <p className="text-xs text-slate-500">Carry-Forward Due (Previous Months)</p>
            <p className="mt-1 text-lg font-semibold text-brand-navy">{formatCurrency(carryForwardDueTotal)}</p>
            <p className="text-xs text-slate-500">{carryForwardDueStudents.length} invoice(s)</p>
          </article>
          <article className="rounded-lg border border-slate-200/80 border-l-4 border-l-sky-400 bg-slate-50/50 p-3">
            <p className="text-xs text-slate-500">Current Month Due ({month})</p>
            <p className="mt-1 text-lg font-semibold text-brand-navy">{formatCurrency(currentMonthDueTotal)}</p>
            <p className="text-xs text-slate-500">{currentMonthDueStudents.length} invoice(s)</p>
          </article>
          <article className="rounded-lg border border-slate-200/80 border-l-4 border-l-red-400 bg-slate-50/50 p-3">
            <p className="text-xs text-slate-500">Next Month Payable Preview ({nextMonthLabel})</p>
            <p className="mt-1 text-lg font-semibold text-brand-navy">{formatCurrency(projectedNextMonthPayable)}</p>
            <p className="text-xs text-slate-500">Carry-forward {formatCurrency(carryForwardDueTotal)} + next-month due {formatCurrency(effectiveNextMonthDue)}</p>
          </article>
        </div>

        <div className="max-h-64 overflow-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Admission No</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Student</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Class</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due Date</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due Type</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredDueStudents.map((invoice) => (
                <tr key={invoice.id} className="border-b border-slate-100 table-row-hover">
                  <td className="px-4 py-3">{invoice.student.admissionNo}</td>
                  <td className="px-4 py-3">{invoice.student.name}</td>
                  <td className="px-4 py-3">{invoice.student.className} / {invoice.student.section}</td>
                  <td className="px-4 py-3">{invoice.title}</td>
                  <td className="px-4 py-3 font-semibold text-brand-navy">{formatCurrency(invoice.due)}</td>
                  <td className="px-4 py-3">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {new Date(invoice.dueDate) < selectedMonthWindow.start ? (
                      <span className="rounded-full border border-brand-orange/40 bg-brand-orange/10 px-2 py-0.5 text-xs font-semibold text-brand-navy">Carry Forward</span>
                    ) : (
                      <span className="rounded-full border border-brand-sky/40 bg-brand-sky/10 px-2 py-0.5 text-xs font-semibold text-brand-navy">Current Month</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openRecordPayment(invoice.id)}
                        className="rounded-md bg-brand-navy px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60"
                      >
                        Record Payment
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDue(invoice.id)}
                        disabled={deletingInvoiceId === invoice.id}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                        aria-label="Delete due"
                      >
                        {deletingInvoiceId === invoice.id ? '...' : 'X'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!financeLoading && filteredDueStudents.length === 0 ? <p className="pt-3 text-sm text-slate-500">No pending student dues for selected month context.</p> : null}
        </div>
          </CollapsiblePanel>

          <CollapsiblePanel
            title="Fee Payment Transaction Log"
            isOpen={activeAccordionPanel === 'transactions'}
            onToggle={() => setActiveAccordionPanel((previous) => (previous === 'transactions' ? null : 'transactions'))}
            rightSlot={<p className="text-xs text-slate-500">Period: {month}</p>}
          >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClearTransactionLog}
            disabled={clearingTransactions}
            className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {clearingTransactions ? 'Clearing...' : 'Clear All'}
          </button>
        </div>
        <div className="max-h-64 overflow-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Date</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Admission No</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Student</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Class</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Fee Type</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Mode</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Paid</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due After Payment</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((transaction) => (
                <tr key={transaction.id} className="border-b border-slate-100 table-row-hover">
                  <td className="px-4 py-3">{new Date(transaction.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{transaction.student.admissionNo}</td>
                  <td className="px-4 py-3">{transaction.student.name}</td>
                  <td className="px-4 py-3">{transaction.student.className} / {transaction.student.section}</td>
                  <td className="px-4 py-3">{transaction.invoice.title}</td>
                  <td className="px-4 py-3">{transaction.feeType ?? 'General'}</td>
                  <td className="px-4 py-3">{transaction.paymentMethod}</td>
                  <td className="px-4 py-3 font-semibold text-brand-navy">{formatCurrency(transaction.amount)}</td>
                  <td className="px-4 py-3">{formatCurrency(transaction.invoice.due)}</td>
                  <td className="px-4 py-3">{transaction.invoice.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!financeLoading && filteredTransactions.length === 0 ? <p className="pt-3 text-sm text-slate-500">No fee transactions found for selected period.</p> : null}
        </div>
          </CollapsiblePanel>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-xl border border-slate-200/80 shadow-card bg-white p-4">
            <h4 className="font-semibold text-brand-navy">Currently Managing</h4>
            <p className="mt-2 text-sm font-semibold text-brand-navy">
              {selectedStudent
                ? `${selectedStudent.admissionNo} - ${selectedStudent.firstName} ${selectedStudent.lastName}`
                : 'Select a student from Student Selection'}
            </p>
            {selectedStudent ? <p className="text-xs text-slate-500">Class {selectedStudent.className}/{selectedStudent.section}</p> : null}
          </section>

          <section className="rounded-xl border border-slate-200/80 shadow-card bg-white p-4">
            <h4 className="font-semibold text-brand-navy">Payments</h4>
            <p className="mt-1 text-xs text-slate-500">Record fee collection in popup form.</p>
            <button
              type="button"
              onClick={handleOpenPrimaryPaymentModal}
              disabled={filteredDueStudents.length === 0 || paymentSaving}
              className="mt-3 w-full rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60"
            >
              Record Payment
            </button>
          </section>

          {isPanelPinned('summary') ? (
            <section className="space-y-3 rounded-xl border border-slate-200/80 shadow-card bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-brand-navy">Summary</h4>
                <button
                  type="button"
                  onClick={() => togglePinnedPanel('summary')}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-brand-navy hover:bg-slate-50"
                >
                  Unpin
                </button>
              </div>
              {summaryContent}
            </section>
          ) : (
            <button
              type="button"
              onClick={() => togglePinnedPanel('summary')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50"
            >
              Pin Summary
            </button>
          )}

          {isPanelPinned('studentSelection') ? (
            <section className="space-y-3 rounded-xl border border-slate-200/80 shadow-card bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-brand-navy">Pinned Student Selection</h4>
                <button
                  type="button"
                  onClick={() => togglePinnedPanel('studentSelection')}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-brand-navy hover:bg-slate-50"
                >
                  Unpin
                </button>
              </div>
              {studentSelectionContent}
            </section>
          ) : null}
        </aside>
      </div>

      {isPaymentModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200/80 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-brand-navy">Record Fee Payment</h4>
                <p className="text-xs text-slate-500">Select payment details and submit.</p>
              </div>
              <button
                type="button"
                onClick={closeRecordPaymentModal}
                className="rounded-md border border-slate-200 px-3 py-1 text-sm text-brand-navy hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="mb-1 text-xs text-slate-500">Due Invoice</p>
                <select
                  className="w-full rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
                  value={activePaymentInvoiceId ?? ''}
                  onChange={(event) => handlePaymentInvoiceChange(event.target.value)}
                >
                  {filteredDueStudents.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.student.admissionNo} - {invoice.student.name} - {invoice.title} ({formatCurrency(invoice.due)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-1 text-xs text-slate-500">Payment Mode</p>
                <select className="w-full rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'UPI' | 'CASH')}>
                  <option value="UPI">UPI</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>

              <div>
                <p className="mb-1 text-xs text-slate-500">Fee Type</p>
                <select className="w-full rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" value={paymentFeeType} onChange={(event) => setPaymentFeeType(event.target.value)}>
                  {feeTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <p className="mb-1 text-xs text-slate-500">Amount</p>
                <input
                  className="w-full rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeRecordPaymentModal}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-brand-navy hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordPayment}
                disabled={paymentSaving}
                className="rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60"
              >
                {paymentSaving ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
