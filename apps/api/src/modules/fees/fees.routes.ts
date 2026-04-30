import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../config/prisma.js';
import { AuthenticatedRequest, requireStaffAuth } from '../../middleware/auth.js';

const feesRouter = Router();

const createInvoiceSchema = z.object({
  admissionNo: z.string().min(3),
  title: z.string().min(3),
  amount: z.number().positive().optional(),
  dueDate: z.string().optional()
});

const createPayStubSchema = z.object({
  teacherId: z.string().min(1),
  month: z.string().min(7),
  amount: z.number().positive(),
  note: z.string().optional()
});

const payFeeInvoiceSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(['UPI', 'CASH']),
  feeType: z.string().min(1).optional()
});

const recordAdvancePaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(['UPI', 'CASH']),
  feeType: z.string().min(1).optional(),
  sourceInvoiceId: z.string().min(1).optional()
});

const upsertFeeAssignmentSchema = z.object({
  billingCycle: z.enum(['YEARLY', 'QUARTERLY', 'MONTHLY']),
  components: z
    .array(
      z.object({
        feeType: z.string().min(1),
        cadence: z.enum(['MONTHLY', 'YEARLY', 'ONCE']),
        amount: z.number().min(0)
      })
    ),
  discount: z
    .object({
      type: z.enum(['FLAT', 'PERCENTAGE']),
      value: z.number().min(0),
      reason: z.string().optional()
    })
    .optional(),
  discounts: z
    .array(
      z.object({
        type: z.enum(['FLAT', 'PERCENTAGE']),
        value: z.number().min(0),
        reason: z.string().optional()
      })
    )
    .optional()
});

const MULTI_DISCOUNT_REASON_PREFIX = 'MULTI_DISCOUNTS_V1:';

type DiscountEntry = {
  type: 'FLAT' | 'PERCENTAGE';
  value: number;
  reason: string | null;
};

function normalizeDiscountEntries(entries: Array<{ type: 'FLAT' | 'PERCENTAGE'; value: number; reason?: string | null }>) {
  return entries
    .map((entry) => ({
      type: entry.type,
      value: Number(entry.value),
      reason: entry.reason?.trim() ? entry.reason.trim() : null
    }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0);
}

function parseStoredDiscountEntries(discount: AssignmentDiscount | undefined): DiscountEntry[] {
  if (!discount) {
    return [];
  }

  const reason = discount.reason ?? '';
  if (reason.startsWith(MULTI_DISCOUNT_REASON_PREFIX)) {
    try {
      const serialized = reason.slice(MULTI_DISCOUNT_REASON_PREFIX.length);
      const parsed = JSON.parse(serialized) as Array<{ type?: string; value?: number; reason?: string | null }>;
      if (Array.isArray(parsed)) {
        return normalizeDiscountEntries(
          parsed.map((entry) => ({
            type: entry.type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FLAT',
            value: Number(entry.value ?? 0),
            reason: entry.reason ?? null
          }))
        );
      }
    } catch {
      // Fall back to legacy discount shape when metadata is malformed.
    }
  }

  return normalizeDiscountEntries([
    {
      type: discount.type,
      value: Number(discount.value),
      reason: discount.reason
    }
  ]);
}

function serializeDiscountEntries(entries: DiscountEntry[]) {
  if (entries.length === 0) {
    return null;
  }

  return `${MULTI_DISCOUNT_REASON_PREFIX}${JSON.stringify(entries)}`;
}

function computeDiscountAmount(subtotal: number, entries: DiscountEntry[]) {
  const rawAmount = entries.reduce((sum, entry) => {
    if (entry.type === 'PERCENTAGE') {
      return sum + (subtotal * entry.value) / 100;
    }
    return sum + entry.value;
  }, 0);

  return Math.min(Math.max(rawAmount, 0), subtotal);
}

function getInstallmentCount(billingCycle: 'YEARLY' | 'QUARTERLY' | 'MONTHLY') {
  if (billingCycle === 'MONTHLY') return 12;
  if (billingCycle === 'QUARTERLY') return 4;
  return 1;
}

function getNextDueDate(feeDueDayOfMonth: number, from: Date = new Date()) {
  const currentYear = from.getFullYear();
  const currentMonth = from.getMonth();

  const currentMonthLastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
  const currentMonthDueDay = Math.min(feeDueDayOfMonth, currentMonthLastDay);
  const currentMonthDueDate = new Date(currentYear, currentMonth, currentMonthDueDay, 12, 0, 0, 0);

  if (currentMonthDueDate.getTime() >= from.getTime()) {
    return currentMonthDueDate;
  }

  const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
  const nextMonthYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth();
  const nextMonthLastDay = new Date(nextMonthYear, nextMonth + 1, 0).getDate();
  const nextMonthDueDay = Math.min(feeDueDayOfMonth, nextMonthLastDay);

  return new Date(nextMonthYear, nextMonth, nextMonthDueDay, 12, 0, 0, 0);
}

async function ensureAdvanceCreditLedgerInvoice(tx: any, studentId: string) {
  const existingLedger = await tx.feeInvoice.findFirst({
    where: {
      studentId,
      title: 'Advance Credit Ledger'
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      id: true
    }
  });

  if (existingLedger) {
    return existingLedger.id;
  }

  const dueDate = new Date();
  dueDate.setHours(12, 0, 0, 0);

  const createdLedger = await tx.feeInvoice.create({
    data: {
      studentId,
      title: 'Advance Credit Ledger',
      amount: 0,
      paidAmount: 0,
      dueDate,
      status: 'PAID'
    },
    select: {
      id: true
    }
  });

  return createdLedger.id;
}

function toCsvCell(value: unknown) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function consumeStudentCredit(tx: any, studentId: string, requestedAmount: number) {
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return { appliedAmount: 0, remainingCreditBalance: 0 };
  }

  const credit = await tx.studentFeeCredit.findUnique({ where: { studentId } });
  if (!credit) {
    return { appliedAmount: 0, remainingCreditBalance: 0 };
  }

  const balance = Number(credit.balance);
  if (!Number.isFinite(balance) || balance <= 0) {
    return { appliedAmount: 0, remainingCreditBalance: 0 };
  }

  const appliedAmount = Math.min(balance, requestedAmount);
  const remainingCreditBalance = Math.max(balance - appliedAmount, 0);

  await tx.studentFeeCredit.update({
    where: { studentId },
    data: { balance: remainingCreditBalance }
  });

  return { appliedAmount, remainingCreditBalance };
}

function resolveInvoiceStatus(amount: number, paidAmount: number) {
  const due = Math.max(amount - paidAmount, 0);
  if (due <= 0) {
    return 'PAID' as const;
  }

  if (paidAmount > 0) {
    return 'PARTIAL' as const;
  }

  return 'UNPAID' as const;
}

feesRouter.use(requireStaffAuth);

type AssignmentStudent = {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  className: string;
  section: string;
};

type AssignmentDiscount = {
  id: string;
  type: 'FLAT' | 'PERCENTAGE';
  value: unknown;
  reason: string | null;
} | null;

function toAssignmentResponse(assignment: {
  id: string;
  studentId: string;
  billingCycle: 'YEARLY' | 'QUARTERLY' | 'MONTHLY';
  updatedAt: Date;
  components: Array<{ id: string; feeType: string; cadence: 'MONTHLY' | 'YEARLY' | 'ONCE'; amount: unknown }>;
  student?: AssignmentStudent;
  discount?: AssignmentDiscount;
}) {
  const yearlySubtotal = assignment.components
    .filter((component) => component.cadence === 'YEARLY')
    .reduce((sum, component) => sum + Number(component.amount), 0);
  const monthlySubtotal = assignment.components
    .filter((component) => component.cadence === 'MONTHLY')
    .reduce((sum, component) => sum + Number(component.amount), 0);
  const onceSubtotal = assignment.components
    .filter((component) => component.cadence === 'ONCE')
    .reduce((sum, component) => sum + Number(component.amount), 0);
  const annualSubtotal = yearlySubtotal + monthlySubtotal * 12 + onceSubtotal;
  const parsedDiscounts = parseStoredDiscountEntries(assignment.discount);
  const discountAmount = computeDiscountAmount(annualSubtotal, parsedDiscounts);
  const finalTotal = Math.max(annualSubtotal - discountAmount, 0);
  const installmentCount = getInstallmentCount(assignment.billingCycle);

  const normalizedDiscounts = parsedDiscounts.map((entry, index) => ({
    id: assignment.discount ? `${assignment.discount.id}-${index + 1}` : `discount-${index + 1}`,
    type: entry.type,
    value: entry.value,
    reason: entry.reason
  }));

  const primaryDiscount =
    normalizedDiscounts.length === 0
      ? null
      : normalizedDiscounts.length === 1
        ? normalizedDiscounts[0]
        : {
            id: assignment.discount?.id ?? 'multiple-discounts',
            type: 'FLAT' as const,
            value: discountAmount,
            reason: 'Multiple discounts applied'
          };

  return {
    id: assignment.id,
    studentId: assignment.studentId,
    billingCycle: assignment.billingCycle,
    components: assignment.components.map((component) => ({
      id: component.id,
      feeType: component.feeType,
      cadence: component.cadence,
      amount: Number(component.amount)
    })),
    discounts: normalizedDiscounts,
    discount: primaryDiscount,
    subtotal: annualSubtotal,
    yearlySubtotal,
    monthlySubtotal,
    onceSubtotal,
    discountAmount,
    finalTotal,
    annualTotal: finalTotal,
    monthlyInstallment: finalTotal / 12,
    quarterlyInstallment: finalTotal / 4,
    installmentAmount: finalTotal / installmentCount,
    updatedAt: assignment.updatedAt,
    ...(assignment.student
      ? {
          student: {
            id: assignment.student.id,
            admissionNo: assignment.student.admissionNo,
            name: `${assignment.student.firstName} ${assignment.student.lastName}`,
            className: assignment.student.className,
            section: assignment.student.section
          }
        }
      : {})
  };
}

feesRouter.get('/fees/students', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const students = await prisma.student.findMany({
      where: { schoolId, isActive: true },
      orderBy: [{ className: 'asc' }, { section: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        className: true,
        section: true
      }
    });

    return res.json(students);
  } catch {
    return res.status(503).json({ message: 'Database is unavailable.' });
  }
});

feesRouter.get('/fees/student-assignments', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const assignments = await prisma.studentFeeAssignment.findMany({
      where: {
        student: {
          schoolId
        }
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        components: { orderBy: { createdAt: 'asc' } },
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            className: true,
            section: true,
            discount: {
              select: {
                id: true,
                type: true,
                value: true,
                reason: true
              }
            }
          }
        }
      }
    });

    return res.json(
      assignments.map((assignment: (typeof assignments)[number]) =>
        toAssignmentResponse({
          id: assignment.id,
          studentId: assignment.studentId,
          billingCycle: assignment.billingCycle,
          updatedAt: assignment.updatedAt,
          components: assignment.components,
          discount: assignment.student.discount,
          student: assignment.student
        })
      )
    );
  } catch {
    return res.status(503).json({ message: 'Database is unavailable.' });
  }
});

feesRouter.put('/fees/student-assignments/:studentId', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = upsertFeeAssignmentSchema.parse(req.body);

    const student = await prisma.student.findFirst({
      where: {
        id: req.params.studentId,
        schoolId
      }
    });
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const refreshed = await prisma.$transaction(async (tx: any) => {
      const assignment = await tx.studentFeeAssignment.upsert({
        where: { studentId: req.params.studentId },
        update: {
          billingCycle: payload.billingCycle
        },
        create: {
          studentId: req.params.studentId,
          billingCycle: payload.billingCycle
        }
      });

      await tx.studentFeeComponent.deleteMany({ where: { assignmentId: assignment.id } });

      if (payload.components.length > 0) {
        await tx.studentFeeComponent.createMany({
          data: payload.components.map((component) => ({
            assignmentId: assignment.id,
            feeType: component.feeType,
            cadence: component.cadence,
            amount: component.amount
          }))
        });
      }

      const normalizedDiscounts = normalizeDiscountEntries(
        payload.discounts && payload.discounts.length > 0
          ? payload.discounts
          : payload.discount
            ? [payload.discount]
            : []
      );

      const annualSubtotal = payload.components.reduce((sum, component) => {
        if (component.cadence === 'MONTHLY') {
          return sum + component.amount * 12;
        }
        return sum + component.amount;
      }, 0);
      const discountAmount = computeDiscountAmount(annualSubtotal, normalizedDiscounts);

      if (normalizedDiscounts.length > 0 && discountAmount > 0) {
        await tx.discount.upsert({
          where: { studentId: req.params.studentId },
          update: {
            type: 'FLAT',
            value: discountAmount,
            reason: serializeDiscountEntries(normalizedDiscounts)
          },
          create: {
            studentId: req.params.studentId,
            type: 'FLAT',
            value: discountAmount,
            reason: serializeDiscountEntries(normalizedDiscounts)
          }
        });
      } else {
        await tx.discount.deleteMany({ where: { studentId: req.params.studentId } });
      }

      return tx.studentFeeAssignment.findUnique({
        where: { id: assignment.id },
        include: {
          components: { orderBy: { createdAt: 'asc' } },
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              lastName: true,
              className: true,
              section: true,
              discount: {
                select: {
                  id: true,
                  type: true,
                  value: true,
                  reason: true
                }
              }
            }
          }
        }
      });
    });

    if (!refreshed) {
      return res.status(404).json({ message: 'Unable to load saved student fee assignment.' });
    }

    return res.json({
      message: 'Student fee assigned successfully.',
      assignment: toAssignmentResponse({
        id: refreshed.id,
        studentId: refreshed.studentId,
        billingCycle: refreshed.billingCycle,
        updatedAt: refreshed.updatedAt,
        components: refreshed.components,
        discount: refreshed.student.discount,
        student: refreshed.student
      })
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', issues: error.issues });
    }

    return res.status(400).json({ message: 'Unable to assign student fee.' });
  }
});

feesRouter.get('/fees/teachers', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const teachers = await prisma.user.findMany({
      where: { schoolId, role: 'TEACHER', isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        loginId: true,
        assignedClass: true,
        assignedSection: true,
        subjects: true
      }
    });

    return res.json(teachers);
  } catch {
    return res.status(503).json({ message: 'Database is unavailable.' });
  }
});

feesRouter.get('/fees/invoices', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const invoices = await prisma.feeInvoice.findMany({
      where: {
        student: {
          schoolId
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        student: {
          select: {
            admissionNo: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    return res.json(invoices);
  } catch {
    return res.status(503).json({ message: 'Database is unavailable.' });
  }
});

feesRouter.get('/fees/invoices/:invoiceId/download', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const invoice = await prisma.feeInvoice.findFirst({
      where: {
        id: req.params.invoiceId,
        student: {
          schoolId
        }
      },
      include: {
        student: {
          select: {
            admissionNo: true,
            firstName: true,
            lastName: true,
            className: true,
            section: true
          }
        },
        payments: {
          orderBy: {
            createdAt: 'asc'
          },
          select: {
            id: true,
            createdAt: true,
            amount: true,
            paymentMethod: true,
            feeType: true,
            dueAfterPayment: true
          }
        }
      }
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Fee invoice not found.' });
    }

    const amount = Number(invoice.amount);
    const paidAmount = Number(invoice.paidAmount);
    const dueAmount = Math.max(amount - paidAmount, 0);

    const rows: string[][] = [
      ['Invoice ID', invoice.id],
      ['Invoice Title', invoice.title],
      ['Admission No', invoice.student.admissionNo],
      ['Student Name', `${invoice.student.firstName} ${invoice.student.lastName}`],
      ['Class', invoice.student.className],
      ['Section', invoice.student.section],
      ['Amount', amount.toFixed(2)],
      ['Paid Amount', paidAmount.toFixed(2)],
      ['Due Amount', dueAmount.toFixed(2)],
      ['Status', invoice.status],
      ['Due Date', invoice.dueDate.toISOString()],
      ['Created At', invoice.createdAt.toISOString()],
      ['Updated At', invoice.updatedAt.toISOString()],
      [],
      ['Payments'],
      ['Payment ID', 'Date', 'Amount', 'Method', 'Fee Type', 'Due After Payment']
    ];

    if (invoice.payments.length === 0) {
      rows.push(['-', '-', '-', '-', '-', '-']);
    } else {
      invoice.payments.forEach((payment: (typeof invoice.payments)[number]) => {
        rows.push([
          payment.id,
          payment.createdAt.toISOString(),
          Number(payment.amount).toFixed(2),
          payment.paymentMethod,
          payment.feeType ?? '',
          payment.dueAfterPayment === null ? '' : Number(payment.dueAfterPayment).toFixed(2)
        ]);
      });
    }

    const csv = rows.map((row) => row.map((cell) => toCsvCell(cell)).join(',')).join('\n');
    const safeAdmissionNo = invoice.student.admissionNo.replace(/[^a-zA-Z0-9_-]/g, '-');
    const filename = `${safeAdmissionNo}-${invoice.id}-invoice.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch {
    return res.status(400).json({ message: 'Unable to download fee invoice.' });
  }
});

feesRouter.post('/fees/invoices', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = createInvoiceSchema.parse(req.body);

    const student = await prisma.student.findFirst({
      where: {
        admissionNo: payload.admissionNo,
        schoolId,
        isActive: true
      }
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found for this admission number.' });
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      return res.status(400).json({ message: 'No school configuration found for this student.' });
    }

    let invoiceAmount = Number(payload.amount ?? 0);

    if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
      const assignment = await prisma.studentFeeAssignment.findUnique({
        where: { studentId: student.id },
        include: {
          components: { orderBy: { createdAt: 'asc' } },
          student: {
            select: {
              discount: {
                select: {
                  id: true,
                  type: true,
                  value: true,
                  reason: true
                }
              }
            }
          }
        }
      });

      if (!assignment || assignment.components.length === 0) {
        return res.status(400).json({ message: 'Fee structure not assigned for this student.' });
      }

      const normalizedAssignment = toAssignmentResponse({
        id: assignment.id,
        studentId: assignment.studentId,
        billingCycle: assignment.billingCycle,
        updatedAt: assignment.updatedAt,
        components: assignment.components,
        discount: assignment.student.discount ?? null
      });

      invoiceAmount = Math.max(normalizedAssignment.installmentAmount, 0);
    }

    if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
      return res.status(400).json({ message: 'Invoice amount must be greater than zero.' });
    }

    const dueDate = payload.dueDate ? new Date(payload.dueDate) : getNextDueDate(school.feeDueDayOfMonth);

    if (Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({ message: 'Invalid due date.' });
    }

    dueDate.setHours(12, 0, 0, 0);

    const existingInvoice = await prisma.feeInvoice.findFirst({
      where: {
        studentId: student.id,
        dueDate,
        title: payload.title,
        status: {
          in: ['UNPAID', 'PARTIAL']
        }
      }
    });

    if (existingInvoice) {
      return res.status(409).json({
        message: 'Invoice already exists for this student and due date.',
        invoice: existingInvoice
      });
    }

    const { invoice, creditApplied } = await prisma.$transaction(async (tx: any) => {
      const { appliedAmount } = await consumeStudentCredit(tx, student.id, invoiceAmount);
      const paidAmount = Math.max(appliedAmount, 0);
      const status = resolveInvoiceStatus(invoiceAmount, paidAmount);

      const createdInvoice = await tx.feeInvoice.create({
        data: {
          studentId: student.id,
          title: payload.title,
          amount: invoiceAmount,
          paidAmount,
          dueDate,
          status
        }
      });

      if (paidAmount > 0) {
        await tx.feePayment.create({
          data: {
            invoiceId: createdInvoice.id,
            amount: paidAmount,
            paymentMethod: 'UPI',
            feeType: 'Advance Applied (Auto Deduction)',
            dueAfterPayment: Math.max(invoiceAmount - paidAmount, 0)
          }
        });
      }

      return {
        invoice: createdInvoice,
        creditApplied: paidAmount
      };
    });

    return res.status(201).json({
      message:
        creditApplied > 0
          ? `Fee invoice sent successfully. Applied ${creditApplied.toFixed(2)} from student advance balance.`
          : 'Fee invoice sent successfully.',
      invoice
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', issues: error.issues });
    }

    return res.status(400).json({ message: 'Unable to create fee invoice.' });
  }
});

feesRouter.post('/fees/invoices/bulk', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const assignments = await prisma.studentFeeAssignment.findMany({
      where: {
        components: {
          some: {}
        },
        student: {
          schoolId,
          isActive: true
        }
      },
      include: {
        components: {
          orderBy: { createdAt: 'asc' }
        },
        student: {
          select: {
            id: true,
            admissionNo: true,
            schoolId: true,
            discount: {
              select: {
                id: true,
                type: true,
                value: true,
                reason: true
              }
            }
          }
        }
      }
    });

    if (assignments.length === 0) {
      return res.json({
        message: 'No eligible students found for invoice generation.',
        summary: {
          totalEligible: 0,
          created: 0,
          skipped: 0,
          skippedReasons: {
            missingSchoolConfig: 0,
            invalidInstallment: 0,
            existingInvoiceForDueDate: 0
          }
        }
      });
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        feeDueDayOfMonth: true
      }
    });

    if (!school) {
      return res.status(400).json({ message: 'No school configuration found for invoice generation.' });
    }

    let created = 0;
    const skippedReasons = {
      missingSchoolConfig: 0,
      invalidInstallment: 0,
      existingInvoiceForDueDate: 0
    };

    for (const assignment of assignments) {
      const normalizedAssignment = toAssignmentResponse({
        id: assignment.id,
        studentId: assignment.studentId,
        billingCycle: assignment.billingCycle,
        updatedAt: assignment.updatedAt,
        components: assignment.components,
        discount: assignment.student.discount ?? null
      });

      const installmentAmount = Math.max(normalizedAssignment.installmentAmount, 0);
      if (installmentAmount <= 0) {
        skippedReasons.invalidInstallment += 1;
        continue;
      }

      const dueDate = getNextDueDate(school.feeDueDayOfMonth);

      const existingInvoice = await prisma.feeInvoice.findFirst({
        where: {
          studentId: assignment.studentId,
          dueDate,
          title: `${assignment.billingCycle} Fee Invoice`,
          status: {
            in: ['UNPAID', 'PARTIAL']
          }
        }
      });

      if (existingInvoice) {
        skippedReasons.existingInvoiceForDueDate += 1;
        continue;
      }

      await prisma.$transaction(async (tx: any) => {
        const { appliedAmount } = await consumeStudentCredit(tx, assignment.studentId, installmentAmount);
        const paidAmount = Math.max(appliedAmount, 0);
        const status = resolveInvoiceStatus(installmentAmount, paidAmount);

        const createdInvoice = await tx.feeInvoice.create({
          data: {
            studentId: assignment.studentId,
            title: `${assignment.billingCycle} Fee Invoice`,
            amount: installmentAmount,
            paidAmount,
            dueDate,
            status
          }
        });

        if (paidAmount > 0) {
          await tx.feePayment.create({
            data: {
              invoiceId: createdInvoice.id,
              amount: paidAmount,
              paymentMethod: 'UPI',
              feeType: 'Advance Applied (Auto Deduction)',
              dueAfterPayment: Math.max(installmentAmount - paidAmount, 0)
            }
          });
        }
      });

      created += 1;
    }

    const skipped = skippedReasons.missingSchoolConfig + skippedReasons.invalidInstallment + skippedReasons.existingInvoiceForDueDate;

    return res.json({
      message: `Bulk invoice generation completed. Created ${created} invoice(s), skipped ${skipped}.`,
      summary: {
        totalEligible: assignments.length,
        created,
        skipped,
        skippedReasons
      }
    });
  } catch {
    return res.status(400).json({ message: 'Unable to generate bulk fee invoices.' });
  }
});

feesRouter.post('/fees/invoices/:invoiceId/pay', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = payFeeInvoiceSchema.parse(req.body);

    const invoice = await prisma.feeInvoice.findFirst({
      where: {
        id: req.params.invoiceId,
        student: {
          schoolId
        }
      }
    });
    if (!invoice) {
      return res.status(404).json({ message: 'Fee invoice not found.' });
    }

    const amount = Number(invoice.amount);
    const alreadyPaid = Number(invoice.paidAmount);
    const due = Math.max(amount - alreadyPaid, 0);

    if (due <= 0) {
      return res.status(400).json({ message: 'Invoice is already fully paid.' });
    }

    const requestedAmount = Number(payload.amount);
    const payAmount = Math.min(requestedAmount, due);
    const overpaidAmount = Math.max(requestedAmount - due, 0);

    if (payAmount <= 0 && overpaidAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero.' });
    }

    const nextPaidAmount = alreadyPaid + payAmount;
    const nextDue = Math.max(amount - nextPaidAmount, 0);

    const result = await prisma.$transaction(async (tx: any) => {
      await tx.feePayment.create({
        data: {
          invoiceId: invoice.id,
          amount: payAmount,
          paymentMethod: payload.paymentMethod,
          feeType: payload.feeType,
          dueAfterPayment: nextDue
        }
      });

      const updatedInvoice = await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: nextPaidAmount,
          status: nextDue <= 0 ? 'PAID' : 'PARTIAL'
        }
      });

      if (overpaidAmount > 0) {
        const creditFeeType = payload.feeType?.trim() ? `${payload.feeType.trim()} (Advance Credit)` : 'Advance Credit';

        await tx.feePayment.create({
          data: {
            invoiceId: invoice.id,
            amount: overpaidAmount,
            paymentMethod: payload.paymentMethod,
            feeType: creditFeeType,
            dueAfterPayment: nextDue
          }
        });

        await tx.studentFeeCredit.upsert({
          where: { studentId: invoice.studentId },
          update: {
            balance: {
              increment: overpaidAmount
            }
          },
          create: {
            studentId: invoice.studentId,
            balance: overpaidAmount
          }
        });
      }

      const credit = await tx.studentFeeCredit.findUnique({
        where: { studentId: invoice.studentId },
        select: { balance: true }
      });

      return {
        updatedInvoice,
        creditBalance: Number(credit?.balance ?? 0)
      };
    });

    return res.json({
      message:
        overpaidAmount > 0
          ? `Fee payment recorded. ${overpaidAmount.toFixed(2)} added to advance balance.`
          : nextDue <= 0
            ? 'Fee payment recorded and invoice closed.'
            : 'Partial fee payment recorded successfully.',
      invoice: {
        id: result.updatedInvoice.id,
        title: result.updatedInvoice.title,
        amount: Number(result.updatedInvoice.amount),
        paidAmount: Number(result.updatedInvoice.paidAmount),
        due: Math.max(Number(result.updatedInvoice.amount) - Number(result.updatedInvoice.paidAmount), 0),
        dueDate: result.updatedInvoice.dueDate,
        status: result.updatedInvoice.status,
        updatedAt: result.updatedInvoice.updatedAt
      },
      overpayment: {
        creditedAmount: overpaidAmount,
        advanceBalance: result.creditBalance
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', issues: error.issues });
    }

    return res.status(400).json({ message: 'Unable to process fee payment.' });
  }
});

feesRouter.post('/fees/students/:studentId/advance-payments', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = recordAdvancePaymentSchema.parse(req.body);

    const student = await prisma.student.findFirst({
      where: {
        id: req.params.studentId,
        schoolId,
        isActive: true
      },
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true
      }
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    if (payload.sourceInvoiceId) {
      const sourceInvoice = await prisma.feeInvoice.findFirst({
        where: {
          id: payload.sourceInvoiceId,
          studentId: student.id
        },
        select: { id: true }
      });

      if (!sourceInvoice) {
        return res.status(404).json({ message: 'Selected due invoice not found for this student.' });
      }
    }

    const result = await prisma.$transaction(async (tx: any) => {
      let remainingAmount = Number(payload.amount);
      let totalAppliedToInvoices = 0;

      const unpaidInvoices = await tx.feeInvoice.findMany({
        where: {
          studentId: student.id,
          status: {
            in: ['UNPAID', 'PARTIAL']
          }
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }]
      });

      const orderedInvoices =
        payload.sourceInvoiceId && unpaidInvoices.some((invoice: any) => invoice.id === payload.sourceInvoiceId)
          ? [
              ...unpaidInvoices.filter((invoice: any) => invoice.id === payload.sourceInvoiceId),
              ...unpaidInvoices.filter((invoice: any) => invoice.id !== payload.sourceInvoiceId)
            ]
          : unpaidInvoices;

      for (const invoice of orderedInvoices) {
        if (remainingAmount <= 0) break;

        const amount = Number(invoice.amount);
        const alreadyPaid = Number(invoice.paidAmount);
        const due = Math.max(amount - alreadyPaid, 0);
        if (due <= 0) continue;

        const payAmount = Math.min(remainingAmount, due);
        if (payAmount <= 0) continue;

        const nextPaidAmount = alreadyPaid + payAmount;
        const nextDue = Math.max(amount - nextPaidAmount, 0);

        await tx.feePayment.create({
          data: {
            invoiceId: invoice.id,
            amount: payAmount,
            paymentMethod: payload.paymentMethod,
            feeType: payload.feeType?.trim() ? `${payload.feeType.trim()} (Advance Applied)` : 'Advance Applied',
            dueAfterPayment: nextDue
          }
        });

        await tx.feeInvoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: nextPaidAmount,
            status: nextDue <= 0 ? 'PAID' : 'PARTIAL'
          }
        });

        totalAppliedToInvoices += payAmount;
        remainingAmount -= payAmount;
      }

      if (remainingAmount > 0) {
        const creditFeeType = payload.feeType?.trim() ? `${payload.feeType.trim()} (Advance Credit)` : 'Advance Credit';

        let advanceLogInvoiceId: string;
        if (payload.sourceInvoiceId) {
          advanceLogInvoiceId = payload.sourceInvoiceId;
        } else if (orderedInvoices.length > 0) {
          advanceLogInvoiceId = orderedInvoices[0].id;
        } else {
          const latestInvoice = await tx.feeInvoice.findFirst({
            where: { studentId: student.id },
            orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
            select: { id: true }
          });

          advanceLogInvoiceId = latestInvoice?.id ?? (await ensureAdvanceCreditLedgerInvoice(tx, student.id));
        }

        await tx.feePayment.create({
          data: {
            invoiceId: advanceLogInvoiceId,
            amount: remainingAmount,
            paymentMethod: payload.paymentMethod,
            feeType: creditFeeType,
            dueAfterPayment: 0
          }
        });

        await tx.studentFeeCredit.upsert({
          where: { studentId: student.id },
          update: {
            balance: {
              increment: remainingAmount
            }
          },
          create: {
            studentId: student.id,
            balance: remainingAmount
          }
        });
      }

      const credit = await tx.studentFeeCredit.findUnique({
        where: { studentId: student.id },
        select: { balance: true }
      });

      return {
        totalAppliedToInvoices,
        carryForwardCredit: Number(credit?.balance ?? 0)
      };
    });

    return res.json({
      message:
        result.carryForwardCredit > 0
          ? `Advance payment recorded. ${result.totalAppliedToInvoices.toFixed(2)} adjusted against dues and ${result.carryForwardCredit.toFixed(2)} carried forward.`
          : `Advance payment recorded. ${result.totalAppliedToInvoices.toFixed(2)} adjusted against dues.`,
      summary: {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
        totalAppliedToInvoices: result.totalAppliedToInvoices,
        carryForwardCredit: result.carryForwardCredit
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', issues: error.issues });
    }

    return res.status(400).json({ message: 'Unable to record advance payment.' });
  }
});

feesRouter.delete('/fees/invoices/:invoiceId', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const invoice = await prisma.feeInvoice.findFirst({
      where: {
        id: req.params.invoiceId,
        student: {
          schoolId
        }
      }
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Fee invoice not found.' });
    }

    await prisma.feeInvoice.delete({ where: { id: invoice.id } });

    return res.json({ message: 'Fee invoice deleted successfully.' });
  } catch {
    return res.status(400).json({ message: 'Unable to delete fee invoice.' });
  }
});

feesRouter.delete('/fees/transactions', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const invoices = await prisma.feeInvoice.findMany({
      where: {
        student: {
          schoolId
        }
      },
      select: { id: true }
    });

    const invoiceIds = invoices.map((invoice: { id: string }) => invoice.id);

    await prisma.$transaction(async (tx: any) => {
      if (invoiceIds.length > 0) {
        await tx.feePayment.deleteMany({
          where: {
            invoiceId: {
              in: invoiceIds
            }
          }
        });
        await tx.feeInvoice.updateMany({
          where: {
            id: {
              in: invoiceIds
            }
          },
          data: {
            paidAmount: 0,
            status: 'UNPAID'
          }
        });
      }

      await tx.studentFeeCredit.updateMany({
        where: {
          student: {
            schoolId
          }
        },
        data: {
          balance: 0
        }
      });
    });

    return res.json({ message: 'Transaction log cleared successfully.' });
  } catch {
    return res.status(400).json({ message: 'Unable to clear transaction log.' });
  }
});

feesRouter.post('/fees/pay-stubs', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = createPayStubSchema.parse(req.body);

    const teacher = await prisma.user.findFirst({
      where: {
        id: payload.teacherId,
        schoolId,
        role: 'TEACHER'
      },
      select: { id: true }
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found.' });
    }

    const payStub = await prisma.payStub.create({
      data: {
        teacherId: teacher.id,
        month: payload.month,
        amount: payload.amount,
        note: payload.note
      }
    });

    return res.status(201).json({
      message: 'Pay stub issued successfully.',
      payStub
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', issues: error.issues });
    }

    return res.status(400).json({ message: 'Unable to issue pay stub.' });
  }
});

export { feesRouter };
