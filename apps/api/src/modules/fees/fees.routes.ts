import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../config/prisma.js';
import { env } from '../../env.js';
import { AuthenticatedRequest, requireStaffAuth } from '../../middleware/auth.js';
import { InvoiceService } from './invoice.service.js';

const feesRouter = Router();

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parseSafePositiveInt(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

const deleteKillSwitchEnabled = TRUTHY_VALUES.has((env.FEE_TRANSACTION_DELETE_KILL_SWITCH ?? '').toLowerCase());
const maxDeleteRowsPerRequest = parseSafePositiveInt(env.FEE_TRANSACTION_DELETE_MAX_ROWS, 200);
const auditIdSampleSize = parseSafePositiveInt(env.FEE_AUDIT_SAMPLE_SIZE, 25);

type FeeAuditEvent = {
  req: AuthenticatedRequest;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  affectedCount?: number;
  affectedIds?: string[];
  metadata?: Record<string, unknown>;
};

function resolveAuditSource(req: AuthenticatedRequest) {
  const schedulerSource = req.header('x-job-name')?.trim() || req.header('x-scheduler-name')?.trim();
  if (schedulerSource) {
    return `scheduler:${schedulerSource.slice(0, 80)}`;
  }

  return 'api';
}

function getForceDeletePayload(req: AuthenticatedRequest) {
  const forceDelete = typeof req.query.force === 'string' && req.query.force.toLowerCase() === 'true';
  const reason = typeof req.query.reason === 'string' ? req.query.reason.trim().slice(0, 500) : '';
  return { forceDelete, reason };
}

function getRequestIp(req: AuthenticatedRequest) {
  const forwarded = req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip;
}

async function writeFeeAuditEvent(event: FeeAuditEvent) {
  const { req } = event;
  const actor = req.auth;

  try {
    await prisma.feeMutationAudit.create({
      data: {
        schoolId: actor?.schoolId ?? 'UNKNOWN',
        actorUserId: actor?.userId,
        actorRole: actor?.role,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId ?? null,
        requestId: req.requestId ?? req.header('x-request-id') ?? null,
        method: req.method,
        route: req.originalUrl?.slice(0, 400) ?? null,
        source: resolveAuditSource(req),
        reason: event.reason ?? null,
        affectedCount: Number.isFinite(event.affectedCount) ? Number(event.affectedCount) : 0,
        affectedIds: event.affectedIds && event.affectedIds.length > 0 ? event.affectedIds.slice(0, auditIdSampleSize) : undefined,
        metadata: {
          ip: getRequestIp(req),
          userAgent: req.header('user-agent') ?? null,
          ...event.metadata
        }
      }
    });
  } catch (auditError) {
    console.error('Failed to write fee mutation audit event', auditError);
  }
}

const createInvoiceSchema = z.object({
  admissionNo: z.string().min(3),
  title: z.string().min(3),
  amount: z.number().positive().optional(),
  componentBreakdown: z
    .array(
      z.object({
        feeType: z.string().trim().min(1),
        cadence: z.enum(['MONTHLY', 'YEARLY', 'ONCE']).optional(),
        amount: z.number().positive()
      })
    )
    .optional(),
  dueDate: z.string().optional()
});

const createPayStubSchema = z.object({
  teacherId: z.string().min(1),
  month: z.string().min(7),
  amount: z.number().positive(),
  note: z.string().optional()
});

const feeMonthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const paymentDatePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const payFeeInvoiceSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(['UPI', 'CASH', 'CHEQUE']),
  feeType: z.string().min(1).optional(),
  feeTypeAllocations: z
    .array(
      z.object({
        feeType: z.string().trim().min(1),
        amount: z.number().positive()
      })
    )
    .optional(),
  paymentDate: z.string().regex(paymentDatePattern).optional(),
  feeMonth: z.string().regex(feeMonthPattern).optional(),
    academicSession: z.string().trim().min(1).max(20).optional(),
    transactionId: z.string().trim().min(1).max(100).optional(),
    checkNumber: z.string().trim().min(1).max(100).optional()
});

const recordAdvancePaymentSchema = z.object({
  amount: z.number().positive(),
    paymentMethod: z.enum(['UPI', 'CASH', 'CHEQUE']),
  feeType: z.string().min(1).optional(),
  sourceInvoiceId: z.string().min(1).optional(),
  paymentDate: z.string().regex(paymentDatePattern).optional(),
  feeMonth: z.string().regex(feeMonthPattern).optional(),
    academicSession: z.string().trim().min(1).max(20).optional(),
    transactionId: z.string().trim().min(1).max(100).optional(),
    checkNumber: z.string().trim().min(1).max(100).optional()
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

type FeeComponentCadence = 'MONTHLY' | 'YEARLY' | 'ONCE';
type InvoiceComponentSnapshotEntry = {
  feeType: string;
  amount: number;
  cadence: FeeComponentCadence | null;
};

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

function deriveAcademicSessionFromDate(date: Date) {
  return deriveAcademicSessionFromFeeMonth(deriveFeeMonthFromDate(date));
}

function buildAnnualFeeInvoiceTitle(academicSession: string) {
  return `Annual Fee Invoice (${academicSession})`;
}

function isAnnualFeeInvoiceTitle(title: string) {
  return /^Annual Fee Invoice \(\d{4}-\d{2}\)$/.test(title.trim());
}

function parsePaymentDate(paymentDate: string | undefined) {
  if (!paymentDate) {
    return new Date();
  }

  if (!paymentDatePattern.test(paymentDate)) {
    return null;
  }

  const parsed = new Date(`${paymentDate}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveFeeMonth(feeMonth: string | undefined, fallbackDate: Date) {
  if (feeMonth && feeMonthPattern.test(feeMonth)) {
    return feeMonth;
  }

  return deriveFeeMonthFromDate(fallbackDate);
}

function resolveAcademicSession(academicSession: string | undefined, feeMonth: string) {
  const normalizedSession = academicSession?.trim() ?? '';
  if (normalizedSession.length > 0) {
    return normalizedSession;
  }

  return deriveAcademicSessionFromFeeMonth(feeMonth);
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
  const metadata = await InvoiceService.buildCreateData(tx, {
    dueDate,
    subtotal: 0,
    discount: 0,
    total: 0,
    paymentStatus: 'PAID'
  });

  const createdLedger = await tx.feeInvoice.create({
    data: {
      studentId,
      title: 'Advance Credit Ledger',
      invoiceNumber: metadata.invoiceNumber,
      academicYearId: metadata.academicYearId,
      invoiceSequence: metadata.invoiceSequence,
      billingPeriod: metadata.billingPeriod,
      invoiceDate: metadata.invoiceDate,
      subtotal: metadata.subtotal,
      discount: metadata.discount,
      total: metadata.total,
      amount: 0,
      paidAmount: 0,
      dueDate: metadata.dueDate,
      paymentStatus: metadata.paymentStatus,
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

function serializeInvoiceComponentSnapshot(componentBreakdown: Array<{ feeType: string; amount: number; cadence?: FeeComponentCadence | null }> | undefined) {
  const normalizedBreakdown = (componentBreakdown ?? [])
    .map((entry) => ({
      feeType: entry.feeType.trim(),
      cadence: entry.cadence ?? null,
      amount: Number(entry.amount)
    }))
    .filter((entry) => entry.feeType.length > 0 && Number.isFinite(entry.amount) && entry.amount > 0);

  if (normalizedBreakdown.length === 0) {
    return null;
  }

  return JSON.stringify(normalizedBreakdown);
}

function parseInvoiceComponentSnapshot(componentSnapshot: string | null | undefined) {
  if (!componentSnapshot) {
    return [] as InvoiceComponentSnapshotEntry[];
  }

  try {
    const parsed = JSON.parse(componentSnapshot) as Array<{ feeType?: string; amount?: number; cadence?: string | null }>;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => ({
        feeType: typeof entry.feeType === 'string' ? entry.feeType.trim() : '',
        cadence: entry.cadence === 'MONTHLY' || entry.cadence === 'YEARLY' || entry.cadence === 'ONCE' ? entry.cadence : null,
        amount: Number(entry.amount ?? 0)
      }))
      .filter((entry) => entry.feeType.length > 0 && Number.isFinite(entry.amount) && entry.amount > 0);
  } catch {
    return [] as InvoiceComponentSnapshotEntry[];
  }
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
      const normalizedFeeTypes = payload.components.map((component) => component.feeType.trim().toLowerCase()).filter(Boolean);
      const uniqueFeeTypes = new Set(normalizedFeeTypes);
      if (uniqueFeeTypes.size !== normalizedFeeTypes.length) {
        throw new Error('Duplicate fee types are not allowed in the fee component list.');
      }

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
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const queryTerms = rawQuery
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 0)

    const studentSearchFilter = queryTerms.length > 0
      ? {
          AND: queryTerms.map((term) => ({
            OR: [
              { admissionNo: { contains: term, mode: 'insensitive' as const } },
              { firstName: { contains: term, mode: 'insensitive' as const } },
              { lastName: { contains: term, mode: 'insensitive' as const } }
            ]
          }))
        }
      : undefined;

    const invoices = await prisma.feeInvoice.findMany({
      where: {
        student: {
          schoolId,
          ...(studentSearchFilter ?? {})
        }
      },
      orderBy: { createdAt: 'desc' },
      ...(queryTerms.length > 0 ? {} : { take: 50 }),
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

feesRouter.get('/fees/invoices/:invoiceId', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    let invoice: any;

    try {
      invoice = await prisma.feeInvoice.findFirst({
        where: {
          id: req.params.invoiceId,
          student: {
            schoolId
          }
        },
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
          },
          payments: {
            orderBy: {
              createdAt: 'asc'
            },
            select: {
              id: true,
              amount: true,
              paymentMethod: true,
              feeType: true,
              paymentDate: true,
              feeMonth: true,
              academicSession: true,
              transactionId: true,
              checkNumber: true,
              dueAfterPayment: true,
              createdAt: true
            }
          }
        }
      });
    } catch (selectError) {
      const rawSelectErrorMessage = selectError instanceof Error ? selectError.message : '';
      const likelyLegacySchema =
        rawSelectErrorMessage.includes('transactionId') ||
        rawSelectErrorMessage.includes('checkNumber');

      if (!likelyLegacySchema) {
        throw selectError;
      }

      // Fallback query for deployments where DB migration for payment refs is not applied yet.
      invoice = await prisma.feeInvoice.findFirst({
        where: {
          id: req.params.invoiceId,
          student: {
            schoolId
          }
        },
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
          },
          payments: {
            orderBy: {
              createdAt: 'asc'
            },
            select: {
              id: true,
              amount: true,
              paymentMethod: true,
              feeType: true,
              paymentDate: true,
              feeMonth: true,
              academicSession: true,
              dueAfterPayment: true,
              createdAt: true
            }
          }
        }
      });
    }

    if (!invoice) {
      return res.status(404).json({ message: 'Fee invoice not found.' });
    }

    const amount = Number(invoice.amount);
    const paidAmount = Number(invoice.paidAmount);

    return res.json({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      title: invoice.title,
      amount,
      paidAmount,
      due: Math.max(amount - paidAmount, 0),
      dueDate: invoice.dueDate,
      status: invoice.status,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      componentBreakdown: parseInvoiceComponentSnapshot(invoice.componentSnapshot),
      student: {
        id: invoice.student.id,
        admissionNo: invoice.student.admissionNo,
        firstName: invoice.student.firstName,
        lastName: invoice.student.lastName,
        className: invoice.student.className,
        section: invoice.student.section
      },
      payments: invoice.payments.map((payment: any) => ({
        id: payment.id,
        amount: Number(payment.amount),
        paymentMethod: payment.paymentMethod,
        feeType: payment.feeType,
        paymentDate: payment.paymentDate,
        feeMonth: payment.feeMonth,
        academicSession: payment.academicSession,
        transactionId: 'transactionId' in payment ? payment.transactionId : null,
        checkNumber: 'checkNumber' in payment ? payment.checkNumber : null,
        dueAfterPayment: Number(payment.dueAfterPayment),
        createdAt: payment.createdAt
      }))
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '';
    const message =
      rawMessage.includes('transactionId') || rawMessage.includes('checkNumber')
        ? 'Payment schema is out of sync with the database. Run migrations and restart the API server.'
        : rawMessage || 'Unable to load fee invoice details.';

    console.error('Unable to load fee invoice details', error);
    return res.status(503).json({ message });
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
            paymentDate: true,
            feeMonth: true,
            academicSession: true,
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
      ['Payment ID', 'Payment Date', 'Fee Month', 'Academic Session', 'Logged At', 'Amount', 'Method', 'Fee Type', 'Due After Payment']
    ];

    if (invoice.payments.length === 0) {
      rows.push(['-', '-', '-', '-', '-', '-', '-', '-', '-']);
    } else {
      invoice.payments.forEach((payment: (typeof invoice.payments)[number]) => {
        rows.push([
          payment.id,
          payment.paymentDate.toISOString(),
          payment.feeMonth ?? '',
          payment.academicSession ?? '',
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
    const annualFeeInvoice = isAnnualFeeInvoiceTitle(payload.title);

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

      invoiceAmount = Math.max(annualFeeInvoice ? normalizedAssignment.annualTotal : normalizedAssignment.installmentAmount, 0);
    }

    if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
      return res.status(400).json({ message: 'Invoice amount must be greater than zero.' });
    }

    const dueDate = payload.dueDate ? new Date(payload.dueDate) : getNextDueDate(school.feeDueDayOfMonth);

    if (Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({ message: 'Invalid due date.' });
    }

    dueDate.setHours(12, 0, 0, 0);

    if (annualFeeInvoice) {
      const requestedComponents = (payload.componentBreakdown ?? [])
        .map((entry) => ({
          feeType: entry.feeType.trim(),
          cadence: entry.cadence ?? null
        }))
        .filter((entry) => entry.feeType.length > 0);

      if (requestedComponents.length === 0) {
        return res.status(400).json({ message: 'Select at least one fee component while creating annual invoice.' });
      }

      const currentAcademicSession = deriveAcademicSessionFromDate(dueDate);
      const currentFeeMonth = deriveFeeMonthFromDate(dueDate);

      const existingAnnualInvoices = await prisma.feeInvoice.findMany({
        where: {
          studentId: student.id
        },
        select: {
          id: true,
          dueDate: true,
          componentSnapshot: true
        }
      });

      const existingSnapshotRows = existingAnnualInvoices.flatMap(
        (invoice: { componentSnapshot: string | null; dueDate: Date }) =>
          parseInvoiceComponentSnapshot(invoice.componentSnapshot).map((entry: { feeType: string; cadence: string | null }) => ({
            feeType: entry.feeType.trim().toLowerCase(),
            cadence: entry.cadence as InvoiceComponentSnapshotEntry['cadence'],
            academicSession: deriveAcademicSessionFromDate(invoice.dueDate),
            feeMonth: deriveFeeMonthFromDate(invoice.dueDate)
          }))
      );

      const overlappingFeeTypes = requestedComponents.filter((requested) => {
        const normalizedFeeType = requested.feeType.toLowerCase();

        if (requested.cadence === 'ONCE') {
          return existingSnapshotRows.some((entry: { feeType: string; cadence: InvoiceComponentSnapshotEntry['cadence']; academicSession: string; feeMonth: string }) => entry.feeType === normalizedFeeType);
        }

        if (requested.cadence === 'YEARLY') {
          return existingSnapshotRows.some((entry: { feeType: string; cadence: InvoiceComponentSnapshotEntry['cadence']; academicSession: string; feeMonth: string }) => entry.feeType === normalizedFeeType && entry.academicSession === currentAcademicSession);
        }

        if (requested.cadence === 'MONTHLY') {
          return existingSnapshotRows.some((entry: { feeType: string; cadence: InvoiceComponentSnapshotEntry['cadence']; academicSession: string; feeMonth: string }) => entry.feeType === normalizedFeeType && entry.feeMonth === currentFeeMonth);
        }

        return existingSnapshotRows.some((entry: { feeType: string; cadence: InvoiceComponentSnapshotEntry['cadence']; academicSession: string; feeMonth: string }) => entry.feeType === normalizedFeeType && entry.academicSession === currentAcademicSession);
      });

      if (overlappingFeeTypes.length > 0) {
        const overlappingLabels = overlappingFeeTypes.map((entry) => entry.feeType).join(', ');
        return res.status(409).json({
          message: `Invoice already exists for these fee component(s): ${overlappingLabels}.`
        });
      }
    } else {
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
    }

    const { invoice, creditApplied } = await prisma.$transaction(async (tx: any) => {
      const { appliedAmount } = await consumeStudentCredit(tx, student.id, invoiceAmount);
      const paidAmount = Math.max(appliedAmount, 0);
      const status = resolveInvoiceStatus(invoiceAmount, paidAmount);
      const subtotal = Math.max(
        (payload.componentBreakdown ?? []).reduce((sum, component) => sum + Number(component.amount), 0),
        invoiceAmount
      );
      const discount = Math.max(subtotal - invoiceAmount, 0);
      const metadata = await InvoiceService.buildCreateData(tx, {
        dueDate,
        subtotal,
        discount,
        total: invoiceAmount,
        paymentStatus: status
      });

      const createdInvoice = await tx.feeInvoice.create({
        data: {
          studentId: student.id,
          invoiceNumber: metadata.invoiceNumber,
          academicYearId: metadata.academicYearId,
          invoiceSequence: metadata.invoiceSequence,
          billingPeriod: metadata.billingPeriod,
          invoiceDate: metadata.invoiceDate,
          title: payload.title,
          componentSnapshot: serializeInvoiceComponentSnapshot(payload.componentBreakdown),
          subtotal: metadata.subtotal,
          discount: metadata.discount,
          total: metadata.total,
          amount: invoiceAmount,
          paidAmount,
          dueDate: metadata.dueDate,
          paymentStatus: metadata.paymentStatus,
          status
        }
      });

      if (paidAmount > 0) {
        const creditFeeMonth = deriveFeeMonthFromDate(dueDate);
        await tx.feePayment.create({
          data: {
            invoiceId: createdInvoice.id,
            amount: paidAmount,
            paymentMethod: 'UPI',
            feeType: 'Advance Applied (Auto Deduction)',
            paymentDate: new Date(),
            feeMonth: creditFeeMonth,
            academicSession: deriveAcademicSessionFromFeeMonth(creditFeeMonth),
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

      const annualAmount = Math.max(normalizedAssignment.annualTotal, 0);
      if (annualAmount <= 0) {
        skippedReasons.invalidInstallment += 1;
        continue;
      }

      const dueDate = getNextDueDate(school.feeDueDayOfMonth);
      const academicSession = deriveAcademicSessionFromDate(dueDate);
      const annualInvoiceTitle = buildAnnualFeeInvoiceTitle(academicSession);

      const existingInvoice = await prisma.feeInvoice.findFirst({
        where: {
          studentId: assignment.studentId,
          title: annualInvoiceTitle
        }
      });

      if (existingInvoice) {
        skippedReasons.existingInvoiceForDueDate += 1;
        continue;
      }

      await prisma.$transaction(async (tx: any) => {
        const { appliedAmount } = await consumeStudentCredit(tx, assignment.studentId, annualAmount);
        const paidAmount = Math.max(appliedAmount, 0);
        const status = resolveInvoiceStatus(annualAmount, paidAmount);
        const subtotal = Math.max(normalizedAssignment.subtotal, annualAmount);
        const discount = Math.max(subtotal - annualAmount, 0);
        const metadata = await InvoiceService.buildCreateData(tx, {
          dueDate,
          subtotal,
          discount,
          total: annualAmount,
          paymentStatus: status
        });

        const createdInvoice = await tx.feeInvoice.create({
          data: {
            studentId: assignment.studentId,
            invoiceNumber: metadata.invoiceNumber,
            academicYearId: metadata.academicYearId,
            invoiceSequence: metadata.invoiceSequence,
            billingPeriod: metadata.billingPeriod,
            invoiceDate: metadata.invoiceDate,
            title: annualInvoiceTitle,
            subtotal: metadata.subtotal,
            discount: metadata.discount,
            total: metadata.total,
            amount: annualAmount,
            paidAmount,
            dueDate: metadata.dueDate,
            paymentStatus: metadata.paymentStatus,
            status
          }
        });

        if (paidAmount > 0) {
          const creditFeeMonth = deriveFeeMonthFromDate(dueDate);
          await tx.feePayment.create({
            data: {
              invoiceId: createdInvoice.id,
              amount: paidAmount,
              paymentMethod: 'UPI',
              feeType: 'Advance Applied (Auto Deduction)',
              paymentDate: new Date(),
              feeMonth: creditFeeMonth,
              academicSession: deriveAcademicSessionFromFeeMonth(creditFeeMonth),
              dueAfterPayment: Math.max(annualAmount - paidAmount, 0)
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

    const paymentDate = parsePaymentDate(payload.paymentDate);
    if (!paymentDate) {
      return res.status(400).json({ message: 'Invalid payment date.' });
    }

    if (payload.paymentMethod === 'UPI' && !payload.transactionId?.trim()) {
      return res.status(400).json({ message: 'Transaction ID is required for UPI payments.' });
    }

    if (payload.paymentMethod === 'CHEQUE' && !payload.checkNumber?.trim()) {
      return res.status(400).json({ message: 'Check number is required for cheque payments.' });
    }

    const feeMonth = resolveFeeMonth(payload.feeMonth, invoice.dueDate);
    const academicSession = resolveAcademicSession(payload.academicSession, feeMonth);

    const normalizedAllocations = (payload.feeTypeAllocations ?? [])
      .map((allocation) => ({
        feeType: allocation.feeType.trim(),
        amount: Number(allocation.amount)
      }))
      .filter((allocation) => allocation.feeType.length > 0 && Number.isFinite(allocation.amount) && allocation.amount > 0);

    const allocatedAmount = normalizedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    const requestedAmount = normalizedAllocations.length > 0 ? allocatedAmount : Number(payload.amount);
    const payAmount = Math.min(requestedAmount, due);
    const overpaidAmount = Math.max(requestedAmount - due, 0);

    if (payAmount <= 0 && overpaidAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero.' });
    }

    if (normalizedAllocations.length > 0 && Math.abs(allocatedAmount - Number(payload.amount)) > 0.009) {
      return res.status(400).json({ message: 'Fee type allocation total must match the payment amount.' });
    }

    const nextPaidAmount = alreadyPaid + payAmount;
    const nextDue = Math.max(amount - nextPaidAmount, 0);

    const result = await prisma.$transaction(async (tx: any) => {
      const paymentAllocations = normalizedAllocations.length > 0
        ? normalizedAllocations
        : [{ feeType: payload.feeType?.trim() || 'General', amount: payAmount }];

      let remainingPayAmount = payAmount;
      let runningDue = due;

      for (const allocation of paymentAllocations) {
        if (remainingPayAmount <= 0) {
          break;
        }

        const allocationAmount = Math.min(allocation.amount, remainingPayAmount);
        if (allocationAmount <= 0) {
          continue;
        }

        runningDue = Math.max(runningDue - allocationAmount, 0);

        await tx.feePayment.create({
          data: {
            invoiceId: invoice.id,
            amount: allocationAmount,
            paymentMethod: payload.paymentMethod,
            feeType: allocation.feeType,
            paymentDate,
            feeMonth,
            academicSession,
            transactionId: payload.transactionId?.trim() || undefined,
            checkNumber: payload.checkNumber?.trim() || undefined,
            dueAfterPayment: runningDue
          }
        });

        remainingPayAmount -= allocationAmount;
      }

      const updatedInvoice = await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: nextPaidAmount,
          paymentStatus: nextDue <= 0 ? 'PAID' : 'PARTIAL',
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
            paymentDate,
            feeMonth,
            academicSession,
            transactionId: payload.transactionId?.trim() || undefined,
            checkNumber: payload.checkNumber?.trim() || undefined,
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

    await writeFeeAuditEvent({
      req,
      action: 'FEE_PAYMENT_RECORDED',
      resourceType: 'FeeInvoice',
      resourceId: invoice.id,
      affectedCount: normalizedAllocations.length + (overpaidAmount > 0 ? 1 : 0),
      metadata: {
        studentId: invoice.studentId,
        requestedAmount,
        appliedAmount: payAmount,
        overpaidAmount,
        nextDue,
        paymentMethod: payload.paymentMethod,
        feeMonth,
        academicSession,
        allocationCount: normalizedAllocations.length
      }
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

    const rawMessage = error instanceof Error ? error.message : '';
    const message =
      rawMessage.includes('transactionId') || rawMessage.includes('checkNumber')
        ? 'Payment schema is out of sync with the database. Run migrations and restart the API server.'
        : rawMessage || 'Unable to process fee payment.';

    console.error('Fee payment processing failed', error);
    return res.status(400).json({ message });
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

    const paymentDate = parsePaymentDate(payload.paymentDate);
    if (!paymentDate) {
      return res.status(400).json({ message: 'Invalid payment date.' });
    }

    if (payload.paymentMethod === 'UPI' && !payload.transactionId?.trim()) {
      return res.status(400).json({ message: 'Transaction ID is required for UPI payments.' });
    }

    if (payload.paymentMethod === 'CHEQUE' && !payload.checkNumber?.trim()) {
      return res.status(400).json({ message: 'Check number is required for cheque payments.' });
    }

    const normalizedFeeMonth = payload.feeMonth && feeMonthPattern.test(payload.feeMonth) ? payload.feeMonth : undefined;
    const normalizedAcademicSession = payload.academicSession?.trim() ? payload.academicSession.trim() : undefined;

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
        const allocationFeeMonth = normalizedFeeMonth ?? deriveFeeMonthFromDate(new Date(invoice.dueDate));
        const allocationAcademicSession = normalizedAcademicSession ?? deriveAcademicSessionFromFeeMonth(allocationFeeMonth);

        await tx.feePayment.create({
          data: {
            invoiceId: invoice.id,
            amount: payAmount,
            paymentMethod: payload.paymentMethod,
            feeType: payload.feeType?.trim() ? `${payload.feeType.trim()} (Advance Applied)` : 'Advance Applied',
            paymentDate,
            feeMonth: allocationFeeMonth,
            academicSession: allocationAcademicSession,
            transactionId: payload.transactionId?.trim() || undefined,
            checkNumber: payload.checkNumber?.trim() || undefined,
            dueAfterPayment: nextDue
          }
        });

        await tx.feeInvoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: nextPaidAmount,
            paymentStatus: nextDue <= 0 ? 'PAID' : 'PARTIAL',
            status: nextDue <= 0 ? 'PAID' : 'PARTIAL'
          }
        });

        totalAppliedToInvoices += payAmount;
        remainingAmount -= payAmount;
      }

      if (remainingAmount > 0) {
        const creditFeeType = payload.feeType?.trim() ? `${payload.feeType.trim()} (Advance Credit)` : 'Advance Credit';
        let creditMonthReferenceDate = paymentDate;

        let advanceLogInvoiceId: string;
        if (payload.sourceInvoiceId) {
          advanceLogInvoiceId = payload.sourceInvoiceId;
          const sourceInvoice = orderedInvoices.find((invoice: any) => invoice.id === payload.sourceInvoiceId);
          if (sourceInvoice?.dueDate) {
            creditMonthReferenceDate = new Date(sourceInvoice.dueDate);
          }
        } else if (orderedInvoices.length > 0) {
          advanceLogInvoiceId = orderedInvoices[0].id;
          if (orderedInvoices[0].dueDate) {
            creditMonthReferenceDate = new Date(orderedInvoices[0].dueDate);
          }
        } else {
          const latestInvoice = await tx.feeInvoice.findFirst({
            where: { studentId: student.id },
            orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
            select: { id: true, dueDate: true }
          });

          advanceLogInvoiceId = latestInvoice?.id ?? (await ensureAdvanceCreditLedgerInvoice(tx, student.id));
          if (latestInvoice?.dueDate) {
            creditMonthReferenceDate = latestInvoice.dueDate;
          }
        }

        const creditFeeMonth = normalizedFeeMonth ?? deriveFeeMonthFromDate(creditMonthReferenceDate);
        const creditAcademicSession = normalizedAcademicSession ?? deriveAcademicSessionFromFeeMonth(creditFeeMonth);

        await tx.feePayment.create({
          data: {
            invoiceId: advanceLogInvoiceId,
            amount: remainingAmount,
            paymentMethod: payload.paymentMethod,
            feeType: creditFeeType,
            paymentDate,
            feeMonth: creditFeeMonth,
            academicSession: creditAcademicSession,
            transactionId: payload.transactionId?.trim() || undefined,
            checkNumber: payload.checkNumber?.trim() || undefined,
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

    await writeFeeAuditEvent({
      req,
      action: 'STUDENT_ADVANCE_PAYMENT_RECORDED',
      resourceType: 'Student',
      resourceId: student.id,
      metadata: {
        studentAdmissionNo: student.admissionNo,
        studentName: `${student.firstName} ${student.lastName}`,
        requestedAmount: Number(payload.amount),
        totalAppliedToInvoices: result.totalAppliedToInvoices,
        carryForwardCredit: result.carryForwardCredit,
        paymentMethod: payload.paymentMethod,
        sourceInvoiceId: payload.sourceInvoiceId ?? null,
        feeMonth: normalizedFeeMonth ?? null,
        academicSession: normalizedAcademicSession ?? null
      }
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

    const rawMessage = error instanceof Error ? error.message : '';
    const message =
      rawMessage.includes('transactionId') || rawMessage.includes('checkNumber')
        ? 'Payment schema is out of sync with the database. Run migrations and restart the API server.'
        : rawMessage || 'Unable to record advance payment.';

    console.error('Advance payment processing failed', error);
    return res.status(400).json({ message });
  }
});

feesRouter.get('/fees/audit-trail', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
    const resourceType = typeof req.query.resourceType === 'string' ? req.query.resourceType.trim() : '';
    const resourceId = typeof req.query.resourceId === 'string' ? req.query.resourceId.trim() : '';
    const requestId = typeof req.query.requestId === 'string' ? req.query.requestId.trim() : '';
    const from = typeof req.query.from === 'string' ? new Date(req.query.from) : null;
    const to = typeof req.query.to === 'string' ? new Date(req.query.to) : null;
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 100, 1), 500);

    const where: any = { schoolId };

    if (action.length > 0) where.action = action;
    if (resourceType.length > 0) where.resourceType = resourceType;
    if (resourceId.length > 0) where.resourceId = resourceId;
    if (requestId.length > 0) where.requestId = requestId;

    if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
      where.createdAt = {};
      if (from && !Number.isNaN(from.getTime())) where.createdAt.gte = from;
      if (to && !Number.isNaN(to.getTime())) where.createdAt.lte = to;
    }

    const events = await prisma.feeMutationAudit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return res.json({
      count: events.length,
      events
    });
  } catch {
    return res.status(400).json({ message: 'Unable to fetch fee audit trail.' });
  }
});

feesRouter.delete('/fees/invoices/:invoiceId', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const actorRole = req.auth!.role;
    const { forceDelete, reason } = getForceDeletePayload(req);

    if (deleteKillSwitchEnabled) {
      await writeFeeAuditEvent({
        req,
        action: 'FEE_INVOICE_DELETE_BLOCKED',
        resourceType: 'FeeInvoice',
        resourceId: req.params.invoiceId,
        reason: 'Fee transaction delete kill switch is enabled.',
        metadata: { killSwitchEnabled: true }
      });

      return res.status(423).json({
        message: 'Deletion is temporarily disabled by guardrails. Contact SUPER_ADMIN to review audit logs.'
      });
    }

    if (forceDelete && actorRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Only SUPER_ADMIN can force large delete operations.' });
    }

    if (forceDelete && reason.length === 0) {
      return res.status(400).json({ message: 'A reason is required when force=true.' });
    }

    const invoice = await prisma.feeInvoice.findFirst({
      where: {
        id: req.params.invoiceId,
        student: {
          schoolId
        }
      },
      select: {
        id: true,
        studentId: true,
        invoiceNumber: true,
        title: true
      }
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Fee invoice not found.' });
    }

    const [linkedPaymentCount, linkedPaymentSample] = await Promise.all([
      prisma.feePayment.count({ where: { invoiceId: invoice.id } }),
      prisma.feePayment.findMany({
        where: { invoiceId: invoice.id },
        orderBy: { createdAt: 'desc' },
        take: auditIdSampleSize,
        select: { id: true }
      })
    ]);

    if (linkedPaymentCount > maxDeleteRowsPerRequest && !forceDelete) {
      await writeFeeAuditEvent({
        req,
        action: 'FEE_INVOICE_DELETE_BLOCKED',
        resourceType: 'FeeInvoice',
        resourceId: invoice.id,
        reason: `Delete threshold exceeded (${linkedPaymentCount} > ${maxDeleteRowsPerRequest}).`,
        affectedCount: linkedPaymentCount,
        affectedIds: linkedPaymentSample.map((payment: { id: string }) => payment.id),
        metadata: {
          guardrail: 'maxDeleteRowsPerRequest',
          threshold: maxDeleteRowsPerRequest,
          forceDelete
        }
      });

      return res.status(409).json({
        message: `Guardrail blocked delete because it would remove ${linkedPaymentCount} payment records. Retry with force=true&reason=<ticket> as SUPER_ADMIN if this is intentional.`
      });
    }

    await prisma.feeInvoice.delete({ where: { id: invoice.id } });

    await writeFeeAuditEvent({
      req,
      action: 'FEE_INVOICE_DELETED',
      resourceType: 'FeeInvoice',
      resourceId: invoice.id,
      reason: reason || null,
      affectedCount: linkedPaymentCount + 1,
      affectedIds: [invoice.id, ...linkedPaymentSample.map((payment: { id: string }) => payment.id)],
      metadata: {
        studentId: invoice.studentId,
        invoiceNumber: invoice.invoiceNumber,
        invoiceTitle: invoice.title,
        linkedPaymentCount,
        forceDelete
      }
    });

    return res.json({ message: 'Fee invoice deleted successfully.' });
  } catch (error) {
    await writeFeeAuditEvent({
      req,
      action: 'FEE_INVOICE_DELETE_FAILED',
      resourceType: 'FeeInvoice',
      resourceId: req.params.invoiceId,
      reason: error instanceof Error ? error.message.slice(0, 500) : 'Unknown delete failure.'
    });

    return res.status(400).json({ message: 'Unable to delete fee invoice.' });
  }
});

feesRouter.delete('/fees/transactions/:transactionId', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;

    if (deleteKillSwitchEnabled) {
      await writeFeeAuditEvent({
        req,
        action: 'FEE_PAYMENT_DELETE_BLOCKED',
        resourceType: 'FeePayment',
        resourceId: req.params.transactionId,
        reason: 'Fee transaction delete kill switch is enabled.',
        metadata: { killSwitchEnabled: true }
      });

      return res.status(423).json({
        message: 'Deletion is temporarily disabled by guardrails. Contact SUPER_ADMIN to review audit logs.'
      });
    }

    const payment = await prisma.feePayment.findFirst({
      where: {
        id: req.params.transactionId,
        invoice: {
          student: {
            schoolId
          }
        }
      },
      include: {
        invoice: {
          select: {
            id: true,
            amount: true,
            paidAmount: true
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    const normalizedFeeType = (payment.feeType ?? '').toLowerCase();
    if (normalizedFeeType.includes('advance')) {
      await writeFeeAuditEvent({
        req,
        action: 'FEE_PAYMENT_DELETE_BLOCKED',
        resourceType: 'FeePayment',
        resourceId: payment.id,
        reason: 'Advance-related entries are not deletable individually.',
        metadata: {
          invoiceId: payment.invoice.id,
          feeType: payment.feeType ?? null
        }
      });

      return res.status(400).json({
        message: 'Advance-related transactions cannot be deleted individually. Use dedicated advance adjustments instead.'
      });
    }

    const invoiceAmount = Number(payment.invoice.amount);
    const invoicePaidAmount = Number(payment.invoice.paidAmount);
    const paymentAmount = Number(payment.amount);
    const nextPaidAmount = Math.max(invoicePaidAmount - paymentAmount, 0);
    const nextDue = Math.max(invoiceAmount - nextPaidAmount, 0);
    const nextStatus = nextDue <= 0 ? 'PAID' : nextPaidAmount > 0 ? 'PARTIAL' : 'UNPAID';

    await prisma.$transaction(async (tx: any) => {
      await tx.feePayment.delete({
        where: { id: payment.id }
      });

      await tx.feeInvoice.update({
        where: { id: payment.invoice.id },
        data: {
          paidAmount: nextPaidAmount,
          paymentStatus: nextStatus,
          status: nextStatus
        }
      });
    });

    await writeFeeAuditEvent({
      req,
      action: 'FEE_PAYMENT_DELETED',
      resourceType: 'FeePayment',
      resourceId: payment.id,
      affectedCount: 1,
      affectedIds: [payment.id],
      metadata: {
        invoiceId: payment.invoice.id,
        paymentAmount,
        invoiceDueAfterDelete: nextDue,
        invoiceStatusAfterDelete: nextStatus
      }
    });

    return res.json({ message: 'Transaction deleted successfully.' });
  } catch (error) {
    await writeFeeAuditEvent({
      req,
      action: 'FEE_PAYMENT_DELETE_FAILED',
      resourceType: 'FeePayment',
      resourceId: req.params.transactionId,
      reason: error instanceof Error ? error.message.slice(0, 500) : 'Unknown delete failure.'
    });

    return res.status(400).json({ message: 'Unable to delete transaction.' });
  }
});

feesRouter.delete('/fees/transactions', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const actorRole = req.auth!.role;
    const { forceDelete, reason } = getForceDeletePayload(req);
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId.trim() : '';

    if (deleteKillSwitchEnabled) {
      await writeFeeAuditEvent({
        req,
        action: 'STUDENT_TRANSACTION_CLEAR_BLOCKED',
        resourceType: 'Student',
        resourceId: studentId || null,
        reason: 'Fee transaction delete kill switch is enabled.',
        metadata: { killSwitchEnabled: true }
      });

      return res.status(423).json({
        message: 'Transaction clear is temporarily disabled by guardrails. Contact SUPER_ADMIN to review audit logs.'
      });
    }

    if (forceDelete && actorRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Only SUPER_ADMIN can force large delete operations.' });
    }

    if (forceDelete && reason.length === 0) {
      return res.status(400).json({ message: 'A reason is required when force=true.' });
    }

    if (!studentId) {
      return res.status(400).json({
        message: 'studentId is required. Global transaction clearing is disabled for safety.'
      });
    }

    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        schoolId
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

    const invoices = await prisma.feeInvoice.findMany({
      where: {
        studentId: student.id
      },
      select: { id: true }
    });

    const invoiceIds = invoices.map((invoice: { id: string }) => invoice.id);

    const [paymentCount, paymentSample] = invoiceIds.length
      ? await Promise.all([
          prisma.feePayment.count({
            where: {
              invoiceId: {
                in: invoiceIds
              }
            }
          }),
          prisma.feePayment.findMany({
            where: {
              invoiceId: {
                in: invoiceIds
              }
            },
            orderBy: { createdAt: 'desc' },
            take: auditIdSampleSize,
            select: { id: true }
          })
        ])
      : [0, [] as Array<{ id: string }>];

    if (paymentCount > maxDeleteRowsPerRequest && !forceDelete) {
      await writeFeeAuditEvent({
        req,
        action: 'STUDENT_TRANSACTION_CLEAR_BLOCKED',
        resourceType: 'Student',
        resourceId: student.id,
        reason: `Delete threshold exceeded (${paymentCount} > ${maxDeleteRowsPerRequest}).`,
        affectedCount: paymentCount,
        affectedIds: paymentSample.map((payment: { id: string }) => payment.id),
        metadata: {
          studentAdmissionNo: student.admissionNo,
          threshold: maxDeleteRowsPerRequest,
          forceDelete
        }
      });

      return res.status(409).json({
        message: `Guardrail blocked transaction clear because it would remove ${paymentCount} payment records. Retry with force=true&reason=<ticket> as SUPER_ADMIN if this is intentional.`
      });
    }

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
            paymentStatus: 'UNPAID',
            status: 'UNPAID'
          }
        });
      }

      await tx.studentFeeCredit.updateMany({
        where: {
          studentId: student.id
        },
        data: {
          balance: 0
        }
      });
    });

    await writeFeeAuditEvent({
      req,
      action: 'STUDENT_TRANSACTION_CLEARED',
      resourceType: 'Student',
      resourceId: student.id,
      reason: reason || null,
      affectedCount: paymentCount,
      affectedIds: paymentSample.map((payment: { id: string }) => payment.id),
      metadata: {
        studentAdmissionNo: student.admissionNo,
        studentName: `${student.firstName} ${student.lastName}`,
        invoiceCount: invoiceIds.length,
        forceDelete,
        creditsResetToZero: true
      }
    });

    return res.json({
      message: 'Selected student transaction log cleared successfully.',
      summary: {
        studentId: student.id,
        clearedPayments: paymentCount,
        invoiceCount: invoiceIds.length
      }
    });
  } catch (error) {
    await writeFeeAuditEvent({
      req,
      action: 'STUDENT_TRANSACTION_CLEAR_FAILED',
      resourceType: 'Student',
      resourceId: typeof req.query.studentId === 'string' ? req.query.studentId : null,
      reason: error instanceof Error ? error.message.slice(0, 500) : 'Unknown clear failure.'
    });

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
