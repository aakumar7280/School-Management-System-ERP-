import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../config/prisma.js';
import { AuthenticatedRequest, requireStaffAuth } from '../../middleware/auth.js';

const feesRouter = Router();

const createInvoiceSchema = z.object({
  admissionNo: z.string().min(3),
  title: z.string().min(3)
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

const upsertFeeAssignmentSchema = z.object({
  billingCycle: z.enum(['YEARLY', 'QUARTERLY', 'MONTHLY']),
  components: z
    .array(
      z.object({
        feeType: z.string().min(1),
        cadence: z.enum(['MONTHLY', 'YEARLY']),
        amount: z.number().min(0)
      })
    ),
  discount: z
    .object({
      type: z.enum(['FLAT', 'PERCENTAGE']),
      value: z.number().min(0),
      reason: z.string().optional()
    })
    .optional()
});

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
  components: Array<{ id: string; feeType: string; cadence: 'MONTHLY' | 'YEARLY'; amount: unknown }>;
  student?: AssignmentStudent;
  discount?: AssignmentDiscount;
}) {
  const yearlySubtotal = assignment.components
    .filter((component) => component.cadence === 'YEARLY')
    .reduce((sum, component) => sum + Number(component.amount), 0);
  const monthlySubtotal = assignment.components
    .filter((component) => component.cadence === 'MONTHLY')
    .reduce((sum, component) => sum + Number(component.amount), 0);
  const annualSubtotal = yearlySubtotal + monthlySubtotal * 12;
  const discountValue = assignment.discount ? Number(assignment.discount.value) : 0;
  const discountAmount = assignment.discount
    ? assignment.discount.type === 'PERCENTAGE'
      ? (annualSubtotal * discountValue) / 100
      : discountValue
    : 0;
  const finalTotal = Math.max(annualSubtotal - discountAmount, 0);
  const installmentCount = getInstallmentCount(assignment.billingCycle);

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
    discount: assignment.discount
      ? {
          id: assignment.discount.id,
          type: assignment.discount.type,
          value: discountValue,
          reason: assignment.discount.reason
        }
      : null,
    subtotal: annualSubtotal,
    yearlySubtotal,
    monthlySubtotal,
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

      if (payload.discount && payload.discount.value > 0) {
        await tx.discount.upsert({
          where: { studentId: req.params.studentId },
          update: {
            type: payload.discount.type,
            value: payload.discount.value,
            reason: payload.discount.reason || null
          },
          create: {
            studentId: req.params.studentId,
            type: payload.discount.type,
            value: payload.discount.value,
            reason: payload.discount.reason || null
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

feesRouter.post('/fees/invoices', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = createInvoiceSchema.parse(req.body);

    const student = await prisma.student.findFirst({
      where: {
        admissionNo: payload.admissionNo,
        schoolId
      }
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found for this admission number.' });
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      return res.status(400).json({ message: 'No school configuration found for this student.' });
    }

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

    const installmentAmount = Math.max(normalizedAssignment.installmentAmount, 0);
    if (installmentAmount <= 0) {
      return res.status(400).json({ message: 'Calculated installment amount must be greater than zero.' });
    }

    const dueDate = getNextDueDate(school.feeDueDayOfMonth);

    const existingInvoice = await prisma.feeInvoice.findFirst({
      where: {
        studentId: student.id,
        dueDate,
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

    const invoice = await prisma.feeInvoice.create({
      data: {
        studentId: student.id,
        title: payload.title,
        amount: installmentAmount,
        paidAmount: 0,
        dueDate,
        status: 'UNPAID'
      }
    });

    return res.status(201).json({
      message: 'Fee invoice sent successfully.',
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
          status: {
            in: ['UNPAID', 'PARTIAL']
          }
        }
      });

      if (existingInvoice) {
        skippedReasons.existingInvoiceForDueDate += 1;
        continue;
      }

      await prisma.feeInvoice.create({
        data: {
          studentId: assignment.studentId,
          title: `${assignment.billingCycle} Fee Invoice`,
          amount: installmentAmount,
          paidAmount: 0,
          dueDate,
          status: 'UNPAID'
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

    const payAmount = Math.min(payload.amount, due);
    if (payAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero.' });
    }

    const nextPaidAmount = alreadyPaid + payAmount;
    const nextDue = Math.max(amount - nextPaidAmount, 0);

    await prisma.feePayment.create({
      data: {
        invoiceId: invoice.id,
        amount: payAmount,
        paymentMethod: payload.paymentMethod,
        feeType: payload.feeType,
        dueAfterPayment: nextDue
      }
    });

    const updated = await prisma.feeInvoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount: nextPaidAmount,
        status: nextDue <= 0 ? 'PAID' : 'PARTIAL'
      }
    });

    return res.json({
      message: nextDue <= 0 ? 'Fee payment recorded and invoice closed.' : 'Partial fee payment recorded successfully.',
      invoice: {
        id: updated.id,
        title: updated.title,
        amount: Number(updated.amount),
        paidAmount: Number(updated.paidAmount),
        due: Math.max(Number(updated.amount) - Number(updated.paidAmount), 0),
        dueDate: updated.dueDate,
        status: updated.status,
        updatedAt: updated.updatedAt
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', issues: error.issues });
    }

    return res.status(400).json({ message: 'Unable to process fee payment.' });
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

    if (Number(invoice.paidAmount) > 0) {
      return res.status(400).json({ message: 'Cannot delete invoice after payments are recorded.' });
    }

    await prisma.feeInvoice.delete({ where: { id: invoice.id } });

    return res.json({ message: 'Fee due deleted successfully.' });
  } catch {
    return res.status(400).json({ message: 'Unable to delete fee due.' });
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
