import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import path from 'path';

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { prisma } from '../../config/prisma.js';
import { AuthenticatedRequest, requireStudentOrParent } from '../../middleware/auth.js';

const studentPortalRouter = Router();

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

const admissionSchema = z.object({
  fullName: z.string().min(2),
  dateOfBirth: z.string().min(8),
  gender: z.string().min(1),
  samagraId: z.string().min(1, 'Samagra ID is required.'),
  aadhaarNumber: z.string().optional(),
  caste: z.string().optional(),
  religion: z.enum(['Hindu', 'Muslim', 'Christian']).optional().or(z.literal('')),
  busRoute: z.string().optional(),
  fullAddress: z.string().min(5),
  city: z.string().min(2),
  state: z.string().min(2),
  pinCode: z.string().regex(/^\d{6}$/),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  phoneNumber: z.string().min(10),
  email: z.string().email(),
  studentPhoneNumber: z.string().optional(),
  studentEmail: z.string().email().optional().or(z.literal(''))
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

const payStudentInvoiceSchema = z.object({
  amount: z.number().positive().optional(),
  paymentMethod: z.enum(['UPI', 'CASH']).optional(),
  feeType: z.string().min(1).optional()
});

async function resolveMappedStudent(req: AuthenticatedRequest) {
  if (!req.auth?.userId) return null;

  return prisma.studentAccess.findFirst({
    where: { userId: req.auth.userId },
    orderBy: { createdAt: 'asc' },
    include: {
      student: true
    }
  });
}

studentPortalRouter.get('/student-portal/admission-form', requireStudentOrParent, async (req: AuthenticatedRequest, res) => {
  try {
    const access = await resolveMappedStudent(req);

    if (!access) {
      return res.status(404).json({ message: 'No student profile mapped to this account.' });
    }

    const student = access.student;

    return res.json({
      id: student.id,
      fullName: `${student.firstName} ${student.lastName}`.trim(),
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.toISOString().slice(0, 10) : '',
      gender: student.gender ?? '',
      samagraId: student.samagraId ?? '',
      className: student.className,
      section: student.section,
      aadhaarNumber: student.aadhaarNumber ?? '',
      caste: student.caste ?? '',
      religion: student.religion ?? '',
      busRoute: student.busRoute ?? '',
      fullAddress: student.fullAddress ?? '',
      city: student.city ?? '',
      state: student.state ?? '',
      pinCode: student.pinCode ?? '',
      fatherName: student.fatherName ?? '',
      motherName: student.motherName ?? '',
      phoneNumber: student.parentPhone ?? student.guardianPhone ?? '',
      email: student.parentEmail ?? '',
      studentPhoneNumber: student.studentPhone ?? '',
      studentEmail: student.studentEmail ?? '',
      profileSubmittedAt: student.profileSubmittedAt ? student.profileSubmittedAt.toISOString() : null,
      photoUrl: student.photoUrl ?? '',
      birthCertificateUrl: student.birthCertificateUrl ?? '',
      aadhaarCardUrl: student.aadhaarCardUrl ?? '',
      previousReportCardUrl: student.previousReportCardUrl ?? '',
      transferCertificateUrl: student.transferCertificateUrl ?? ''
    });
  } catch {
    return res.status(503).json({ message: 'Unable to load student admission profile.' });
  }
});

studentPortalRouter.put(
  '/student-portal/admission-form',
  requireStudentOrParent,
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'birthCertificate', maxCount: 1 },
    { name: 'aadhaarCard', maxCount: 1 },
    { name: 'previousReportCard', maxCount: 1 },
    { name: 'transferCertificate', maxCount: 1 }
  ]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const access = await resolveMappedStudent(req);

      if (!access) {
        return res.status(404).json({ message: 'No student profile mapped to this account.' });
      }

      const parsed = admissionSchema.parse(req.body);
      const files = req.files as Record<string, Express.Multer.File[] | undefined>;

      const photoFile = files.photo?.[0];
      const birthCertificateFile = files.birthCertificate?.[0];
      const aadhaarCardFile = files.aadhaarCard?.[0];
      const previousReportCardFile = files.previousReportCard?.[0];
      const transferCertificateFile = files.transferCertificate?.[0];

      if (photoFile && !photoFile.mimetype.startsWith('image/')) {
        return res.status(400).json({ message: 'Photo must be an image file.' });
      }

      const [firstNameRaw, ...lastNameParts] = parsed.fullName.trim().split(/\s+/);
      const firstName = firstNameRaw || access.student.firstName;
      const lastName = lastNameParts.join(' ') || access.student.lastName || '-';

      const updated = await prisma.student.update({
        where: { id: access.studentId },
        data: {
          firstName,
          lastName,
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
          guardianPhone: parsed.phoneNumber,
          parentPhone: parsed.phoneNumber,
          parentEmail: parsed.email,
          studentPhone: parsed.studentPhoneNumber || null,
          studentEmail: parsed.studentEmail || null,
          photoUrl: photoFile ? `/uploads/student-admissions/${photoFile.filename}` : access.student.photoUrl,
          birthCertificateUrl: birthCertificateFile ? `/uploads/student-admissions/${birthCertificateFile.filename}` : access.student.birthCertificateUrl,
          aadhaarCardUrl: aadhaarCardFile ? `/uploads/student-admissions/${aadhaarCardFile.filename}` : access.student.aadhaarCardUrl,
          previousReportCardUrl: previousReportCardFile ? `/uploads/student-admissions/${previousReportCardFile.filename}` : access.student.previousReportCardUrl,
          transferCertificateUrl: transferCertificateFile ? `/uploads/student-admissions/${transferCertificateFile.filename}` : access.student.transferCertificateUrl,
          profileSubmittedAt: new Date()
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          birthCertificateUrl: true,
          aadhaarCardUrl: true,
          previousReportCardUrl: true,
          transferCertificateUrl: true,
          updatedAt: true
        }
      });

      if (!updated.birthCertificateUrl) {
        return res.status(400).json({ message: 'Birth Certificate upload is required.' });
      }

      if (!updated.photoUrl) {
        return res.status(400).json({ message: 'Student photo upload is required.' });
      }

      if (isClassOneOrAbove(access.student.className) && !updated.previousReportCardUrl) {
        return res.status(400).json({ message: 'Previous Report Card upload is required for Class 1 and above.' });
      }

      if (isClassOneOrAbove(access.student.className) && !updated.transferCertificateUrl) {
        return res.status(400).json({ message: 'Transfer Certificate upload is required for Class 1 and above.' });
      }

      return res.json({
        message: 'Admission form submitted successfully.',
        student: updated
      });
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

      return res.status(400).json({ message: 'Unable to submit admission form.' });
    }
  }
);

studentPortalRouter.get('/student-portal/fees', requireStudentOrParent, async (req: AuthenticatedRequest, res) => {
  try {
    const access = await resolveMappedStudent(req);

    if (!access) {
      return res.status(404).json({ message: 'No student profile mapped to this account.' });
    }

    const assignment = await prisma.studentFeeAssignment.findUnique({
      where: { studentId: access.studentId },
      include: {
        components: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    const discount = await prisma.discount.findUnique({
      where: { studentId: access.studentId }
    });

    const school = await prisma.school.findUnique({
      where: { id: access.student.schoolId },
      select: { feeDueDayOfMonth: true }
    });

    const invoices = await prisma.feeInvoice.findMany({
      where: { studentId: access.studentId },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 24
    });

    const assignmentData = assignment
      ? (() => {
          const yearlySubtotal = assignment.components
            .filter((component: (typeof assignment.components)[number]) => component.cadence === 'YEARLY')
            .reduce((sum: number, component: (typeof assignment.components)[number]) => sum + Number(component.amount), 0);
          const monthlySubtotal = assignment.components
            .filter((component: (typeof assignment.components)[number]) => component.cadence === 'MONTHLY')
            .reduce((sum: number, component: (typeof assignment.components)[number]) => sum + Number(component.amount), 0);
          const subtotal = yearlySubtotal + monthlySubtotal * 12;
          const discountValue = discount ? Number(discount.value) : 0;
          const discountAmount = discount ? (discount.type === 'PERCENTAGE' ? (subtotal * discountValue) / 100 : discountValue) : 0;
          const finalTotal = Math.max(subtotal - discountAmount, 0);

          return {
            id: assignment.id,
            billingCycle: assignment.billingCycle,
            components: assignment.components.map((component: (typeof assignment.components)[number]) => ({
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
            finalTotal,
            annualTotal: finalTotal,
            monthlyInstallment: finalTotal / 12,
            quarterlyInstallment: finalTotal / 4,
            updatedAt: assignment.updatedAt
          };
        })()
      : null;

    const invoiceData = invoices.map((invoice: (typeof invoices)[number]) => {
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
        updatedAt: invoice.updatedAt
      };
    });

    const totals = invoiceData.reduce(
      (accumulator: { totalBilled: number; totalPaid: number; totalDue: number }, invoice: (typeof invoiceData)[number]) => {
        return {
          totalBilled: accumulator.totalBilled + invoice.amount,
          totalPaid: accumulator.totalPaid + invoice.paidAmount,
          totalDue: accumulator.totalDue + invoice.due
        };
      },
      { totalBilled: 0, totalPaid: 0, totalDue: 0 }
    );

    return res.json({
      student: {
        id: access.student.id,
        admissionNo: access.student.admissionNo,
        name: `${access.student.firstName} ${access.student.lastName}`.trim(),
        className: access.student.className,
        section: access.student.section
      },
      assignedFee: assignmentData,
      feePolicy: {
        feeDueDayOfMonth: school?.feeDueDayOfMonth ?? 1
      },
      invoices: invoiceData,
      totals
    });
  } catch {
    return res.status(503).json({ message: 'Unable to load student fees.' });
  }
});

studentPortalRouter.post('/student-portal/fees/:invoiceId/pay', requireStudentOrParent, async (req: AuthenticatedRequest, res) => {
  try {
    const access = await resolveMappedStudent(req);

    if (!access) {
      return res.status(404).json({ message: 'No student profile mapped to this account.' });
    }

    const payload = payStudentInvoiceSchema.parse(req.body ?? {});

    const invoice = await prisma.feeInvoice.findFirst({
      where: {
        id: req.params.invoiceId,
        studentId: access.studentId
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

    const payAmount = payload.amount ? Math.min(payload.amount, due) : due;

    if (payAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero.' });
    }

    const nextPaidAmount = alreadyPaid + payAmount;
    const nextDue = Math.max(amount - nextPaidAmount, 0);

    await prisma.feePayment.create({
      data: {
        invoiceId: invoice.id,
        amount: payAmount,
        paymentMethod: payload.paymentMethod ?? 'UPI',
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
      message: nextDue <= 0 ? 'Fee paid successfully.' : 'Partial fee payment recorded successfully.',
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

export { studentPortalRouter };
