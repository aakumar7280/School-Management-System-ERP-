import { ReactNode, useEffect, useMemo, useState } from 'react';

import {
  clearFeeTransactionsAsAdmin,
  createFeeInvoice,
  deleteFeeTransactionAsAdmin,
  deleteFeeInvoiceAsAdmin,
  fetchFeeStudents,
  fetchFinanceOverview,
  fetchStudentFeeAssignments,
  FinanceOverview,
  FeeStudentOption,
  generateBulkFeeInvoices,
  payFeeInvoiceAsAdmin,
  recordStudentAdvancePaymentAsAdmin,
  StudentFeeAssignment,
  upsertStudentFeeAssignment
} from '../lib/api';
import { FinanceSectionNav } from '../components/FinanceSectionNav';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function getTodayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function getNextMonthValue(monthValue: string) {
  const [yearPart, monthPart] = monthValue.split('-').map((value) => Number(value));
  if (!Number.isFinite(yearPart) || !Number.isFinite(monthPart)) {
    return getCurrentMonthValue();
  }

  const date = new Date(yearPart, monthPart - 1, 1);
  date.setMonth(date.getMonth() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getEndOfMonthDateValue(monthValue: string) {
  const [yearPart, monthPart] = monthValue.split('-').map((value) => Number(value));
  if (!Number.isFinite(yearPart) || !Number.isFinite(monthPart)) {
    return `${getCurrentMonthValue()}-28`;
  }

  const endOfMonth = new Date(yearPart, monthPart, 0);
  const year = endOfMonth.getFullYear();
  const month = String(endOfMonth.getMonth() + 1).padStart(2, '0');
  const day = String(endOfMonth.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthValueFromDate(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return getCurrentMonthValue();
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function deriveAcademicSessionFromMonth(monthValue: string) {
  const [yearPart, monthPart] = monthValue.split('-').map((value) => Number(value));
  if (!Number.isFinite(yearPart) || !Number.isFinite(monthPart)) {
    return '';
  }

  const sessionStartYear = monthPart >= 4 ? yearPart : yearPart - 1;
  const sessionEndYear = String((sessionStartYear + 1) % 100).padStart(2, '0');
  return `${sessionStartYear}-${sessionEndYear}`;
}

function cadenceLabel(cadence: FeeComponentCadence) {
  if (cadence === 'MONTHLY') return 'Monthly';
  if (cadence === 'YEARLY') return 'Yearly';
  return 'Once in lifetime';
}

function isAnnualFeeInvoiceTitle(title: string) {
  return /^Annual Fee Invoice \(\d{4}-\d{2}\)$/.test(title.trim());
}

function isOneTimeFeeType(feeType: string) {
  const normalized = feeType.trim().toLowerCase();
  return normalized === 'admission fee' || normalized === 'tc fee';
}

function isAdvanceTransactionFeeType(feeType: string | null | undefined) {
  const normalized = (feeType ?? '').trim().toLowerCase();
  return normalized.includes('advance applied') || normalized.includes('auto deduction') || normalized.includes('advance credit');
}

function extractFeeTypeParts(feeType: string | null | undefined) {
  return (feeType ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeFeeTypeKey(feeType: string) {
  return feeType.trim().toLowerCase();
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
type DiscountRow = { id: string; type: 'FLAT' | 'PERCENTAGE'; value: string; reason: string };
type FeeComponentCadence = 'MONTHLY' | 'YEARLY' | 'ONCE';

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
  const [components, setComponents] = useState<Array<{ feeType: string; cadence: FeeComponentCadence; amount: string }>>([]);
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [bulkInvoiceSaving, setBulkInvoiceSaving] = useState(false);
  const [previousDueSaving, setPreviousDueSaving] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [previousDueAmount, setPreviousDueAmount] = useState('');
  const [invoiceTitleDraft, setInvoiceTitleDraft] = useState('');
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);

  const [activePaymentInvoiceId, setActivePaymentInvoiceId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CASH' | 'CHEQUE'>('UPI');
  const [paymentFeeType, setPaymentFeeType] = useState('');
  const [selectedPaymentFeeTypes, setSelectedPaymentFeeTypes] = useState<string[]>([]);
  const [paymentDate, setPaymentDate] = useState(() => getTodayDateValue());
  const [paymentFeeMonth, setPaymentFeeMonth] = useState(() => getCurrentMonthValue());
  const [paymentAcademicSession, setPaymentAcademicSession] = useState(() => deriveAcademicSessionFromMonth(getCurrentMonthValue()));
  const [paymentTransactionId, setPaymentTransactionId] = useState('');
  const [paymentCheckNumber, setPaymentCheckNumber] = useState('');
  const [paymentReceiptNumber, setPaymentReceiptNumber] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentModalMode, setPaymentModalMode] = useState<'regular' | 'advance'>('regular');
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [clearingTransactions, setClearingTransactions] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [invoicePreviewSelectedComponentIds, setInvoicePreviewSelectedComponentIds] = useState<string[]>([]);
  const [invoicePreviewSelectedDiscountIds, setInvoicePreviewSelectedDiscountIds] = useState<string[]>([]);
  const [hasTouchedInvoicePreviewDiscountSelection, setHasTouchedInvoicePreviewDiscountSelection] = useState(false);
  const [invoiceDueThisMonth, setInvoiceDueThisMonth] = useState(true);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activeAccordionPanel, setActiveAccordionPanel] = useState<AccordionPanelKey | null>('studentSelection');
  const [pinnedPanels, setPinnedPanels] = useState<PinnedPanelKey[]>(['summary']);

  const feeTypeOptions = [
    'Tuition Fee',
    'Transport Fee',
    'Admission Fee',
    'Abacus',
    'TC Fee',
    'Meals',
    'Uniform',
    'Sports',
    'Activity Fees',
    'Picnic Fees',
    'Annual Function Fees',
    'Book Set',
    'Notebook Fee',
    'Stationary Fee',
    'Diary',
    'ID Card',
    'Continuation Fee',
    'Lab',
    'Library',
    'Hostel',
    'Exam',
    'Other'
  ];

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
    return allDue
      .filter((invoice) => invoice.student.admissionNo === selectedStudent.admissionNo)
      .sort((left, right) => {
        const dueDateDelta = new Date(right.dueDate).getTime() - new Date(left.dueDate).getTime();
        if (dueDateDelta !== 0) {
          return dueDateDelta;
        }

        const leftCreatedAt = 'createdAt' in left && typeof left.createdAt === 'string' ? new Date(left.createdAt).getTime() : 0;
        const rightCreatedAt = 'createdAt' in right && typeof right.createdAt === 'string' ? new Date(right.createdAt).getTime() : 0;
        if (rightCreatedAt !== leftCreatedAt) {
          return rightCreatedAt - leftCreatedAt;
        }

        return right.due - left.due;
      });
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

  const currentInvoiceMonth = useMemo(() => getCurrentMonthValue(), []);

  const nextMonthLabel = useMemo(() => {
    const [yearPart, monthPart] = getNextMonthValue(currentInvoiceMonth).split('-').map((value) => Number(value));
    const date = new Date(yearPart, monthPart - 1, 1);
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [currentInvoiceMonth]);

  const filteredTransactions = useMemo(() => {
    const allTransactions = overview?.feeTransactions ?? [];
    if (!selectedStudent) return [];
    return allTransactions.filter((transaction) => transaction.student.id === selectedStudent.id);
  }, [overview?.feeTransactions, selectedStudent]);

  const selectedStudentAdvanceBalance = useMemo(() => {
    if (!selectedStudent) return 0;
    const credits = overview?.studentCredits ?? [];
    const studentCredit = credits.find((credit) => credit.studentId === selectedStudent.id);
    return Math.max(studentCredit?.balance ?? 0, 0);
  }, [overview?.studentCredits, selectedStudent]);

  const activePaymentInvoice = useMemo(
    () => filteredDueStudents.find((invoice) => invoice.id === activePaymentInvoiceId) ?? null,
    [activePaymentInvoiceId, filteredDueStudents]
  );

  const paymentFeeBreakdown = useMemo(() => {
    if (!activePaymentInvoice) {
      return [];
    }

    const invoiceComponentBreakdown = activePaymentInvoice.componentBreakdown ?? [];
    if (invoiceComponentBreakdown.length === 0) {
      return [];
    }

    const paidByFeeType = new Map<string, number>();

    filteredTransactions
      .filter((transaction) => transaction.invoice.id === activePaymentInvoice.id)
      .forEach((transaction) => {
        if (isAdvanceTransactionFeeType(transaction.feeType)) {
          return;
        }

        const feeTypeParts = extractFeeTypeParts(transaction.feeType);
        if (feeTypeParts.length === 0) {
          return;
        }

        const splitAmount = transaction.amount / feeTypeParts.length;
        feeTypeParts.forEach((feeTypePart) => {
          paidByFeeType.set(feeTypePart, (paidByFeeType.get(feeTypePart) ?? 0) + splitAmount);
        });
      });

    const assignmentCadenceByFeeType = new Map<string, FeeComponentCadence>();
    (selectedSavedAssignment?.components ?? []).forEach((component) => {
      const key = normalizeFeeTypeKey(component.feeType);
      if (!key) {
        return;
      }

      assignmentCadenceByFeeType.set(key, component.cadence as FeeComponentCadence);
    });

    return invoiceComponentBreakdown
      .map((component) => {
        const feeType = component.feeType;
        const amount = component.amount;
        const snapshotCadence = (component as { cadence?: FeeComponentCadence | null }).cadence;
        const mappedCadence = assignmentCadenceByFeeType.get(normalizeFeeTypeKey(feeType));
        const resolvedCadence = snapshotCadence ?? mappedCadence ?? null;
        const monthlyPayable =
          resolvedCadence === 'MONTHLY'
            ? amount / 12
            : resolvedCadence === 'YEARLY'
              ? amount
              : amount;

        return {
          feeType,
          cadence: resolvedCadence,
          monthlyPayable,
          installmentPayable: amount,
          paidAmount: Math.min(paidByFeeType.get(feeType) ?? 0, amount),
          remainingAmount: Math.max(amount - (paidByFeeType.get(feeType) ?? 0), 0)
        };
      })
      .filter((entry) => entry.remainingAmount > 0.009)
      .sort((left, right) => right.remainingAmount - left.remainingAmount);
  }, [activePaymentInvoice, filteredTransactions, selectedSavedAssignment]);

  const configuredCadenceByFeeType = useMemo(() => {
    const cadenceByFeeType = new Map<string, FeeComponentCadence>();
    (selectedSavedAssignment?.components ?? []).forEach((component) => {
      const key = normalizeFeeTypeKey(component.feeType);
      if (!key) {
        return;
      }

      cadenceByFeeType.set(key, component.cadence as FeeComponentCadence);
    });

    return cadenceByFeeType;
  }, [selectedSavedAssignment]);

  const paidAmountByFeeType = useMemo(() => {
    const totals = new Map<string, number>();

    filteredTransactions.forEach((transaction) => {
      if (isAdvanceTransactionFeeType(transaction.feeType)) {
        return;
      }

      const feeTypeParts = extractFeeTypeParts(transaction.feeType);
      if (feeTypeParts.length === 0) {
        return;
      }

      const splitAmount = transaction.amount / feeTypeParts.length;
      feeTypeParts.forEach((feeTypePart) => {
        const key = normalizeFeeTypeKey(feeTypePart);
        totals.set(key, (totals.get(key) ?? 0) + splitAmount);
      });
    });

    return totals;
  }, [filteredTransactions]);

  const blockedPaidNonMonthlyFeeTypeSet = useMemo(() => {
    const blocked = new Set<string>();

    configuredCadenceByFeeType.forEach((cadence, feeTypeKey) => {
      if (cadence === 'MONTHLY') {
        return;
      }

      const paidAmount = paidAmountByFeeType.get(feeTypeKey) ?? 0;
      if (paidAmount > 0.009) {
        blocked.add(feeTypeKey);
      }
    });

    return blocked;
  }, [configuredCadenceByFeeType, paidAmountByFeeType]);

  const paymentFeeTypeOptions = useMemo(() => {
    const filterBlockedFeeTypes = (items: string[]) =>
      items.filter((item) => item.trim().length > 0 && !blockedPaidNonMonthlyFeeTypeSet.has(normalizeFeeTypeKey(item)));

    if (paymentFeeBreakdown.length > 0) {
      return filterBlockedFeeTypes(Array.from(new Set(paymentFeeBreakdown.map((item) => item.feeType))));
    }

    if (activePaymentInvoice) {
      const invoiceSnapshotFeeTypes = (activePaymentInvoice.componentBreakdown ?? []).map((entry) => entry.feeType);
      const existingInvoiceFeeTypes = filteredTransactions
        .filter((transaction) => transaction.invoice.id === activePaymentInvoice.id)
        .flatMap((transaction) => extractFeeTypeParts(transaction.feeType));

      const preferred = filterBlockedFeeTypes(Array.from(new Set([...selectedPaymentFeeTypes, paymentFeeType, ...invoiceSnapshotFeeTypes, ...existingInvoiceFeeTypes])));
      if (preferred.length > 0) {
        return preferred;
      }

      const assignmentFeeTypes = selectedSavedAssignment?.components.map((component) => component.feeType) ?? [];
      const fallbackFromAssignment = filterBlockedFeeTypes(Array.from(new Set(assignmentFeeTypes)));
      if (fallbackFromAssignment.length > 0) {
        return fallbackFromAssignment;
      }

      return filterBlockedFeeTypes(Array.from(new Set(feeTypeOptions)));
    }

    return filterBlockedFeeTypes(Array.from(new Set([...selectedPaymentFeeTypes, paymentFeeType, ...feeTypeOptions])));
  }, [activePaymentInvoice, blockedPaidNonMonthlyFeeTypeSet, feeTypeOptions, filteredTransactions, paymentFeeBreakdown, paymentFeeType, selectedPaymentFeeTypes, selectedSavedAssignment]);

  useEffect(() => {
    if (paymentFeeTypeOptions.length === 0) {
      if (selectedPaymentFeeTypes.length > 0) {
        setSelectedPaymentFeeTypes([]);
      }
      return;
    }

    setSelectedPaymentFeeTypes((previous) => {
      const normalized = previous.filter((item) => paymentFeeTypeOptions.includes(item));
      const nextSelection = normalized.length > 0 ? normalized : [paymentFeeTypeOptions[0]];

      const unchanged =
        nextSelection.length === previous.length &&
        nextSelection.every((item, index) => item === previous[index]);

      return unchanged ? previous : nextSelection;
    });
  }, [paymentFeeTypeOptions, selectedPaymentFeeTypes]);

  useEffect(() => {
    if (selectedPaymentFeeTypes.length === 0) {
      return;
    }

    if (!selectedPaymentFeeTypes.includes(paymentFeeType)) {
      setPaymentFeeType(selectedPaymentFeeTypes[0]);
    }
  }, [paymentFeeType, selectedPaymentFeeTypes]);

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

  const onceSubtotal = useMemo(
    () =>
      components
        .filter((component) => component.cadence === 'ONCE')
        .reduce((sum, component) => sum + (Number.isFinite(Number(component.amount)) ? Number(component.amount) : 0), 0),
    [components]
  );

  const subtotal = useMemo(() => yearlySubtotal + monthlySubtotal * 12 + onceSubtotal, [yearlySubtotal, monthlySubtotal, onceSubtotal]);

  const yearlyMonthlyDueSubtotal = useMemo(
    () =>
      components
        .filter((component) => component.cadence === 'YEARLY')
        .reduce((sum, component) => {
          const amount = Number(component.amount || 0);
          if (!Number.isFinite(amount) || amount <= 0) {
            return sum;
          }

          return sum + Math.ceil(amount / 12);
        }, 0),
    [components]
  );

  const monthlyDueSubtotal = useMemo(
    () => monthlySubtotal + yearlyMonthlyDueSubtotal + onceSubtotal,
    [monthlySubtotal, yearlyMonthlyDueSubtotal, onceSubtotal]
  );

  const computedDiscountAmount = useMemo(() => {
    const rawDiscountAmount = discounts.reduce((sum, discount) => {
      const parsedValue = Number(discount.value || 0);
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        return sum;
      }

      if (discount.type === 'PERCENTAGE') {
        return sum + (subtotal * parsedValue) / 100;
      }

      return sum + parsedValue;
    }, 0);

    return Math.min(Math.max(rawDiscountAmount, 0), subtotal);
  }, [discounts, subtotal]);

  const finalTotal = useMemo(() => Math.max(subtotal - computedDiscountAmount, 0), [subtotal, computedDiscountAmount]);

  const computedMonthlyDiscountAmount = useMemo(() => {
    const rawDiscountAmount = discounts.reduce((sum, discount) => {
      const parsedValue = Number(discount.value || 0);
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        return sum;
      }

      if (discount.type === 'PERCENTAGE') {
        return sum + (monthlyDueSubtotal * parsedValue) / 100;
      }

      return sum + parsedValue;
    }, 0);

    return Math.min(Math.max(rawDiscountAmount, 0), monthlyDueSubtotal);
  }, [discounts, monthlyDueSubtotal]);

  const finalMonthlyDue = useMemo(
    () => Math.max(monthlyDueSubtotal - computedMonthlyDiscountAmount, 0),
    [computedMonthlyDiscountAmount, monthlyDueSubtotal]
  );

  const summaryFeeTypeRows = useMemo(() => {
    const totalByFeeType = new Map<string, { feeType: string; annualizedTotal: number; cadence: FeeComponentCadence }>();

    components.forEach((component) => {
      const key = normalizeFeeTypeKey(component.feeType);
      if (!key) {
        return;
      }

      const baseAmount = Number(component.amount || 0);
      if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
        return;
      }

      const annualizedAmount = component.cadence === 'MONTHLY' ? baseAmount * 12 : baseAmount;
      const existing = totalByFeeType.get(key);

      if (existing) {
        totalByFeeType.set(key, {
          ...existing,
          annualizedTotal: existing.annualizedTotal + annualizedAmount
        });
        return;
      }

      totalByFeeType.set(key, {
        feeType: component.feeType,
        annualizedTotal: annualizedAmount,
        cadence: component.cadence
      });
    });

    return Array.from(totalByFeeType.entries())
      .map(([key, entry]) => {
        const paidAmount = paidAmountByFeeType.get(key) ?? 0;
        const clampedPaidAmount = Math.min(paidAmount, entry.annualizedTotal);

        return {
          feeType: entry.feeType,
          cadence: entry.cadence,
          annualizedTotal: entry.annualizedTotal,
          paidAmount: clampedPaidAmount,
          remainingAmount: Math.max(entry.annualizedTotal - clampedPaidAmount, 0)
        };
      })
      .sort((left, right) => right.annualizedTotal - left.annualizedTotal);
  }, [components, paidAmountByFeeType]);

  const previewSelectedCurrentMonthPayable = useMemo(() => {
    if (!selectedSavedAssignment) {
      return 0;
    }

    const components = selectedSavedAssignment.components
      .map((component) => {
        const baseAmount = Number(component.amount || 0);
        const monthlyPayable = baseAmount;

        return {
          id: component.id,
          cadence: component.cadence,
          monthlyPayable
        };
      })
      .filter((component) => Number.isFinite(component.monthlyPayable) && component.monthlyPayable > 0);

    const defaultComponentIds = components.map((component) => component.id);
    const fallbackComponentIds = components.map((component) => component.id);
    const effectiveComponentIds =
      invoicePreviewSelectedComponentIds.length > 0
        ? invoicePreviewSelectedComponentIds
        : defaultComponentIds.length > 0
          ? defaultComponentIds
          : fallbackComponentIds;

    const componentSubtotal = components
      .filter((component) => effectiveComponentIds.includes(component.id))
      .reduce((sum, component) => sum + component.monthlyPayable, 0);

    const discounts =
      selectedSavedAssignment.discounts && selectedSavedAssignment.discounts.length > 0
        ? selectedSavedAssignment.discounts
        : selectedSavedAssignment.discount
          ? [selectedSavedAssignment.discount]
          : [];
    const effectiveDiscountIds =
      hasTouchedInvoicePreviewDiscountSelection
        ? invoicePreviewSelectedDiscountIds
        : invoicePreviewSelectedDiscountIds.length > 0
        ? invoicePreviewSelectedDiscountIds
        : discounts.map((discount) => discount.id);

    const rawDiscount = discounts
      .filter((discount) => effectiveDiscountIds.includes(discount.id))
      .reduce((sum, discount) => {
        const value = Number(discount.value || 0);
        if (!Number.isFinite(value) || value <= 0) {
          return sum;
        }

        if (discount.type === 'PERCENTAGE') {
          return sum + (componentSubtotal * value) / 100;
        }

        return sum + value;
      }, 0);

    const discountAmount = Math.min(Math.max(rawDiscount, 0), componentSubtotal);
    return Math.max(componentSubtotal - discountAmount, 0);
  }, [hasTouchedInvoicePreviewDiscountSelection, invoicePreviewSelectedComponentIds, invoicePreviewSelectedDiscountIds, selectedSavedAssignment]);

  const hasCurrentMonthPaymentActivity = useMemo(
    () =>
      filteredTransactions.some((transaction) => {
        const dueDate = new Date(transaction.invoice.dueDate);
        return dueDate >= selectedMonthWindow.start && dueDate < selectedMonthWindow.end;
      }),
    [filteredTransactions, selectedMonthWindow.end, selectedMonthWindow.start]
  );

  const selectedStudentCurrentMonthInvoices = useMemo(() => {
    if (!selectedStudent) {
      return [];
    }

    const periodInvoices = overview?.periodInvoices ?? [];
    return periodInvoices.filter((invoice) => {
      if (invoice.student.id !== selectedStudent.id) {
        return false;
      }

      const dueDate = new Date(invoice.dueDate);
      return dueDate >= selectedMonthWindow.start && dueDate < selectedMonthWindow.end;
    });
  }, [overview?.periodInvoices, selectedMonthWindow.end, selectedMonthWindow.start, selectedStudent]);

  const currentMonthDueFromGeneratedInvoices = useMemo(
    () => selectedStudentCurrentMonthInvoices.reduce((sum, invoice) => sum + invoice.due, 0),
    [selectedStudentCurrentMonthInvoices]
  );

  const hasCurrentMonthInvoiceRecord = selectedStudentCurrentMonthInvoices.length > 0;

  const expectedCurrentMonthDue = useMemo(() => {
    if (hasCurrentMonthInvoiceRecord) {
      return currentMonthDueFromGeneratedInvoices;
    }

    if (hasCurrentMonthPaymentActivity) {
      return 0;
    }

    return previewSelectedCurrentMonthPayable;
  }, [
    currentMonthDueFromGeneratedInvoices,
    hasCurrentMonthInvoiceRecord,
    hasCurrentMonthPaymentActivity,
    previewSelectedCurrentMonthPayable
  ]);

  const grossDueNow = useMemo(() => carryForwardDueTotal + expectedCurrentMonthDue, [carryForwardDueTotal, expectedCurrentMonthDue]);

  const projectedAdvanceAppliedToDue = useMemo(
    () => Math.min(selectedStudentAdvanceBalance, grossDueNow),
    [grossDueNow, selectedStudentAdvanceBalance]
  );

  const netDueNow = useMemo(() => Math.max(grossDueNow - projectedAdvanceAppliedToDue, 0), [projectedAdvanceAppliedToDue, grossDueNow]);

  const paidThisMonthTotal = useMemo(
    () =>
      filteredTransactions
        .filter((transaction) => {
          const transactionDate = new Date(transaction.paymentDate);
          if (transactionDate < selectedMonthWindow.start || transactionDate >= selectedMonthWindow.end) {
            return false;
          }

          const feeType = (transaction.feeType ?? '').toLowerCase();
          const isAutoDeduction = feeType.includes('advance applied') || feeType.includes('auto deduction');
          return !isAutoDeduction;
        })
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    [filteredTransactions, selectedMonthWindow.end, selectedMonthWindow.start]
  );

  const advanceAppliedThisMonth = useMemo(
    () =>
      filteredTransactions
        .filter((transaction) => {
          const transactionDate = new Date(transaction.paymentDate);
          if (transactionDate < selectedMonthWindow.start || transactionDate >= selectedMonthWindow.end) {
            return false;
          }

          const feeType = (transaction.feeType ?? '').toLowerCase();
          return feeType.includes('advance') && !feeType.includes('credit');
        })
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    [filteredTransactions, selectedMonthWindow.end, selectedMonthWindow.start]
  );

  const dueBeforeAdvanceThisMonth = useMemo(
    () => netDueNow + advanceAppliedThisMonth,
    [advanceAppliedThisMonth, netDueNow]
  );

  const hasAdvanceHistory = useMemo(
    () =>
      selectedStudentAdvanceBalance > 0 ||
      filteredTransactions.some((transaction) => (transaction.feeType ?? '').toLowerCase().includes('advance')),
    [filteredTransactions, selectedStudentAdvanceBalance]
  );

  const currentMonthDueModeLabel = useMemo(() => {
    if (hasCurrentMonthInvoiceRecord) {
      return currentMonthDueFromGeneratedInvoices > 0
        ? 'From generated current-month invoices'
        : 'Current-month invoice already settled';
    }

    if (hasCurrentMonthPaymentActivity) {
      return 'Current-month invoice already settled';
    }

    return 'Projected from invoice preview selection';
  }, [currentMonthDueFromGeneratedInvoices, hasCurrentMonthInvoiceRecord, hasCurrentMonthPaymentActivity]);

  const invoicePreviewInstallmentLabel = useMemo(() => {
    return 'Annual';
  }, []);

  const selectedComponentFeeTypes = useMemo(
    () => components.map((component) => component.feeType.trim().toLowerCase()).filter((feeType) => feeType.length > 0),
    [components]
  );

  const previewInvoiceMonth = useMemo(
    () => (invoiceDueThisMonth ? currentInvoiceMonth : getNextMonthValue(currentInvoiceMonth)),
    [currentInvoiceMonth, invoiceDueThisMonth]
  );

  const alreadyInvoicedFeeTypesForPreview = useMemo(() => {
    if (!selectedStudent) {
      return new Set<string>();
    }

    const targetSession = deriveAcademicSessionFromMonth(previewInvoiceMonth);
    const periodInvoices = overview?.periodInvoices ?? [];
    const dueInvoices = overview?.dueStudents ?? [];

    const allStudentInvoices = [
      ...periodInvoices.filter((invoice) => invoice.student.id === selectedStudent.id),
      ...dueInvoices.filter((invoice) => invoice.student.id === selectedStudent.id)
    ];

    const feeTypes = allStudentInvoices
      .filter((invoice) => deriveAcademicSessionFromMonth(invoice.dueDate.slice(0, 7)) === targetSession)
      .flatMap((invoice) => invoice.componentBreakdown ?? [])
      .map((entry) => entry.feeType.trim().toLowerCase())
      .filter((feeType) => feeType.length > 0);

    return new Set(feeTypes);
  }, [overview?.dueStudents, overview?.periodInvoices, previewInvoiceMonth, selectedStudent]);

  const invoicePreviewComponents = useMemo(() => {
    if (!selectedSavedAssignment) {
      return [] as Array<{
        id: string;
        feeType: string;
        cadence: FeeComponentCadence;
        baseAmount: number;
        monthlyPayable: number;
        cyclePayable: number;
      }>;
    }

    return selectedSavedAssignment.components
      .map((component) => {
        const baseAmount = Number(component.amount || 0);
        const monthlyPayable =
          component.cadence === 'MONTHLY'
            ? baseAmount
            : component.cadence === 'YEARLY'
              ? baseAmount
              : baseAmount;
        const cyclePayable = component.cadence === 'MONTHLY' ? baseAmount * 12 : component.cadence === 'YEARLY' ? baseAmount : baseAmount;

        return {
          id: component.id,
          feeType: component.feeType,
          cadence: component.cadence as FeeComponentCadence,
          baseAmount,
          monthlyPayable,
          cyclePayable
        };
      })
      .filter((component) => !alreadyInvoicedFeeTypesForPreview.has(component.feeType.trim().toLowerCase()))
      .filter((component) => Number.isFinite(component.baseAmount) && component.baseAmount > 0)
      .sort((left, right) => right.cyclePayable - left.cyclePayable);
  }, [alreadyInvoicedFeeTypesForPreview, selectedSavedAssignment]);

  const invoicePreviewDiscounts = useMemo(() => {
    if (!selectedSavedAssignment) {
      return [] as Array<{ id: string; type: 'FLAT' | 'PERCENTAGE'; value: number; reason?: string | null }>;
    }

    const discounts =
      selectedSavedAssignment.discounts && selectedSavedAssignment.discounts.length > 0
        ? selectedSavedAssignment.discounts
        : selectedSavedAssignment.discount
          ? [selectedSavedAssignment.discount]
          : [];

    return discounts
      .map((discount) => ({
        id: discount.id,
        type: discount.type,
        value: Number(discount.value || 0),
        reason: discount.reason
      }))
      .filter((discount) => Number.isFinite(discount.value) && discount.value > 0);
  }, [selectedSavedAssignment]);

  const effectiveInvoicePreviewComponentIds = invoicePreviewSelectedComponentIds;

  const effectiveInvoicePreviewDiscountIds =
    hasTouchedInvoicePreviewDiscountSelection
      ? invoicePreviewSelectedDiscountIds
      : invoicePreviewSelectedDiscountIds.length > 0
      ? invoicePreviewSelectedDiscountIds
      : invoicePreviewDiscounts.map((discount) => discount.id);

  const selectedInvoiceComponents = useMemo(
    () => invoicePreviewComponents.filter((component) => effectiveInvoicePreviewComponentIds.includes(component.id)),
    [effectiveInvoicePreviewComponentIds, invoicePreviewComponents]
  );

  const selectedInvoiceComponentSubtotal = useMemo(
    () => selectedInvoiceComponents.reduce((sum, component) => sum + component.cyclePayable, 0),
    [selectedInvoiceComponents]
  );

  const selectedInvoiceDiscounts = useMemo(
    () => invoicePreviewDiscounts.filter((discount) => effectiveInvoicePreviewDiscountIds.includes(discount.id)),
    [effectiveInvoicePreviewDiscountIds, invoicePreviewDiscounts]
  );

  const selectedInvoiceDiscountAmount = useMemo(() => {
    const rawDiscount = selectedInvoiceDiscounts.reduce((sum, discount) => {
      if (discount.type === 'PERCENTAGE') {
        return sum + (selectedInvoiceComponentSubtotal * discount.value) / 100;
      }
      return sum + discount.value;
    }, 0);

    return Math.min(Math.max(rawDiscount, 0), selectedInvoiceComponentSubtotal);
  }, [selectedInvoiceComponentSubtotal, selectedInvoiceDiscounts]);

  const selectedInvoiceNetAmount = useMemo(
    () => Math.max(selectedInvoiceComponentSubtotal - selectedInvoiceDiscountAmount, 0),
    [selectedInvoiceComponentSubtotal, selectedInvoiceDiscountAmount]
  );

  const selectedInvoiceMonthlyComponentSubtotal = useMemo(
    () => selectedInvoiceComponents.reduce((sum, component) => sum + component.monthlyPayable, 0),
    [selectedInvoiceComponents]
  );

  const selectedInvoiceMonthlyDiscountAmount = useMemo(() => {
    if (selectedInvoiceComponentSubtotal <= 0 || selectedInvoiceDiscountAmount <= 0) {
      return 0;
    }

    const proratedDiscount =
      (selectedInvoiceMonthlyComponentSubtotal / selectedInvoiceComponentSubtotal) * selectedInvoiceDiscountAmount;

    return Math.min(Math.max(proratedDiscount, 0), selectedInvoiceMonthlyComponentSubtotal);
  }, [selectedInvoiceComponentSubtotal, selectedInvoiceDiscountAmount, selectedInvoiceMonthlyComponentSubtotal]);

  const selectedInvoiceMonthlyNetAmount = useMemo(
    () => Math.max(selectedInvoiceMonthlyComponentSubtotal - selectedInvoiceMonthlyDiscountAmount, 0),
    [selectedInvoiceMonthlyComponentSubtotal, selectedInvoiceMonthlyDiscountAmount]
  );

  const selectedInvoiceComponentBreakdown = useMemo(() => {
    if (selectedInvoiceComponents.length === 0 || selectedInvoiceNetAmount <= 0) {
      return [] as Array<{ feeType: string; amount: number }>;
    }

    const componentSubtotal = selectedInvoiceComponentSubtotal;
    const groupedAmounts = new Map<string, number>();

    selectedInvoiceComponents.forEach((component) => {
      const baseAmount = Number(component.cyclePayable || 0);
      if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
        return;
      }

      const proportionalDiscount = componentSubtotal > 0 ? (baseAmount / componentSubtotal) * selectedInvoiceDiscountAmount : 0;
      const netAmount = Math.max(baseAmount - proportionalDiscount, 0);
      if (netAmount <= 0) {
        return;
      }

      groupedAmounts.set(component.feeType, (groupedAmounts.get(component.feeType) ?? 0) + netAmount);
    });

    return Array.from(groupedAmounts.entries()).map(([feeType, amount]) => ({
      feeType,
      cadence: selectedInvoiceComponents.find((component) => component.feeType === feeType)?.cadence ?? null,
      amount: Number(amount.toFixed(2))
    }));
  }, [selectedInvoiceComponentSubtotal, selectedInvoiceComponents, selectedInvoiceDiscountAmount, selectedInvoiceNetAmount]);

  const selectedMonthInvoicePayable = useMemo(
    () => Math.max(selectedInvoiceMonthlyNetAmount, 0),
    [selectedInvoiceMonthlyNetAmount]
  );

  const effectiveNextMonthDue = useMemo(
    () => (nextMonthDueTotal > 0 ? nextMonthDueTotal : selectedMonthInvoicePayable),
    [nextMonthDueTotal, selectedMonthInvoicePayable]
  );

  const projectedNextMonthPayable = useMemo(
    () => carryForwardDueTotal + effectiveNextMonthDue,
    [carryForwardDueTotal, effectiveNextMonthDue]
  );

  const currentCalendarMonthWindow = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    return { start, end, nextEnd };
  }, []);

  const previewInvoiceDueDate = useMemo(() => {
    const invoiceMonth = invoiceDueThisMonth ? currentInvoiceMonth : getNextMonthValue(currentInvoiceMonth);
    return getEndOfMonthDateValue(invoiceMonth);
  }, [currentInvoiceMonth, invoiceDueThisMonth]);

  function getDueTypeLabel(dueDateValue: string) {
    const dueDate = new Date(dueDateValue);
    if (dueDate < currentCalendarMonthWindow.start) {
      return 'Carry Forward';
    }

    if (dueDate < currentCalendarMonthWindow.end) {
      return 'Current Month';
    }

    if (dueDate < currentCalendarMonthWindow.nextEnd) {
      return 'Next Month';
    }

    return 'Future';
  }

  function togglePinnedPanel(panel: PinnedPanelKey) {
    setPinnedPanels((previous) => (previous.includes(panel) ? previous.filter((item) => item !== panel) : [...previous, panel]));
  }

  function isPanelPinned(panel: PinnedPanelKey) {
    return pinnedPanels.includes(panel);
  }


  function resetDynamicFeeForm() {
    setBillingCycle('MONTHLY');
    setComponents([]);
    setDiscounts([]);
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

  function fillFormFromAssignment(assignment: StudentFeeAssignment) {
    setSelectedStudentId(assignment.studentId);
    setBillingCycle(assignment.billingCycle);
    setComponents(assignment.components.map((component) => ({ feeType: component.feeType, cadence: component.cadence, amount: String(component.amount) })));
    const assignmentDiscounts =
      assignment.discounts && assignment.discounts.length > 0
        ? assignment.discounts
        : assignment.discount
          ? [assignment.discount]
          : [];

    setDiscounts(
      assignmentDiscounts.map((discount, index) => ({
        id: `${discount.id}-${index + 1}`,
        type: discount.type,
        value: String(discount.value),
        reason: discount.reason ?? ''
      }))
    );
    setAssignmentMessage(null);
    setAssignmentError(null);
  }

  function addFeeComponentRow() {
    setComponents((previous) => [...previous, { feeType: '', cadence: 'YEARLY', amount: '' }]);
  }

  function updateFeeComponentRow(index: number, updates: Partial<{ feeType: string; cadence: FeeComponentCadence; amount: string }>) {
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

  function addDiscountRow() {
    setDiscounts((previous) => [
      ...previous,
      { id: `${Date.now()}-${previous.length}`, type: 'FLAT', value: '', reason: '' }
    ]);
  }

  function updateDiscountRow(discountId: string, updates: Partial<Omit<DiscountRow, 'id'>>) {
    setDiscounts((previous) =>
      previous.map((discount) => (discount.id === discountId ? { ...discount, ...updates } : discount))
    );
  }

  function removeDiscountRow(discountId: string) {
    setDiscounts((previous) => previous.filter((discount) => discount.id !== discountId));
  }

  async function persistAssignment(
    componentsState: Array<{ feeType: string; cadence: FeeComponentCadence; amount: string }>,
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

      const normalizedDiscounts = discounts
        .map((discount) => ({
          type: discount.type,
          value: Number(discount.value || 0),
          reason: discount.reason.trim() || undefined
        }))
        .filter((discount) => Number.isFinite(discount.value) && discount.value > 0);

      await upsertStudentFeeAssignment(selectedStudentId, {
        billingCycle,
        components: normalizedComponents,
        discounts: normalizedDiscounts,
        discount: normalizedDiscounts.length === 1 ? normalizedDiscounts[0] : undefined
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

  function handleOpenInvoicePreview() {
    if (!selectedStudent) {
      setAssignmentError('Please select a student first.');
      return;
    }

    if (!selectedSavedAssignment || selectedSavedAssignment.components.length === 0) {
      setAssignmentError('Save a valid fee structure before generating invoice.');
      return;
    }

    const selectableComponents = selectedSavedAssignment.components
      .map((component) => ({ id: component.id, amount: Number(component.amount || 0), cadence: component.cadence }))
      .filter((component) => Number.isFinite(component.amount) && component.amount > 0)
      .map((component) => component.id);

    if (selectableComponents.length === 0) {
      setAssignmentError('No valid fee components available for invoice generation.');
      return;
    }

    setInvoiceDueThisMonth(true);
    setHasTouchedInvoicePreviewDiscountSelection(true);
    setInvoicePreviewSelectedComponentIds([]);
    setInvoicePreviewSelectedDiscountIds([]);
    setInvoiceTitleDraft(`Annual Fee Invoice (${deriveAcademicSessionFromMonth(currentInvoiceMonth)})`);
    setAssignmentError(null);
    setIsInvoicePreviewOpen(true);
  }

  function handleToggleInvoicePreviewComponent(componentId: string, checked: boolean) {
    setInvoicePreviewSelectedComponentIds((previous) => {
      if (checked) {
        if (previous.includes(componentId)) return previous;
        return [...previous, componentId];
      }

      return previous.filter((id) => id !== componentId);
    });
  }

  function handleToggleInvoicePreviewDiscount(discountId: string, checked: boolean) {
    setHasTouchedInvoicePreviewDiscountSelection(true);
    setInvoicePreviewSelectedDiscountIds((previous) => {
      if (checked) {
        if (previous.includes(discountId)) return previous;
        return [...previous, discountId];
      }

      return previous.filter((id) => id !== discountId);
    });
  }

  async function handleGenerateInvoice() {
    if (!selectedStudent) {
      setAssignmentError('Please select a student first.');
      return;
    }

    if (!selectedSavedAssignment) {
      setAssignmentError('Save a valid fee structure before generating invoice.');
      return;
    }

    if (selectedInvoiceComponents.length === 0) {
      setAssignmentError('Select at least one fee component in the invoice preview.');
      return;
    }

    if (selectedInvoiceNetAmount <= 0) {
      setAssignmentError('Selected invoice amount must be greater than zero. Adjust selected discounts/components.');
      return;
    }

    setInvoiceSaving(true);
    setAssignmentError(null);

    try {
      const invoiceMonth = previewInvoiceDueDate.slice(0, 7);
      const invoiceSession = deriveAcademicSessionFromMonth(invoiceMonth);
      const fallbackTitle = `Annual Fee Invoice (${invoiceSession})`;
      const titleToUse = invoiceTitleDraft.trim() || fallbackTitle;

      await createFeeInvoice({
        admissionNo: selectedStudent.admissionNo,
        title: titleToUse,
        amount: selectedInvoiceNetAmount,
        componentBreakdown: selectedInvoiceComponentBreakdown,
        dueDate: previewInvoiceDueDate
      });
      setMonth(invoiceMonth);
      await loadFinanceData(invoiceMonth);
      setAssignmentMessage('Fee invoice generated successfully.');
      setIsInvoicePreviewOpen(false);
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
        `${response.message} Missing school config: ${skipped.missingSchoolConfig}, invalid annual total: ${skipped.invalidInstallment}, existing annual invoice for session: ${skipped.existingInvoiceForDueDate}.`
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

    const dueDate = getEndOfMonthDateValue(month);

    setPreviousDueSaving(true);
    setAssignmentError(null);

    try {
      await createFeeInvoice({
        admissionNo: selectedStudent.admissionNo,
        title: 'Previous Session Due',
        amount,
        dueDate
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

  function openRecordPayment(invoiceId?: string, mode: 'regular' | 'advance' = 'regular') {
    const invoice = invoiceId ? filteredDueStudents.find((row) => row.id === invoiceId) ?? null : null;
    if (mode === 'regular' && !invoice) return;

    setActivePaymentInvoiceId(invoice?.id ?? null);
    setIsPaymentModalOpen(true);
    setPaymentModalMode(mode);
    setPaymentAmount(mode === 'advance' ? '' : String(invoice?.due ?? ''));
    setPaymentMethod('UPI');
    setPaymentFeeType('');
    setSelectedPaymentFeeTypes([]);
    const targetMonth = invoice ? getMonthValueFromDate(invoice.dueDate) : month;
    setPaymentDate(getTodayDateValue());
    setPaymentFeeMonth(targetMonth);
    setPaymentAcademicSession(deriveAcademicSessionFromMonth(targetMonth));
    setPaymentTransactionId('');
    setPaymentCheckNumber('');
    setPaymentReceiptNumber('');
    setPaymentError(null);
    setPaymentMessage(null);
  }

  function closeRecordPaymentModal() {
    setIsPaymentModalOpen(false);
    setActivePaymentInvoiceId(null);
    setPaymentAmount('');
    setPaymentDate(getTodayDateValue());
    setPaymentFeeMonth(getCurrentMonthValue());
    setPaymentAcademicSession(deriveAcademicSessionFromMonth(getCurrentMonthValue()));
    setPaymentTransactionId('');
    setPaymentCheckNumber('');
    setPaymentReceiptNumber('');
    setPaymentModalMode('regular');
    setSelectedPaymentFeeTypes([]);
  }

  function handleOpenPrimaryPaymentModal() {
    if (filteredDueStudents.length === 0) {
      setPaymentError('No due invoices available for the selected student.');
      return;
    }

    const firstDueInvoice = filteredDueStudents[0];
    openRecordPayment(firstDueInvoice.id, 'regular');
  }

  function handleOpenPrimaryAdvancePaymentModal() {
    if (!selectedStudent) {
      setPaymentError('Please select a student first.');
      return;
    }

    const firstDueInvoice = filteredDueStudents[0];
    openRecordPayment(firstDueInvoice?.id, 'advance');
  }

  function handlePaymentInvoiceChange(invoiceId: string) {
    const normalizedInvoiceId = invoiceId.trim();
    setActivePaymentInvoiceId(normalizedInvoiceId.length > 0 ? normalizedInvoiceId : null);

    const selectedInvoice = normalizedInvoiceId.length > 0
      ? filteredDueStudents.find((row) => row.id === normalizedInvoiceId)
      : undefined;

    if (selectedInvoice) {
      setPaymentAmount(paymentModalMode === 'advance' ? '' : String(selectedInvoice.due));
      const targetMonth = getMonthValueFromDate(selectedInvoice.dueDate);
      setPaymentFeeMonth(targetMonth);
      setPaymentAcademicSession(deriveAcademicSessionFromMonth(targetMonth));
      setPaymentTransactionId('');
      setPaymentCheckNumber('');
      setPaymentReceiptNumber('');
      return;
    }

    if (paymentModalMode === 'advance') {
      setPaymentAmount('');
    }
    setPaymentFeeMonth(month);
    setPaymentAcademicSession(deriveAcademicSessionFromMonth(month));
    setPaymentTransactionId('');
    setPaymentCheckNumber('');
    setPaymentReceiptNumber('');
  }

  function handleTogglePaymentFeeType(nextFeeType: string, checked: boolean) {
    if (checked) {
      setPaymentFeeType(nextFeeType);
    }

    setSelectedPaymentFeeTypes((previous) => {
      if (checked) {
        if (previous.includes(nextFeeType)) {
          return previous;
        }
        return [...previous, nextFeeType];
      }

      return previous.filter((item) => item !== nextFeeType);
    });
  }

  function handlePaymentFeeMonthChange(nextMonthValue: string) {
    setPaymentFeeMonth(nextMonthValue);
    setPaymentAcademicSession(deriveAcademicSessionFromMonth(nextMonthValue));
  }

  const paymentReferenceLabel = paymentMethod === 'CHEQUE' ? 'Check Number' : paymentMethod === 'UPI' ? 'Transaction ID' : null;

  const paymentReferenceValue = paymentMethod === 'CHEQUE' ? paymentCheckNumber : paymentTransactionId;

  function handlePaymentReferenceChange(nextValue: string) {
    if (paymentMethod === 'CHEQUE') {
      setPaymentCheckNumber(nextValue);
      return;
    }

    if (paymentMethod === 'UPI') {
      setPaymentTransactionId(nextValue);
    }
  }

  useEffect(() => {
    if (!activePaymentInvoice || selectedPaymentFeeTypes.length === 0) {
      return;
    }

    const selectedBreakdownRows = paymentFeeBreakdown.filter((entry) => selectedPaymentFeeTypes.includes(entry.feeType));
    if (selectedBreakdownRows.length > 0) {
      const remainingAmount = selectedBreakdownRows.reduce((sum, entry) => sum + entry.remainingAmount, 0);
      setPaymentAmount(String(Math.min(activePaymentInvoice.due, remainingAmount)));
    }
  }, [activePaymentInvoice, paymentFeeBreakdown, selectedPaymentFeeTypes]);

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

    if (!paymentDate || !paymentFeeMonth) {
      setPaymentError('Select payment date and fee month before saving.');
      return;
    }

    if (paymentMethod === 'UPI' && paymentTransactionId.trim().length === 0) {
      setPaymentError('Transaction ID is required for UPI payments.');
      return;
    }

    if (paymentMethod === 'CHEQUE' && paymentCheckNumber.trim().length === 0) {
      setPaymentError('Check number is required for cheque payments.');
      return;
    }

    if (selectedPaymentFeeTypes.length === 0) {
      setPaymentError('Select at least one fee type before saving.');
      return;
    }

    const selectedBreakdownRows = paymentFeeBreakdown.filter((entry) => selectedPaymentFeeTypes.includes(entry.feeType));
    const selectedRemainingAmount = selectedBreakdownRows.reduce((sum, entry) => sum + entry.remainingAmount, 0);

    if (selectedBreakdownRows.length > 0 && typedAmount - selectedRemainingAmount > 0.009) {
      setPaymentError('Payment amount exceeds the remaining due for the selected fee type(s).');
      return;
    }

    setPaymentSaving(true);
    setPaymentMessage(null);
    setPaymentError(null);

    try {
      const feeTypeAllocations = (() => {
        if (selectedBreakdownRows.length === 0) {
          const weightedSelection = selectedPaymentFeeTypes
            .map((feeType) => {
              const weight = (selectedSavedAssignment?.components ?? [])
                .filter((component) => normalizeFeeTypeKey(component.feeType) === normalizeFeeTypeKey(feeType))
                .reduce((sum, component) => {
                  const baseAmount = Number(component.amount || 0);
                  if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
                    return sum;
                  }

                  // For monthly components, derive annualized weight to match invoice-generation math.
                  const annualizedAmount = component.cadence === 'MONTHLY' ? baseAmount * 12 : baseAmount;
                  return sum + annualizedAmount;
                }, 0);

              return {
                feeType,
                weight
              };
            })
            .filter((entry) => entry.weight > 0.009);

          if (weightedSelection.length > 0) {
            const totalWeight = weightedSelection.reduce((sum, entry) => sum + entry.weight, 0);
            let remainingAmount = typedAmount;

            return weightedSelection
              .map((entry, index) => {
                const isLast = index === weightedSelection.length - 1;
                const proportionalAmount = isLast
                  ? remainingAmount
                  : Number(((typedAmount * entry.weight) / totalWeight).toFixed(2));
                const normalizedAmount = Math.max(Math.min(proportionalAmount, remainingAmount), 0);
                remainingAmount = Math.max(remainingAmount - normalizedAmount, 0);

                return {
                  feeType: entry.feeType,
                  amount: normalizedAmount
                };
              })
              .filter((entry) => entry.amount > 0.009);
          }

          const equalShare = typedAmount / selectedPaymentFeeTypes.length;
          return selectedPaymentFeeTypes
            .map((feeType, index) => ({
              feeType,
              amount: index === selectedPaymentFeeTypes.length - 1 ? typedAmount - equalShare * index : equalShare
            }))
            .filter((entry) => entry.amount > 0.009);
        }

        const rowsBySelection = selectedPaymentFeeTypes
          .map((feeType) => selectedBreakdownRows.find((entry) => entry.feeType === feeType))
          .filter((entry): entry is (typeof selectedBreakdownRows)[number] => Boolean(entry));

        const selectedRemainingTotal = rowsBySelection.reduce((sum, entry) => sum + entry.remainingAmount, 0);
        const selectedAllAvailableFeeTypes = rowsBySelection.length === paymentFeeBreakdown.length && paymentFeeBreakdown.length > 0;
        const payingSelectedDueFully = Math.abs(typedAmount - selectedRemainingTotal) <= 0.009;

        // Full payment across all selected fee types should follow their exact due split.
        if (selectedAllAvailableFeeTypes && payingSelectedDueFully) {
          return rowsBySelection
            .map((entry) => ({
              feeType: entry.feeType,
              amount: entry.remainingAmount
            }))
            .filter((entry) => entry.amount > 0.009);
        }

        const working = rowsBySelection.map((entry) => ({
          feeType: entry.feeType,
          capacity: entry.remainingAmount,
          amount: 0
        }));

        let remainingAmount = typedAmount;

        while (remainingAmount > 0.009) {
          const activeRows = working.filter((entry) => entry.capacity - entry.amount > 0.009);
          if (activeRows.length === 0) {
            break;
          }

          const share = remainingAmount / activeRows.length;
          let progressed = false;

          activeRows.forEach((entry) => {
            if (remainingAmount <= 0.009) {
              return;
            }

            const available = Math.max(entry.capacity - entry.amount, 0);
            if (available <= 0.009) {
              return;
            }

            const allocationAmount = Math.min(share, available, remainingAmount);
            if (allocationAmount <= 0.009) {
              return;
            }

            entry.amount += allocationAmount;
            remainingAmount -= allocationAmount;
            progressed = true;
          });

          if (!progressed) {
            break;
          }
        }

        if (remainingAmount > 0.009) {
          const fallbackRows = working
            .filter((entry) => entry.capacity - entry.amount > 0.009)
            .sort((left, right) => (right.capacity - right.amount) - (left.capacity - left.amount));

          for (const entry of fallbackRows) {
            if (remainingAmount <= 0.009) {
              break;
            }

            const available = Math.max(entry.capacity - entry.amount, 0);
            if (available <= 0.009) {
              continue;
            }

            const allocationAmount = Math.min(available, remainingAmount);
            entry.amount += allocationAmount;
            remainingAmount -= allocationAmount;
          }
        }

        return working
          .map((entry) => ({ feeType: entry.feeType, amount: entry.amount }))
          .filter((entry) => entry.amount > 0.009);
      })();

      const combinedFeeTypeLabel = feeTypeAllocations.map((entry) => entry.feeType).join(', ');
      const normalizedReceiptNumber = paymentReceiptNumber.trim();

      await payFeeInvoiceAsAdmin(invoice.id, {
        amount: typedAmount,
        paymentMethod,
        feeType: combinedFeeTypeLabel || paymentFeeType.trim() || undefined,
        feeTypeAllocations,
        paymentDate,
        feeMonth: paymentFeeMonth,
        academicSession: paymentAcademicSession.trim() || undefined,
        transactionId: paymentMethod === 'CASH' ? normalizedReceiptNumber || undefined : paymentTransactionId.trim() || undefined,
        checkNumber: paymentCheckNumber.trim() || undefined
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

  async function handleRecordAdvancePayment() {
    if (!selectedStudent) {
      setPaymentError('Please select a student first.');
      return;
    }

    const typedAmount = Number(paymentAmount);
    if (!Number.isFinite(typedAmount) || typedAmount <= 0) {
      setPaymentError('Enter a valid advance amount greater than 0.');
      return;
    }

    if (!paymentDate || !paymentFeeMonth) {
      setPaymentError('Select payment date and fee month before saving.');
      return;
    }

    if (paymentMethod === 'UPI' && paymentTransactionId.trim().length === 0) {
      setPaymentError('Transaction ID is required for UPI payments.');
      return;
    }

    if (paymentMethod === 'CHEQUE' && paymentCheckNumber.trim().length === 0) {
      setPaymentError('Check number is required for cheque payments.');
      return;
    }

    setPaymentSaving(true);
    setPaymentMessage(null);
    setPaymentError(null);

    try {
      const combinedFeeTypeLabel = Array.from(
        new Set(
          selectedPaymentFeeTypes
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        )
      ).join(', ');

      const normalizedReceiptNumber = paymentReceiptNumber.trim();

      const response = await recordStudentAdvancePaymentAsAdmin(selectedStudent.id, {
        amount: typedAmount,
        paymentMethod,
        feeType: combinedFeeTypeLabel || paymentFeeType.trim() || undefined,
        paymentDate,
        feeMonth: paymentFeeMonth,
        academicSession: paymentAcademicSession.trim() || undefined,
        transactionId: paymentMethod === 'CASH' ? normalizedReceiptNumber || undefined : paymentTransactionId.trim() || undefined,
        checkNumber: paymentCheckNumber.trim() || undefined,
        sourceInvoiceId:
          typeof activePaymentInvoiceId === 'string' && activePaymentInvoiceId.trim().length > 0
            ? activePaymentInvoiceId
            : undefined
      });

      await loadFinanceData(month);
      setPaymentMessage(response.message);
      closeRecordPaymentModal();
    } catch (saveError) {
      setPaymentError(saveError instanceof Error ? saveError.message : 'Failed to record advance payment');
    } finally {
      setPaymentSaving(false);
    }
  }

  async function handleDeleteDue(invoiceId: string) {
    const invoice = filteredDueStudents.find((row) => row.id === invoiceId);
    const invoiceSummary = invoice
      ? `${invoice.title} | ${new Date(invoice.dueDate).toLocaleDateString()} | ${formatCurrency(invoice.due)}`
      : 'Selected due record';
    const shouldDelete = window.confirm(`Delete only this invoice?\n${invoiceSummary}`);
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

  async function handleDeleteTransaction(transactionId: string) {
    const shouldDelete = window.confirm('Delete this transaction log entry? Invoice balances will be recalculated automatically.');
    if (!shouldDelete) return;

    setDeletingTransactionId(transactionId);
    setPaymentError(null);
    setPaymentMessage(null);

    try {
      await deleteFeeTransactionAsAdmin(transactionId);
      await loadFinanceData(month);
      setPaymentMessage('Transaction deleted successfully.');
    } catch (deleteError) {
      setPaymentError(deleteError instanceof Error ? deleteError.message : 'Failed to delete transaction');
    } finally {
      setDeletingTransactionId(null);
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
          <p>Final Yearly Due: <span className="font-semibold">{formatCurrency(finalTotal)}</span></p>
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
          <span>{component.feeType || 'Unselected Fee Type'} ({cadenceLabel(component.cadence)})</span>
          <span className="font-medium text-brand-navy">{formatCurrency(Number(component.amount || 0))}</span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-slate-200/80 pt-2">
        <span>Subtotal (Yearly Due)</span>
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
        <span>One-Time Components Total</span>
        <span className="font-medium text-brand-navy">{formatCurrency(onceSubtotal)}</span>
      </div>
      {discounts
        .filter((discount) => {
          const parsedValue = Number(discount.value || 0);
          return Number.isFinite(parsedValue) && parsedValue > 0;
        })
        .map((discount) => {
          const parsedValue = Number(discount.value || 0);
          const resolvedAmount = discount.type === 'PERCENTAGE' ? (subtotal * parsedValue) / 100 : parsedValue;
          return (
            <div key={`summary-discount-${discount.id}`} className="flex items-center justify-between text-xs">
              <span>
                {discount.reason.trim() || 'Discount'} ({discount.type === 'PERCENTAGE' ? `${parsedValue}%` : formatCurrency(parsedValue)})
              </span>
              <span className="font-medium text-brand-navy">- {formatCurrency(resolvedAmount)}</span>
            </div>
          );
        })}
      <div className="flex items-center justify-between">
        <span>Total Discount</span>
        <span className="font-medium text-brand-navy">- {formatCurrency(computedDiscountAmount)}</span>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200/80 pt-2 text-base">
        <span className="font-semibold text-brand-navy">Final Yearly Due</span>
        <span className="text-xl font-bold text-brand-navy">{formatCurrency(finalTotal)}</span>
      </div>
    </div>
  );

  const feePaymentProgressContent = (
    <section className="rounded-xl border border-slate-200/80 shadow-card bg-white p-4">
      <h4 className="font-semibold text-brand-navy">Fee Payment Progress</h4>
      <div className="mt-2 rounded-md border border-slate-200 bg-white">
        <div className="grid grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-200/80 bg-slate-50/80 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span className="pr-2 whitespace-nowrap">Fee Type</span>
          <span className="text-right whitespace-nowrap">Paid</span>
          <span className="text-right whitespace-nowrap">Left</span>
        </div>
        {summaryFeeTypeRows.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-500">Add fee components to view paid-vs-remaining status.</p>
        ) : (
          summaryFeeTypeRows.map((row) => (
            <div
              key={`summary-fee-progress-${row.feeType}`}
              className="grid grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-100 px-2 py-2 text-sm last:border-b-0"
            >
              <span className="truncate pr-2 leading-5 text-slate-700" title={`${row.feeType} (${cadenceLabel(row.cadence)})`}>{row.feeType} ({cadenceLabel(row.cadence)})</span>
              <span className="text-right text-emerald-700 tabular-nums whitespace-nowrap">{formatCurrency(row.paidAmount)}</span>
              <span className="text-right font-semibold text-brand-navy tabular-nums whitespace-nowrap">{formatCurrency(row.remainingAmount)}</span>
            </div>
          ))
        )}
      </div>
    </section>
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

      <section className="rounded-2xl border border-brand-sky/40 bg-gradient-to-r from-brand-sky/10 via-white to-brand-orange/10 p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quick Due Snapshot</p>
            <h3 className="mt-1 text-xl font-bold text-brand-navy">
              {selectedStudent
                ? `${selectedStudent.firstName} ${selectedStudent.lastName} - ${month}`
                : `Select a student to see due for ${month}`}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              One-line view after discounts and advance adjustment so you do not need to open multiple subtabs.
            </p>
          </div>
          <div className="rounded-xl border border-brand-navy/20 bg-white px-5 py-4 text-right">
            <p className="text-xs uppercase tracking-wider text-slate-500">Net Due Now</p>
            <p className="mt-1 text-3xl font-bold text-brand-navy">{formatCurrency(selectedStudent ? netDueNow : 0)}</p>
            <p className="mt-1 text-xs text-slate-500">{selectedStudent ? currentMonthDueModeLabel : 'Waiting for student selection'}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">Carry Forward Due</p>
            <p className="font-semibold text-brand-navy">{formatCurrency(selectedStudent ? carryForwardDueTotal : 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">Advance Balance</p>
            <p className="font-semibold text-brand-navy">{formatCurrency(selectedStudent ? selectedStudentAdvanceBalance : 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">Paid This Month</p>
            <p className="font-semibold text-brand-navy">{formatCurrency(selectedStudent ? paidThisMonthTotal : 0)}</p>
          </div>
          {selectedStudent && hasAdvanceHistory ? (
            <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">Advance Applied</p>
              <p className="font-semibold text-brand-navy">- {formatCurrency(advanceAppliedThisMonth)}</p>
            </div>
          ) : null}
          {selectedStudent && hasAdvanceHistory ? (
            <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">Due Before Advance</p>
              <p className="font-semibold text-brand-navy">{formatCurrency(dueBeforeAdvanceThisMonth)}</p>
            </div>
          ) : null}
        </div>
      </section>

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
                  {components.map((component, index) => {
                    const oneTimeOnly = component.feeType.trim().length > 0 && isOneTimeFeeType(component.feeType);
                    const currentFeeType = component.feeType.trim().toLowerCase();
                    const duplicateFeeTypes = new Set(
                      selectedComponentFeeTypes.filter((feeType, feeTypeIndex) => feeTypeIndex !== index)
                    );

                    return (
                      <div key={`${component.feeType}-${component.cadence}-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-12">
                        <select
                          className="rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white md:col-span-4"
                          value={component.feeType}
                          onChange={(event) => {
                            const nextFeeType = event.target.value;
                            if (!nextFeeType) {
                              updateFeeComponentRow(index, { feeType: '' });
                              return;
                            }

                            updateFeeComponentRow(index, {
                              feeType: nextFeeType,
                              cadence: isOneTimeFeeType(nextFeeType)
                                ? 'ONCE'
                                : component.cadence === 'ONCE'
                                  ? 'YEARLY'
                                  : component.cadence
                            });
                          }}
                        >
                          <option value="" disabled={component.feeType.trim().length > 0}>Select your fee type</option>
                          {feeTypeOptions.map((option) => (
                            <option key={option} value={option} disabled={duplicateFeeTypes.has(option.toLowerCase()) && option.toLowerCase() !== currentFeeType}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <select
                          className="rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white md:col-span-3"
                          value={component.cadence}
                          onChange={(event) => updateFeeComponentRow(index, { cadence: event.target.value as FeeComponentCadence })}
                          disabled={oneTimeOnly || component.feeType.trim().length === 0}
                          title={oneTimeOnly ? 'Admission Fee and TC Fee are always one-time.' : component.feeType.trim().length === 0 ? 'Select a fee type first.' : undefined}
                        >
                          <option value="YEARLY">Yearly</option>
                          <option value="MONTHLY">Monthly</option>
                          <option value="ONCE">Once in lifetime</option>
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
                    );
                  })}
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
              <div className="space-y-3">
                {discounts.length === 0 ? <p className="text-sm text-slate-500">No discounts added yet.</p> : null}
                {discounts.map((discount) => (
                  <div key={discount.id} className="grid grid-cols-1 gap-2 md:grid-cols-12">
                    <select
                      className="rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white md:col-span-3"
                      value={discount.type}
                      onChange={(event) => updateDiscountRow(discount.id, { type: event.target.value as 'FLAT' | 'PERCENTAGE' })}
                    >
                      <option value="FLAT">Flat Amount (₹)</option>
                      <option value="PERCENTAGE">Percentage (%)</option>
                    </select>
                    <input
                      className="rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white md:col-span-3"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={discount.type === 'PERCENTAGE' ? 'Discount %' : 'Discount amount'}
                      value={discount.value}
                      onChange={(event) => updateDiscountRow(discount.id, { value: event.target.value })}
                    />
                    <input
                      className="rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white md:col-span-5"
                      type="text"
                      placeholder="Reason (optional)"
                      value={discount.reason}
                      onChange={(event) => updateDiscountRow(discount.id, { reason: event.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeDiscountRow(discount.id)}
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 md:col-span-1"
                    >
                      X
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addDiscountRow}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50"
                >
                  + Add Discount
                </button>
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
                <div className="rounded-md border border-brand-orange/40 bg-brand-orange/5 px-3 py-2 text-sm">Selected Monthly Due Payable: <span className="font-semibold text-brand-navy">{formatCurrency(selectedMonthInvoicePayable)}</span></div>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
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
                <button
                  type="button"
                  onClick={handleAddPreviousDue}
                  disabled={previousDueSaving || !selectedStudent}
                  className="rounded-md border border-brand-orange/30 bg-brand-orange/10 px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-orange/20 disabled:opacity-60"
                >
                  {previousDueSaving ? 'Adding Previous Due...' : 'Add Previous Due'}
                </button>
              </div>

              <p className="text-xs text-slate-500">Use this for existing students with outstanding fees from earlier sessions/months. Due date is automatically set to the selected month end, and the balance will carry forward until paid.</p>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
                <h5 className="font-semibold text-brand-navy">Selected Student Pending Invoices</h5>
                <p className="mt-1 text-xs text-slate-500">Outstanding invoices are listed directly below so payments can be recorded against the exact invoice items that were generated.</p>

                <div className="mt-3 max-h-56 overflow-auto rounded-md border border-slate-200/80 bg-white">
                  <table className="min-w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80">
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Invoice No.</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Invoice</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Due</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Due Date</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDueStudents.map((invoice) => {
                        const dueType = getDueTypeLabel(invoice.dueDate);

                        return (
                          <tr key={`pending-invoice-${invoice.id}`} className="border-b border-slate-100">
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{invoice.invoiceNumber ?? '-'}</td>
                            <td className="px-3 py-2 text-slate-700">{invoice.title}</td>
                            <td className="px-3 py-2 font-semibold text-brand-navy">{formatCurrency(invoice.due)}</td>
                            <td className="px-3 py-2 text-slate-600">{new Date(invoice.dueDate).toLocaleDateString()}</td>
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
                    onClick={handleOpenInvoicePreview}
                    disabled={invoiceSaving || !selectedStudent || !selectedSavedAssignment}
                    className="rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60"
                  >
                    {invoiceSaving ? 'Generating Invoice...' : 'Preview & Generate Invoice'}
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
        <div className="max-h-64 overflow-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Admission No</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Student</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Class</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice No.</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due Date</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due Type</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredDueStudents.map((invoice) => {
                const dueType = getDueTypeLabel(invoice.dueDate);
                const dueTypeClassName =
                  dueType === 'Carry Forward'
                    ? 'border-brand-orange/40 bg-brand-orange/10'
                    : dueType === 'Current Month'
                      ? 'border-brand-sky/40 bg-brand-sky/10'
                      : dueType === 'Next Month'
                        ? 'border-emerald-300/50 bg-emerald-50'
                        : 'border-slate-300/60 bg-slate-100/70';

                return (
                  <tr key={invoice.id} className="border-b border-slate-100 table-row-hover">
                    <td className="px-4 py-3">{invoice.student.admissionNo}</td>
                    <td className="px-4 py-3">{invoice.student.name}</td>
                    <td className="px-4 py-3">{invoice.student.className} / {invoice.student.section}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{invoice.invoiceNumber ?? '-'}</td>
                    <td className="px-4 py-3">{invoice.title}</td>
                    <td className="px-4 py-3 font-semibold text-brand-navy">{formatCurrency(invoice.due)}</td>
                    <td className="px-4 py-3">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold text-brand-navy ${dueTypeClassName}`}>{dueType}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openRecordPayment(invoice.id, 'regular')}
                          className="rounded-md bg-brand-navy px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60"
                        >
                          Record Payment
                        </button>
                        <button
                          type="button"
                          onClick={() => openRecordPayment(invoice.id, 'advance')}
                          className="rounded-md border border-brand-navy/30 px-2 py-1 text-xs font-semibold text-brand-navy hover:bg-brand-navy/5 disabled:opacity-60"
                        >
                          Record Advance
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
                );
              })}
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
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Paid On</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Fee Month</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Session</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice No.</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Fee Type</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Mode</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Paid</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Due After Payment</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((transaction) => {
                const isAdvanceEntry = isAdvanceTransactionFeeType(transaction.feeType);

                return (
                  <tr key={transaction.id} className="border-b border-slate-100 table-row-hover">
                    <td className="px-4 py-3">
                      <p>{new Date(transaction.paymentDate).toLocaleDateString()}</p>
                      <p className="text-xs text-slate-400">Logged: {new Date(transaction.createdAt).toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-3">{transaction.feeMonth ?? '-'}</td>
                    <td className="px-4 py-3">{transaction.academicSession ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{transaction.invoice.invoiceNumber ?? '-'}</td>
                    <td className="px-4 py-3">{transaction.invoice.title}</td>
                    <td className="px-4 py-3">
                      {(transaction.feeType ?? '').toLowerCase().includes('advance applied')
                        ? 'Advance Deducted From Balance'
                        : transaction.feeType ?? 'General'}
                    </td>
                    <td className="px-4 py-3">{transaction.paymentMethod}</td>
                    <td className="px-4 py-3 font-semibold text-brand-navy">{formatCurrency(transaction.amount)}</td>
                    <td className="px-4 py-3">{formatCurrency(transaction.invoice.due)}</td>
                    <td className="px-4 py-3">{transaction.invoice.status}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteTransaction(transaction.id)}
                        disabled={isAdvanceEntry || deletingTransactionId === transaction.id}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        title={isAdvanceEntry ? 'Advance-related entries cannot be deleted individually.' : 'Delete this transaction'}
                      >
                        {deletingTransactionId === transaction.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                );
              })}
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
            <div className="mt-2 rounded-md border border-brand-sky/30 bg-brand-sky/10 px-3 py-2 text-xs text-brand-navy">
              Advance Balance: <span className="font-semibold">{formatCurrency(selectedStudentAdvanceBalance)}</span>
            </div>
            <button
              type="button"
              onClick={handleOpenPrimaryPaymentModal}
              disabled={filteredDueStudents.length === 0 || paymentSaving}
              className="mt-3 w-full rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60"
            >
              Record Payment
            </button>
            <button
              type="button"
              onClick={handleOpenPrimaryAdvancePaymentModal}
              disabled={!selectedStudent || paymentSaving}
              className="mt-2 w-full rounded-md border border-brand-navy/30 px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-navy/5 disabled:opacity-60"
            >
              Record Advance Payment
            </button>
          </section>

          {feePaymentProgressContent}

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

      {isInvoicePreviewOpen && selectedStudent && selectedSavedAssignment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-brand-navy">Invoice Preview</h4>
                <p className="text-xs text-slate-500">Review invoice details and annual fee breakdown before generation.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsInvoicePreviewOpen(false)}
                className="rounded-md border border-slate-200 px-3 py-1 text-sm text-brand-navy hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-4">
              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <p>
                  Student: <span className="font-semibold text-brand-navy">{selectedStudent.firstName} {selectedStudent.lastName}</span>
                </p>
                <p>
                  Admission No: <span className="font-semibold text-brand-navy">{selectedStudent.admissionNo}</span>
                </p>
                <p>
                  Class/Section: <span className="font-semibold text-brand-navy">{selectedStudent.className}/{selectedStudent.section}</span>
                </p>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Invoice Title</label>
                  <input
                    className="w-full rounded-md border border-slate-200/80 bg-white px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
                    type="text"
                    value={invoiceTitleDraft}
                    onChange={(event) => setInvoiceTitleDraft(event.target.value)}
                    placeholder={`Annual Fee Invoice (${deriveAcademicSessionFromMonth(previewInvoiceDueDate.slice(0, 7))})`}
                  />
                </div>
                <p>
                  Billing Cycle: <span className="font-semibold text-brand-navy">{selectedSavedAssignment.billingCycle}</span>
                </p>
                <p>
                  Selected Annual Invoice Amount: <span className="font-semibold text-brand-navy">{formatCurrency(selectedInvoiceNetAmount)}</span>
                </p>
              </div>
              <div className="mt-3 rounded-md border border-slate-200/80 bg-white px-3 py-2 text-xs text-slate-600">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={invoiceDueThisMonth}
                    onChange={(event) => setInvoiceDueThisMonth(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-navy focus:ring-brand-sky"
                  />
                  <span>
                    This month ({month})
                  </span>
                </label>
                <p className="mt-1 text-slate-500">
                  {invoiceDueThisMonth
                    ? `Checked: invoice due date will be set in ${month}.`
                    : `Unchecked: invoice due date will be set in ${nextMonthLabel}.`}
                </p>
                <p className="mt-1 text-slate-500">Selected due date: <span className="font-semibold text-brand-navy">{previewInvoiceDueDate}</span></p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200/80 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h5 className="text-sm font-semibold text-brand-navy">Select Fee Components For This Invoice</h5>
              </div>
              <div className="max-h-56 overflow-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Select</th>
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Fee Type</th>
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Cadence</th>
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Payable</th>
                      <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{invoicePreviewInstallmentLabel} Payable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicePreviewComponents.map((component) => (
                      <tr key={`invoice-preview-row-${component.id}`} className="border-b border-slate-100">
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={invoicePreviewSelectedComponentIds.includes(component.id)}
                            onChange={(event) => handleToggleInvoicePreviewComponent(component.id, event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-navy focus:ring-brand-sky"
                          />
                        </td>
                        <td className="px-4 py-2 text-slate-700">{component.feeType}</td>
                        <td className="px-4 py-2 text-slate-600">{cadenceLabel(component.cadence)}</td>
                        <td className="px-4 py-2 text-slate-700">{component.cadence === 'ONCE' ? '-' : formatCurrency(component.monthlyPayable)}</td>
                        <td className="px-4 py-2 font-semibold text-brand-navy">{formatCurrency(component.cyclePayable)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {invoicePreviewComponents.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">No fee components available for preview.</p> : null}
              </div>
            </div>

            {invoicePreviewDiscounts.length > 0 ? (
              <div className="mt-4 rounded-lg border border-slate-200/80 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h5 className="text-sm font-semibold text-brand-navy">Select Discount Components</h5>
                </div>
                <div className="max-h-40 overflow-auto">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80">
                        <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Select</th>
                        <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Discount</th>
                        <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Type</th>
                        <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoicePreviewDiscounts.map((discount) => {
                        const impact =
                          discount.type === 'PERCENTAGE'
                            ? (selectedInvoiceComponentSubtotal * discount.value) / 100
                            : discount.value;
                        return (
                          <tr key={`invoice-preview-discount-${discount.id}`} className="border-b border-slate-100">
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={invoicePreviewSelectedDiscountIds.includes(discount.id)}
                                onChange={(event) => handleToggleInvoicePreviewDiscount(discount.id, event.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-brand-navy focus:ring-brand-sky"
                              />
                            </td>
                            <td className="px-4 py-2 text-slate-700">{discount.reason?.trim() || 'Discount'}</td>
                            <td className="px-4 py-2 text-slate-600">{discount.type === 'PERCENTAGE' ? `${discount.value}%` : 'Flat'}</td>
                            <td className="px-4 py-2 font-semibold text-brand-navy">- {formatCurrency(Math.min(impact, selectedInvoiceComponentSubtotal))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-lg border border-slate-200/80 bg-slate-50/60 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Selected {invoicePreviewInstallmentLabel} Subtotal</span>
                <span className="font-semibold text-brand-navy">{formatCurrency(selectedInvoiceComponentSubtotal)}</span>
              </div>
              {selectedInvoiceDiscounts.length > 0 ? (
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  {selectedInvoiceDiscounts.map((discount) => (
                    <div key={`invoice-preview-discount-${discount.id}`} className="flex items-center justify-between">
                      <span>{discount.reason?.trim() || 'Discount'} ({discount.type === 'PERCENTAGE' ? `${discount.value}%` : formatCurrency(discount.value)})</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-600">Selected Discount Applied ({invoicePreviewInstallmentLabel})</span>
                <span className="font-semibold text-brand-navy">- {formatCurrency(selectedInvoiceDiscountAmount)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="font-semibold text-brand-navy">Net {invoicePreviewInstallmentLabel} Invoice</span>
                <span className="text-base font-bold text-brand-navy">{formatCurrency(selectedInvoiceNetAmount)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-600">Net Payable For This Invoice</span>
                <span className="font-semibold text-brand-navy">{formatCurrency(selectedInvoiceNetAmount)}</span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsInvoicePreviewOpen(false)}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-brand-navy hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateInvoice}
                disabled={invoiceSaving || selectedInvoiceComponents.length === 0 || selectedInvoiceNetAmount <= 0}
                className="rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60"
              >
                {invoiceSaving ? 'Generating Invoice...' : 'Confirm & Generate Invoice'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPaymentModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200/80 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-semibold text-brand-navy">{paymentModalMode === 'advance' ? 'Record Advance Payment' : 'Record Fee Payment'}</h4>
                <p className="text-xs text-slate-500">
                  {paymentModalMode === 'advance'
                    ? 'Advance amount will settle selected and pending dues first. Remaining balance carries forward automatically.'
                    : 'Select payment details and submit.'}
                </p>
                {paymentModalMode === 'advance' ? (
                  <p className="mt-1 text-xs text-brand-navy">
                    Current Advance Balance: <span className="font-semibold">{formatCurrency(selectedStudentAdvanceBalance)}</span>
                  </p>
                ) : null}
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
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">{paymentModalMode === 'advance' ? 'Start With Due Invoice (Optional)' : 'Select Due Invoice'}</p>
                  {paymentModalMode === 'advance' ? (
                    <button
                      type="button"
                      onClick={() => handlePaymentInvoiceChange('')}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      No specific due
                    </button>
                  ) : null}
                </div>

                <div className="max-h-44 overflow-auto rounded-md border border-slate-200/80 bg-white">
                  <table className="min-w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80">
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Select</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Invoice No.</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Invoice</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Due</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Due Date</th>
                        <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDueStudents.map((invoice) => {
                        const selected = invoice.id === activePaymentInvoiceId;
                        const dueType = getDueTypeLabel(invoice.dueDate);

                        return (
                          <tr
                            key={`payment-invoice-row-${invoice.id}`}
                            className={`cursor-pointer border-b border-slate-100 ${selected ? 'bg-brand-sky/10' : 'hover:bg-slate-50'}`}
                            onClick={() => handlePaymentInvoiceChange(invoice.id)}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="radio"
                                name="payment-invoice"
                                checked={selected}
                                onChange={() => handlePaymentInvoiceChange(invoice.id)}
                                className="h-4 w-4 border-slate-300 text-brand-navy focus:ring-brand-sky"
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{invoice.invoiceNumber ?? '-'}</td>
                            <td className="px-3 py-2 text-slate-700">{invoice.title}</td>
                            <td className="px-3 py-2 font-semibold text-brand-navy">{formatCurrency(invoice.due)}</td>
                            <td className="px-3 py-2 text-slate-600">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                            <td className="px-3 py-2 text-slate-600">{dueType}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredDueStudents.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">No due invoices found for this student.</p>
                  ) : null}
                </div>
              </div>

              <div className="md:col-span-2 rounded-md border border-slate-200/80 bg-slate-50/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Invoice Due Snapshot</p>
                  <p className="text-xs text-slate-500">Invoice Due: <span className="font-semibold text-brand-navy">{formatCurrency(activePaymentInvoice?.due ?? 0)}</span></p>
                </div>

                {paymentModalMode === 'advance' ? (
                  <p className="text-xs text-slate-500">Advance payment settles pending dues in sequence and carries extra balance forward as student credit.</p>
                ) : paymentFeeBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-500">Fee-type split is unavailable for this invoice. You can still record payment manually. Any amount above due is moved to advance balance.</p>
                ) : (
                  <div className="max-h-36 overflow-auto rounded-md border border-slate-200 bg-white">
                    <table className="min-w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/80">
                          <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Fee Type</th>
                          <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Monthly Due</th>
                          <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Invoice Fee Amount</th>
                          <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Paid</th>
                          <th className="px-3 py-2 font-semibold uppercase tracking-wider text-slate-400">Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentFeeBreakdown.map((entry) => (
                          <tr key={`payment-breakdown-${entry.feeType}`} className="border-b border-slate-100">
                            <td className="px-3 py-2 text-slate-700">{entry.feeType}</td>
                            <td className="px-3 py-2 text-slate-600">{formatCurrency(entry.monthlyPayable)}</td>
                            <td className="px-3 py-2 text-slate-600">{formatCurrency(entry.installmentPayable)}</td>
                            <td className="px-3 py-2 text-slate-600">{formatCurrency(entry.paidAmount)}</td>
                            <td className="px-3 py-2 font-semibold text-brand-navy">{formatCurrency(entry.remainingAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs text-slate-500">Payment Mode</p>
                <select className="w-full rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'UPI' | 'CASH' | 'CHEQUE')}>
                  <option value="UPI">UPI</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>

              {paymentReferenceLabel ? (
                <div>
                  <p className="mb-1 text-xs text-slate-500">{paymentReferenceLabel}</p>
                  <input
                    className="w-full rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
                    type="text"
                    value={paymentReferenceValue}
                    onChange={(event) => handlePaymentReferenceChange(event.target.value)}
                    placeholder={paymentReferenceLabel}
                  />
                </div>
              ) : null}

              <div>
                <p className="mb-1 text-xs text-slate-500">Receipt No.</p>
                <input
                  className="w-full rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
                  type="text"
                  value={paymentReceiptNumber}
                  onChange={(event) => setPaymentReceiptNumber(event.target.value)}
                  placeholder="Enter manual receipt number"
                />
              </div>

              <div className="md:col-span-2">
                <p className="mb-1 text-xs text-slate-500">Fee Types Paid</p>
                <div className="max-h-40 overflow-auto rounded-md border border-slate-200/80 bg-slate-50/50 p-2">
                  {paymentFeeTypeOptions.map((option) => {
                    const breakdownEntry = paymentFeeBreakdown.find((entry) => entry.feeType === option);
                    const disabledOption = blockedPaidNonMonthlyFeeTypeSet.has(normalizeFeeTypeKey(option));

                    return (
                      <label key={`payment-fee-type-${option}`} className={`mb-1 flex items-center justify-between gap-3 rounded-md border border-transparent bg-white px-3 py-2 text-sm last:mb-0 ${disabledOption ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-brand-sky/40'}`}>
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedPaymentFeeTypes.includes(option)}
                            onChange={(event) => handleTogglePaymentFeeType(option, event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-navy focus:ring-brand-sky"
                            disabled={disabledOption}
                          />
                          <span className="text-slate-700">{option}</span>
                        </span>
                        {disabledOption ? (
                          <span className="text-xs font-semibold text-amber-700">Already paid</span>
                        ) : breakdownEntry ? (
                          <span className="text-xs font-semibold text-brand-navy">Monthly Due: {formatCurrency(breakdownEntry.monthlyPayable)} | Remaining: {formatCurrency(breakdownEntry.remainingAmount)}</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-slate-500">Only the selected fee type(s) will be cleared. Remaining balances stay attached to their own fee types.</p>
              </div>

              <div>
                <p className="mb-1 text-xs text-slate-500">Payment Date</p>
                <input
                  className="w-full rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                />
              </div>

              <div>
                <p className="mb-1 text-xs text-slate-500">Fee Belongs To Month</p>
                <input
                  className="w-full rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
                  type="month"
                  value={paymentFeeMonth}
                  onChange={(event) => handlePaymentFeeMonthChange(event.target.value)}
                />
              </div>

              <div>
                <p className="mb-1 text-xs text-slate-500">Academic Session</p>
                <input
                  className="w-full rounded-md border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm transition-colors focus:border-brand-sky focus:bg-white"
                  type="text"
                  placeholder="e.g. 2025-26"
                  value={paymentAcademicSession}
                  onChange={(event) => setPaymentAcademicSession(event.target.value)}
                />
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
                onClick={paymentModalMode === 'advance' ? handleRecordAdvancePayment : handleRecordPayment}
                disabled={paymentSaving}
                className="rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60"
              >
                {paymentSaving ? 'Saving...' : paymentModalMode === 'advance' ? 'Record Advance Payment' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
