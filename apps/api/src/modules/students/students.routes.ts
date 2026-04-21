import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

import { prisma } from '../../config/prisma.js';
import { AuthenticatedRequest, requireStaffAuth } from '../../middleware/auth.js';

const studentsRouter = Router();

const uploadDir = path.resolve(process.cwd(), 'apps/api/uploads/student-admissions');
mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${extension}`);
  }
});

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Invalid file type'));
    }

    return cb(null, true);
  }
});

function isClassOneOrAbove(className: string) {
  const parsed = Number.parseInt(String(className).match(/\d+/)?.[0] ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 1;
}

async function validateClassSection(schoolId: string, className: string, section: string) {
  const config = await prisma.schoolGradeConfig.findUnique({
    where: {
      schoolId_grade: {
        schoolId,
        grade: className
      }
    }
  });

  if (!config) {
    return { valid: false, message: `Class ${className} is not allowed. Update Settings first.` };
  }

  if (!config.sections.includes(section)) {
    return { valid: false, message: `Section ${section} is not allowed for Class ${className}.` };
  }

  return { valid: true };
}

const createStudentSchema = z.object({
  admissionNo: z.string().min(3),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  className: z.string().min(1),
  section: z.string().min(1),
  guardianPhone: z.string().min(10),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  parentPhone: z.string().optional(),
  fullAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pinCode: z.string().optional()
});

const updateStudentSchema = z.object({
  admissionNo: z.string().min(3),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  className: z.string().min(1),
  section: z.string().min(1),
  guardianPhone: z.string().min(10),
  isActive: z.boolean().optional()
});

const updateStudentProfileSchema = z.object({
  admissionNo: z.string().min(3),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  className: z.string().min(1),
  section: z.string().min(1),
  guardianPhone: z.string().min(10),
  dateOfBirth: z.string().min(8),
  gender: z.string().min(1),
  samagraId: z.string().min(1),
  aadhaarNumber: z.string().optional(),
  caste: z.string().optional(),
  religion: z.enum(['Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhism', 'Pasi', 'No Religion']).optional().or(z.literal('')),
  busRoute: z.string().optional(),
  fullAddress: z.string().min(5),
  city: z.string().min(2),
  state: z.string().min(2),
  pinCode: z.string().regex(/^\d{6}$/),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  parentPhone: z.string().min(10),
  parentEmail: z.string().email(),
  studentPhone: z.string().optional(),
  studentEmail: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional()
}).superRefine((value, ctx) => {
  const hasParentName = Boolean(value.fatherName?.trim() || value.motherName?.trim());
  if (!hasParentName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Parent's Name is required.",
      path: ['fatherName']
    });
  }
});

studentsRouter.use(requireStaffAuth);

studentsRouter.get('/students/:id/profile', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const student = await prisma.student.findFirst({
      where: {
        id: req.params.id,
        schoolId
      }
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const [assignment, discount, invoices, attendance] = await Promise.all([
      prisma.studentFeeAssignment.findUnique({
        where: { studentId: student.id },
        include: {
          components: { orderBy: { createdAt: 'asc' } }
        }
      }),
      prisma.discount.findUnique({ where: { studentId: student.id } }),
      prisma.feeInvoice.findMany({
        where: { studentId: student.id },
        orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 50
          }
        },
        take: 50
      }),
      prisma.attendance.findMany({
        where: { studentId: student.id },
        orderBy: { date: 'desc' },
        take: 60
      })
    ]);

    const invoiceRows = invoices.map((invoice: any) => {
      const amount = Number(invoice.amount);
      const paidAmount = Number(invoice.paidAmount);
      const due = Math.max(amount - paidAmount, 0);

      return {
        id: invoice.id,
        title: invoice.title,
        amount,
        paidAmount,
        due,
        dueDate: invoice.dueDate,
        status: invoice.status,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        payments: invoice.payments.map((payment: any) => ({
          id: payment.id,
          amount: Number(payment.amount),
          paymentMethod: payment.paymentMethod,
          feeType: payment.feeType,
          dueAfterPayment: payment.dueAfterPayment == null ? null : Number(payment.dueAfterPayment),
          createdAt: payment.createdAt
        }))
      };
    });

    const paymentRows = invoiceRows
      .flatMap((invoice: any) =>
        invoice.payments.map((payment: any) => ({
          ...payment,
          invoiceId: invoice.id,
          invoiceTitle: invoice.title
        }))
      )
      .sort((left: any, right: any) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 100);

    const attendanceSummary = attendance.reduce(
      (summary: { present: number; absent: number }, entry: any) => {
        if (entry.present) {
          summary.present += 1;
        } else {
          summary.absent += 1;
        }
        return summary;
      },
      { present: 0, absent: 0 }
    );

    const totals = invoiceRows.reduce(
      (acc: { billed: number; paid: number; due: number }, invoice: any) => ({
        billed: acc.billed + invoice.amount,
        paid: acc.paid + invoice.paidAmount,
        due: acc.due + invoice.due
      }),
      { billed: 0, paid: 0, due: 0 }
    );

    const yearlySubtotal = assignment
      ? assignment.components
          .filter((component: any) => component.cadence === 'YEARLY')
          .reduce((sum: number, component: any) => sum + Number(component.amount), 0)
      : 0;
    const monthlySubtotal = assignment
      ? assignment.components
          .filter((component: any) => component.cadence === 'MONTHLY')
          .reduce((sum: number, component: any) => sum + Number(component.amount), 0)
      : 0;
    const subtotal = yearlySubtotal + monthlySubtotal * 12;
    const discountValue = discount ? Number(discount.value) : 0;
    const discountAmount = discount ? (discount.type === 'PERCENTAGE' ? (subtotal * discountValue) / 100 : discountValue) : 0;
    const finalTotal = Math.max(subtotal - discountAmount, 0);

    return res.json({
      personal: student,
      fees: {
        assignment: assignment
          ? {
              id: assignment.id,
              billingCycle: assignment.billingCycle,
              components: assignment.components.map((component: any) => ({
                id: component.id,
                feeType: component.feeType,
                cadence: component.cadence,
                amount: Number(component.amount)
              })),
              discount: discount
                ? {
                    id: discount.id,
                    type: discount.type,
                    value: discountValue,
                    reason: discount.reason
                  }
                : null,
              subtotal,
              yearlySubtotal,
              monthlySubtotal,
              discountAmount,
              finalTotal
            }
          : null,
        invoices: invoiceRows,
        payments: paymentRows,
        totals
      },
      attendance: {
        summary: {
          total: attendance.length,
          present: attendanceSummary.present,
          absent: attendanceSummary.absent
        },
        records: attendance.map((entry: any) => ({
          id: entry.id,
          date: entry.date,
          present: entry.present,
          remark: entry.remark
        }))
      },
      grades: {
        available: false,
        items: []
      }
    });
  } catch {
    return res.status(400).json({ message: 'Unable to load student profile.' });
  }
});

studentsRouter.put(
  '/students/:id/profile',
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'birthCertificate', maxCount: 1 },
    { name: 'aadhaarCard', maxCount: 1 },
    { name: 'previousReportCard', maxCount: 1 },
    { name: 'transferCertificate', maxCount: 1 }
  ]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const schoolId = req.auth!.schoolId;
      const parsed = updateStudentProfileSchema.parse(req.body);

      const existing = await prisma.student.findFirst({
        where: {
          id: req.params.id,
          schoolId
        }
      });
      if (!existing) {
        return res.status(404).json({ message: 'Student not found.' });
      }

      const validation = await validateClassSection(schoolId, parsed.className, parsed.section);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }

      const files = req.files as Record<string, Express.Multer.File[] | undefined>;

      const photoFile = files.photo?.[0];
      const birthCertificateFile = files.birthCertificate?.[0];
      const aadhaarCardFile = files.aadhaarCard?.[0];
      const previousReportCardFile = files.previousReportCard?.[0];
      const transferCertificateFile = files.transferCertificate?.[0];

      const nextPhotoUrl = photoFile ? `/uploads/student-admissions/${photoFile.filename}` : existing.photoUrl;
      const nextBirthCertificateUrl = birthCertificateFile ? `/uploads/student-admissions/${birthCertificateFile.filename}` : existing.birthCertificateUrl;
      const nextPreviousReportCardUrl = previousReportCardFile ? `/uploads/student-admissions/${previousReportCardFile.filename}` : existing.previousReportCardUrl;
      const nextTransferCertificateUrl = transferCertificateFile ? `/uploads/student-admissions/${transferCertificateFile.filename}` : existing.transferCertificateUrl;

      if (!nextPhotoUrl) {
        return res.status(400).json({ message: 'Student photo upload is required.' });
      }

      if (!nextBirthCertificateUrl) {
        return res.status(400).json({ message: 'Birth Certificate upload is required.' });
      }

      if (isClassOneOrAbove(parsed.className) && !nextPreviousReportCardUrl) {
        return res.status(400).json({ message: 'Previous Report Card upload is required for Class 1 and above.' });
      }

      if (isClassOneOrAbove(parsed.className) && !nextTransferCertificateUrl) {
        return res.status(400).json({ message: 'Transfer Certificate upload is required for Class 1 and above.' });
      }

      const updated = await prisma.student.update({
        where: { id: existing.id },
        data: {
          admissionNo: parsed.admissionNo,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          className: parsed.className,
          section: parsed.section,
          guardianPhone: parsed.guardianPhone,
          dateOfBirth: new Date(parsed.dateOfBirth),
          gender: parsed.gender,
          samagraId: parsed.samagraId,
          aadhaarNumber: parsed.aadhaarNumber || null,
          caste: parsed.caste || null,
          religion: parsed.religion || null,
          busRoute: parsed.busRoute || null,
          fullAddress: parsed.fullAddress,
          city: parsed.city,
          state: parsed.state,
          pinCode: parsed.pinCode,
          fatherName: parsed.fatherName?.trim() || null,
          motherName: parsed.motherName?.trim() || null,
          parentPhone: parsed.parentPhone,
          parentEmail: parsed.parentEmail,
          studentPhone: parsed.studentPhone || null,
          studentEmail: parsed.studentEmail || null,
          photoUrl: nextPhotoUrl,
          birthCertificateUrl: nextBirthCertificateUrl,
          aadhaarCardUrl: aadhaarCardFile ? `/uploads/student-admissions/${aadhaarCardFile.filename}` : existing.aadhaarCardUrl,
          previousReportCardUrl: nextPreviousReportCardUrl,
          transferCertificateUrl: nextTransferCertificateUrl,
          isActive: parsed.isActive ? parsed.isActive === 'true' : existing.isActive
        }
      });

      return res.json({ message: 'Student profile updated successfully.', student: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation failed', issues: error.issues });
      }

      if (error instanceof multer.MulterError) {
        return res.status(400).json({ message: `Upload failed: ${error.message}` });
      }

      if (error instanceof Error && error.message === 'Invalid file type') {
        return res.status(400).json({ message: 'Only PDF, JPG, PNG, or WEBP files are allowed.' });
      }

      return res.status(400).json({ message: 'Unable to update student profile.' });
    }
  }
);

studentsRouter.get('/students', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const className = typeof req.query.className === 'string' ? req.query.className : undefined;
    const section = typeof req.query.section === 'string' ? req.query.section : undefined;
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'createdAt';

    const orderBy =
      sort === 'name'
        ? [{ firstName: 'asc' as const }, { lastName: 'asc' as const }]
        : sort === 'admissionNo'
          ? [{ admissionNo: 'asc' as const }]
          : [{ createdAt: 'desc' as const }];

    const students = await prisma.student.findMany({
      where: {
        schoolId,
        isActive: true,
        ...(className ? { className } : {}),
        ...(section ? { section } : {})
      },
      orderBy,
      take: 500
    });

    return res.json(students);
  } catch (error) {
    return res.status(503).json({
      message: 'Database is unavailable. Start PostgreSQL and run migrations.'
    });
  }
});

studentsRouter.post('/students', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = createStudentSchema.parse(req.body);

    const validation = await validateClassSection(schoolId, payload.className, payload.section);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const student = await prisma.student.create({
      data: {
        ...payload,
        fatherName: payload.fatherName?.trim() || null,
        motherName: payload.motherName?.trim() || null,
        parentPhone: payload.parentPhone?.trim() || payload.guardianPhone,
        fullAddress: payload.fullAddress?.trim() || null,
        city: payload.city?.trim() || null,
        state: payload.state?.trim() || null,
        pinCode: payload.pinCode?.trim() || null,
        schoolId
      }
    });

    return res.status(201).json(student);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', issues: error.issues });
    }

    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') {
        return res.status(409).json({ message: 'Admission number already exists.' });
      }
    }

    return res.status(503).json({
      message: 'Database is unavailable. Start PostgreSQL and run migrations.'
    });
  }
});

studentsRouter.patch('/students/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = updateStudentSchema.parse(req.body);

    const existing = await prisma.student.findFirst({
      where: {
        id: req.params.id,
        schoolId
      },
      select: { id: true }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const validation = await validateClassSection(schoolId, payload.className, payload.section);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const student = await prisma.student.update({
      where: { id: existing.id },
      data: payload
    });

    return res.json(student);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', issues: error.issues });
    }

    return res.status(400).json({ message: 'Unable to update student.' });
  }
});

studentsRouter.delete('/students/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;

    const existing = await prisma.student.findFirst({
      where: {
        id: req.params.id,
        schoolId
      },
      select: {
        id: true,
        isActive: true
      }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    if (!existing.isActive) {
      return res.json({ message: 'Student already deleted.' });
    }

    await prisma.student.update({
      where: { id: existing.id },
      data: {
        isActive: false
      }
    });

    return res.json({ message: 'Student deleted successfully.' });
  } catch {
    return res.status(400).json({ message: 'Unable to delete student.' });
  }
});

export { studentsRouter };
