import { Router } from 'express';

import { prisma } from '../../config/prisma.js';
import { AuthenticatedRequest, requireStaffAuth } from '../../middleware/auth.js';

const financeRouter = Router();

financeRouter.use(requireStaffAuth);

type InvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  title: string;
  componentSnapshot: string | null;
  amount: unknown;
  paidAmount: unknown;
  dueDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  student: {
    id: string;
    admissionNo: string;
    firstName: string;
    lastName: string;
    className: string;
    section: string;
  };
};

type PayStubRow = {
  id: string;
  teacherId: string;
  month: string;
  amount: unknown;
  note: string | null;
  createdAt: Date;
  teacher: {
    id: string;
    loginId: string;
    firstName: string;
    lastName: string;
    assignedClass: string | null;
    assignedSection: string | null;
  };
};

type TeacherRow = {
  id: string;
  loginId: string;
  firstName: string;
  lastName: string;
  assignedClass: string | null;
  assignedSection: string | null;
};

type FeePaymentRow = {
  id: string;
  amount: unknown;
  paymentMethod: 'UPI' | 'CASH' | 'CHEQUE';
  feeType: string | null;
  paymentDate: Date;
  feeMonth: string | null;
  academicSession: string | null;
  dueAfterPayment: unknown;
  createdAt: Date;
  invoice: {
    id: string;
    invoiceNumber: string | null;
    title: string;
    amount: unknown;
    paidAmount: unknown;
    dueDate: Date;
    status: string;
    student: {
      id: string;
      admissionNo: string;
      firstName: string;
      lastName: string;
      className: string;
      section: string;
    };
  };
};

type StudentFeeCreditRow = {
  studentId: string;
  balance: unknown;
};

function computeAssignmentSummaryTotal(assignment: {
  components: Array<{ amount: unknown; cadence: 'MONTHLY' | 'YEARLY' | 'ONCE' }>;
} | null | undefined, discount: { type: 'FLAT' | 'PERCENTAGE'; value: unknown } | null | undefined) {
  if (!assignment) {
    return 0;
  }

  const subtotal = assignment.components.reduce((sum, component) => {
    const amount = Number(component.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return sum;
    }

    if (component.cadence === 'MONTHLY') {
      return sum + amount * 12;
    }

    return sum + amount;
  }, 0);

  if (!discount) {
    return subtotal;
  }

  const discountValue = Number(discount.value);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return subtotal;
  }

  const discountAmount = discount.type === 'PERCENTAGE' ? (subtotal * discountValue) / 100 : discountValue;
  return Math.max(subtotal - Math.min(Math.max(discountAmount, 0), subtotal), 0);
}

type FinanceView = 'month' | 'year';

function getMonthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

function getYearRange(year: string) {
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  return { start, end };
}

function resolveFinancePeriod(query: Record<string, unknown>) {
  const now = new Date();
  const defaultMonth = now.toISOString().slice(0, 7);
  const defaultYear = now.getUTCFullYear().toString();
  const viewParam = typeof query.view === 'string' ? query.view.toLowerCase() : 'month';
  const view: FinanceView = viewParam === 'year' ? 'year' : 'month';

  const monthParam = typeof query.month === 'string' ? query.month : defaultMonth;
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : defaultMonth;

  const yearParam = typeof query.year === 'string' ? query.year : month.slice(0, 4);
  const year = /^\d{4}$/.test(yearParam) ? yearParam : defaultYear;

  const range = view === 'year' ? getYearRange(year) : getMonthRange(month);
  const periodKey = view === 'year' ? year : month;

  return {
    view,
    month,
    year,
    periodKey,
    start: range.start,
    end: range.end
  };
}

function deriveFeeMonthFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function deriveAcademicSessionFromFeeMonth(feeMonth: string) {
  const [yearPart, monthPart] = feeMonth.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return '';
  }

  const sessionStartYear = month >= 4 ? year : year - 1;
  const sessionEndYear = String((sessionStartYear + 1) % 100).padStart(2, '0');
  return `${sessionStartYear}-${sessionEndYear}`;
}

function parseInvoiceComponentSnapshot(componentSnapshot: string | null | undefined) {
  if (!componentSnapshot) {
    return [] as Array<{ feeType: string; amount: number; cadence: 'MONTHLY' | 'YEARLY' | 'ONCE' | null }>;
  }

  try {
    const parsed = JSON.parse(componentSnapshot) as Array<{ feeType?: string; amount?: number; cadence?: string | null }>;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => ({
        feeType: typeof entry.feeType === 'string' ? entry.feeType.trim() : '',
        amount: Number(entry.amount ?? 0),
        cadence:
          entry.cadence === 'MONTHLY' || entry.cadence === 'YEARLY' || entry.cadence === 'ONCE'
            ? entry.cadence
            : null
      }))
      .filter((entry) => entry.feeType.length > 0 && Number.isFinite(entry.amount) && entry.amount > 0);
  } catch {
    return [];
  }
}

function getMonthKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getMonthIndex(monthKey: string) {
  const [yearPart, monthPart] = monthKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return Number.NaN;
  }

  return year * 12 + (month - 1);
}

function computeScheduledBilledAmountByMonth(
  invoice: Pick<InvoiceRow, 'amount' | 'componentSnapshot' | 'dueDate'>,
  targetMonthKey: string
) {
  const totalInvoiceAmount = Number(invoice.amount);
  if (!Number.isFinite(totalInvoiceAmount) || totalInvoiceAmount <= 0) {
    return 0;
  }

  const snapshot = parseInvoiceComponentSnapshot(invoice.componentSnapshot);
  if (snapshot.length === 0) {
    return totalInvoiceAmount;
  }

  const dueMonthKey = getMonthKeyFromDate(invoice.dueDate);
  const dueMonthIndex = getMonthIndex(dueMonthKey);
  const targetMonthIndex = getMonthIndex(targetMonthKey);

  if (!Number.isFinite(dueMonthIndex) || !Number.isFinite(targetMonthIndex)) {
    return totalInvoiceAmount;
  }

  const elapsedMonths = targetMonthIndex - dueMonthIndex + 1;
  if (elapsedMonths <= 0) {
    return 0;
  }

  const scheduledAmount = snapshot.reduce((sum, component) => {
    const componentAmount = Number(component.amount);
    if (!Number.isFinite(componentAmount) || componentAmount <= 0) {
      return sum;
    }

    if (component.cadence === 'ONCE' || component.cadence === null) {
      return sum + componentAmount;
    }

    const monthlyInstallment =
      component.cadence === 'YEARLY' ? componentAmount : componentAmount / 12;

    const cappedAmount = Math.min(componentAmount, monthlyInstallment * elapsedMonths);
    return sum + Math.max(cappedAmount, 0);
  }, 0);

  return Math.min(totalInvoiceAmount, Math.max(scheduledAmount, 0));
}

financeRouter.get('/finance/overview', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const { view, month, year, periodKey, start, end } = resolveFinancePeriod(req.query as Record<string, unknown>);

    const [invoices, allUnpaidInvoices, payStubs, activeTeachers, feePayments, allFeePayments, studentFeeCredits] = await Promise.all([
      prisma.feeInvoice.findMany({
        where: {
          student: {
            schoolId
          },
          OR: [
            {
              dueDate: {
                gte: start,
                lt: end
              }
            },
            {
              createdAt: {
                gte: start,
                lt: end
              }
            }
          ]
        },
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              lastName: true,
              className: true,
              section: true
            }
          }
        }
      }),
      prisma.feeInvoice.findMany({
        where: {
          student: {
            schoolId
          },
          status: {
            in: ['UNPAID', 'PARTIAL']
          }
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        include: {
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              lastName: true,
              className: true,
              section: true
            }
          }
        }
      }),
      prisma.payStub.findMany({
        where: {
          teacher: {
            schoolId
          },
          ...(view === 'year' ? { month: { startsWith: `${year}-` } } : { month })
        },
        orderBy: { createdAt: 'desc' },
        include: {
          teacher: {
            select: {
              id: true,
              loginId: true,
              firstName: true,
              lastName: true,
              assignedClass: true,
              assignedSection: true
            }
          }
        }
      }),
      prisma.user.findMany({
        where: { schoolId, role: 'TEACHER', isActive: true },
        select: {
          id: true,
          loginId: true,
          firstName: true,
          lastName: true,
          assignedClass: true,
          assignedSection: true
        }
      }),
      prisma.feePayment.findMany({
        where: {
          invoice: {
            student: {
              schoolId
            }
          },
          paymentDate: {
            gte: start,
            lt: end
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 250,
        select: {
          id: true,
          amount: true,
          paymentMethod: true,
          feeType: true,
          paymentDate: true,
          feeMonth: true,
          academicSession: true,
          dueAfterPayment: true,
          createdAt: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              title: true,
              amount: true,
              paidAmount: true,
              dueDate: true,
              status: true,
              student: {
                select: {
                  id: true,
                  admissionNo: true,
                  firstName: true,
                  lastName: true,
                  className: true,
                  section: true
                }
              }
            }
          }
        }
      }),
      prisma.feePayment.findMany({
        where: {
          invoice: {
            student: {
              schoolId
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 250,
        select: {
          id: true,
          amount: true,
          paymentMethod: true,
          feeType: true,
          paymentDate: true,
          feeMonth: true,
          academicSession: true,
          dueAfterPayment: true,
          createdAt: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              title: true,
              amount: true,
              paidAmount: true,
              dueDate: true,
              status: true,
              student: {
                select: {
                  id: true,
                  admissionNo: true,
                  firstName: true,
                  lastName: true,
                  className: true,
                  section: true
                }
              }
            }
          }
        }
      }),
      prisma.studentFeeCredit.findMany({
        where: {
          student: {
            schoolId
          }
        },
        select: {
          studentId: true,
          balance: true
        }
      })
    ]);

    const dueEvaluationMonth = view === 'year' ? `${year}-12` : month;
    let totalBilled = 0;
    let totalCollected = 0;

    const dueStudents = (allUnpaidInvoices as InvoiceRow[])
      .map((invoice: InvoiceRow) => {
        const amount = Number(invoice.amount);
        const paid = Number(invoice.paidAmount);
        const billedToDate = computeScheduledBilledAmountByMonth(invoice, dueEvaluationMonth);
        const due = Math.max(billedToDate - paid, 0);

        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          title: invoice.title,
          createdAt: invoice.createdAt.toISOString(),
          componentBreakdown: parseInvoiceComponentSnapshot(invoice.componentSnapshot),
          dueDate: invoice.dueDate.toISOString(),
          amount,
          paid,
          due,
          status: invoice.status,
          student: {
            id: invoice.student.id,
            admissionNo: invoice.student.admissionNo,
            name: `${invoice.student.firstName} ${invoice.student.lastName}`,
            className: invoice.student.className,
            section: invoice.student.section
          }
        };
      })
      .filter((invoice: { due: number }) => invoice.due > 0)
      .sort((left: { dueDate: string; createdAt: string; due: number }, right: { dueDate: string; createdAt: string; due: number }) => {
        const dueDateDelta = new Date(right.dueDate).getTime() - new Date(left.dueDate).getTime();
        if (dueDateDelta !== 0) {
          return dueDateDelta;
        }

        const createdAtDelta = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        if (createdAtDelta !== 0) {
          return createdAtDelta;
        }

        return right.due - left.due;
      });

    const periodDueStudents = (invoices as InvoiceRow[])
      .map((invoice: InvoiceRow) => {
        const billedToDate = computeScheduledBilledAmountByMonth(invoice, dueEvaluationMonth);
        const paid = Number(invoice.paidAmount);
        const due = Math.max(billedToDate - paid, 0);

        totalBilled += billedToDate;
        totalCollected += paid;

        return {
          componentBreakdown: parseInvoiceComponentSnapshot(invoice.componentSnapshot),
          due
        };
      })
      .filter((invoice: { due: number }) => invoice.due > 0);

    const totalDue = Math.max(totalBilled - totalCollected, 0);

    const salaryPaid = (payStubs as PayStubRow[]).reduce((sum: number, payStub: PayStubRow) => sum + Number(payStub.amount), 0);
    const paidTeacherIds = new Set((payStubs as PayStubRow[]).map((payStub: PayStubRow) => payStub.teacherId));
    const expectedSalaryEntries = view === 'year' ? (activeTeachers as TeacherRow[]).length * 12 : (activeTeachers as TeacherRow[]).length;

    const pendingSalaries = (activeTeachers as TeacherRow[])
      .filter((teacher: TeacherRow) => !paidTeacherIds.has(teacher.id))
      .map((teacher: TeacherRow) => ({
        id: teacher.id,
        loginId: teacher.loginId,
        name: `${teacher.firstName} ${teacher.lastName}`,
        assignedClass: teacher.assignedClass,
        assignedSection: teacher.assignedSection
      }));

    const revenueByMethod = (feePayments as FeePaymentRow[]).reduce(
      (accumulator: { upi: number; cash: number }, payment: FeePaymentRow) => {
        const amount = Number(payment.amount);
        if (payment.paymentMethod === 'UPI') {
          return { ...accumulator, upi: accumulator.upi + amount };
        }

        return { ...accumulator, cash: accumulator.cash + amount };
      },
      { upi: 0, cash: 0 }
    );

    const computedDueAfterByPaymentId = new Map<string, number>();
    const ascendingPayments = [...(allFeePayments as FeePaymentRow[])].sort((left, right) => {
      const timeDelta = left.createdAt.getTime() - right.createdAt.getTime();
      if (timeDelta !== 0) return timeDelta;
      return left.id.localeCompare(right.id);
    });

    const runningPaidByInvoice = new Map<string, number>();

    for (const payment of ascendingPayments) {
      const invoiceId = payment.invoice.id;
      const invoiceAmount = Number(payment.invoice.amount);
      const previousPaid = runningPaidByInvoice.get(invoiceId) ?? 0;
      const nextPaid = previousPaid + Number(payment.amount);
      runningPaidByInvoice.set(invoiceId, nextPaid);
      computedDueAfterByPaymentId.set(payment.id, Math.max(invoiceAmount - nextPaid, 0));
    }

    return res.json({
      view,
      periodKey,
      month,
      year,
      summary: {
        totalBilled,
        totalCollected,
        totalDue,
        unpaidStudentsCount: periodDueStudents.length,
        salaryPaid,
        salariesSentCount: payStubs.length,
        pendingSalariesCount: Math.max(expectedSalaryEntries - payStubs.length, 0)
      },
      pie: [
        { label: 'Fees Collected', value: totalCollected },
        { label: 'Fees Due', value: totalDue },
        { label: 'Salaries Sent', value: salaryPaid }
      ],
      feesChart: [
        { label: 'Fees Due', value: totalDue },
        { label: 'Fees Collected', value: totalCollected }
      ],
      salariesChart: [
        { label: 'Salaries Due', value: pendingSalaries.length },
        { label: 'Salaries Processed', value: payStubs.length }
      ],
      revenueChart: [
        { label: 'UPI', value: revenueByMethod.upi },
        { label: 'Cash', value: revenueByMethod.cash }
      ],
      feeTransactions: (() => {
        const mappedTransactions = (allFeePayments as FeePaymentRow[]).map((payment: FeePaymentRow) => {
          const invoiceAmount = Number(payment.invoice.amount);
          const invoicePaidAmount = Number(payment.invoice.paidAmount);
          const snapshotDue = Number(payment.dueAfterPayment);
          const computedDue = computedDueAfterByPaymentId.get(payment.id);
          const invoiceDue = Number.isFinite(snapshotDue)
            ? snapshotDue
            : typeof computedDue === 'number'
              ? computedDue
              : Math.max(invoiceAmount - invoicePaidAmount, 0);

          return {
            id: payment.id,
            createdAt: payment.createdAt.toISOString(),
            paymentDate: payment.paymentDate.toISOString(),
            amount: Number(payment.amount),
            paymentMethod: payment.paymentMethod,
            feeType: payment.feeType,
            feeMonth: payment.feeMonth,
            academicSession: payment.academicSession,
            invoice: {
              id: payment.invoice.id,
              invoiceNumber: payment.invoice.invoiceNumber,
              title: payment.invoice.title,
              amount: invoiceAmount,
              paidAmount: invoicePaidAmount,
              due: invoiceDue,
              dueDate: payment.invoice.dueDate.toISOString(),
              status: payment.invoice.status
            },
            student: {
              id: payment.invoice.student.id
            }
          };
        });

        const invoiceIdsWithTransactions = new Set((allFeePayments as FeePaymentRow[]).map((payment: FeePaymentRow) => payment.invoice.id));
        const syntheticAdvanceAppliedTransactions = (invoices as InvoiceRow[])
          .filter((invoice: InvoiceRow) => {
            const invoicePaidAmount = Number(invoice.paidAmount);
            return invoicePaidAmount > 0 && !invoiceIdsWithTransactions.has(invoice.id);
          })
          .map((invoice: InvoiceRow) => {
            const invoiceAmount = Number(invoice.amount);
            const invoicePaidAmount = Number(invoice.paidAmount);
            const invoiceDue = Math.max(invoiceAmount - invoicePaidAmount, 0);
            const feeMonth = deriveFeeMonthFromDate(invoice.dueDate);

            return {
              id: `synthetic-advance-applied-${invoice.id}`,
              createdAt: invoice.updatedAt.toISOString(),
              paymentDate: invoice.updatedAt.toISOString(),
              amount: invoicePaidAmount,
              paymentMethod: 'UPI' as const,
              feeType: 'Advance Applied (Auto Deduction)',
              feeMonth,
              academicSession: deriveAcademicSessionFromFeeMonth(feeMonth),
              invoice: {
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                title: invoice.title,
                amount: invoiceAmount,
                paidAmount: invoicePaidAmount,
                due: invoiceDue,
                dueDate: invoice.dueDate.toISOString(),
                status: invoice.status
              },
              student: {
                id: invoice.student.id
              }
            };
          });

        return [...mappedTransactions, ...syntheticAdvanceAppliedTransactions].sort((left, right) => {
          const paymentDateDelta = new Date(right.paymentDate).getTime() - new Date(left.paymentDate).getTime();
          if (paymentDateDelta !== 0) {
            return paymentDateDelta;
          }

          const timeDelta = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
          if (timeDelta !== 0) {
            return timeDelta;
          }

          return right.id.localeCompare(left.id);
        });
      })(),
      periodInvoices: (invoices as InvoiceRow[]).map((invoice: InvoiceRow) => {
        const amount = Number(invoice.amount);
        const paidAmount = Number(invoice.paidAmount);
        const billedToDate = computeScheduledBilledAmountByMonth(invoice, dueEvaluationMonth);
        const due = Math.max(billedToDate - paidAmount, 0);

        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          title: invoice.title,
          componentBreakdown: parseInvoiceComponentSnapshot(invoice.componentSnapshot),
          dueDate: invoice.dueDate.toISOString(),
          amount,
          paidAmount,
          due,
          status: invoice.status,
          student: {
            id: invoice.student.id
          }
        };
      }),
      dueStudents,
      studentCredits: (studentFeeCredits as StudentFeeCreditRow[]).map((credit: StudentFeeCreditRow) => ({
        studentId: credit.studentId,
        balance: Number(credit.balance)
      })),
      salariesSent: (payStubs as PayStubRow[]).map((payStub: PayStubRow) => ({
        id: payStub.id,
        month: payStub.month,
        amount: Number(payStub.amount),
        note: payStub.note,
        createdAt: payStub.createdAt.toISOString(),
        teacher: {
          id: payStub.teacher.id,
          loginId: payStub.teacher.loginId,
          name: `${payStub.teacher.firstName} ${payStub.teacher.lastName}`,
          assignedClass: payStub.teacher.assignedClass,
          assignedSection: payStub.teacher.assignedSection
        }
      })),
      pendingSalaries,
      generatedAt: new Date().toISOString(),
      monthRange: {
        start: start.toISOString(),
        end: end.toISOString()
      }
    });
  } catch (error) {
    console.error('Unable to load finance overview', error);
    return res.status(503).json({ message: 'Unable to load finance overview.' });
  }
});

financeRouter.get('/finance/dues-report', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const students = await prisma.student.findMany({
      where: { schoolId },
      orderBy: [{ className: 'asc' }, { section: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        className: true,
        section: true,
        isActive: true,
        feeAssignment: {
          select: {
            billingCycle: true,
            components: {
              select: {
                amount: true,
                cadence: true
              }
            }
          }
        },
        discount: {
          select: {
            type: true,
            value: true
          }
        },
        feeInvoices: {
          select: {
            amount: true,
            paidAmount: true
          }
        }
      }
    });

    const rows = students.map((student: any) => {
      const totalFeesSummary = computeAssignmentSummaryTotal(student.feeAssignment, student.discount);
      const invoiceGeneratedAmount = student.feeInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.amount), 0);
      const invoicePaidAmount = student.feeInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.paidAmount), 0);
      const totalPending = Math.max(invoiceGeneratedAmount - invoicePaidAmount, 0);

      return {
        studentId: student.id,
        admissionNo: student.admissionNo,
        studentName: `${student.firstName} ${student.lastName}`,
        className: student.className,
        section: student.section,
        isActive: student.isActive,
        totalFeesSummary,
        invoiceGeneratedAmount,
        invoicePaidAmount,
        totalPending
      };
    });

    const totals = rows.reduce(
      (sum: { totalFeesSummary: number; invoiceGeneratedAmount: number; invoicePaidAmount: number; totalPending: number }, row: any) => ({
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
    );

    return res.json({
      rows,
      totals,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Unable to load finance dues report', error);
    return res.status(503).json({ message: 'Unable to load finance dues report.' });
  }
});

export { financeRouter };
