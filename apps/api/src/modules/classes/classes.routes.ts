import { Router } from 'express';
import ExcelJS from 'exceljs';

import { prisma } from '../../config/prisma.js';
import { AuthenticatedRequest, requireStaffAuth } from '../../middleware/auth.js';

const classesRouter = Router();

classesRouter.use(requireStaffAuth);

function sanitizeFileSegment(value: string) {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .toLowerCase();
}

function computeAssignmentSummaryTotal(
  assignment:
    | {
        components: Array<{ amount: unknown; cadence: 'MONTHLY' | 'YEARLY' | 'ONCE' }>;
        billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
      }
    | null
    | undefined,
  discount: { type: 'FLAT' | 'PERCENTAGE'; value: unknown; reason: string | null } | null | undefined
) {
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

classesRouter.get('/classes/overview', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const [students, teachers] = await Promise.all([
      prisma.student.findMany({
        where: { schoolId, isActive: true },
        select: { className: true, section: true }
      }),
      prisma.user.findMany({
        where: { schoolId, role: 'TEACHER', isActive: true },
        select: { firstName: true, lastName: true, assignedClass: true, assignedSection: true, subjects: true }
      })
    ]);

    const byClassSection = new Map<string, {
      className: string;
      section: string;
      studentCount: number;
      teachers: { name: string; subjects: string[] }[];
    }>();

    for (const student of students) {
      const key = `${student.className}-${student.section}`;
      const existing = byClassSection.get(key);

      if (existing) {
        existing.studentCount += 1;
      } else {
        byClassSection.set(key, {
          className: student.className,
          section: student.section,
          studentCount: 1,
          teachers: []
        });
      }
    }

    for (const teacher of teachers) {
      if (!teacher.assignedClass || !teacher.assignedSection) continue;

      const key = `${teacher.assignedClass}-${teacher.assignedSection}`;
      const existing = byClassSection.get(key);
      const teacherData = {
        name: `${teacher.firstName} ${teacher.lastName}`,
        subjects: teacher.subjects
      };

      if (existing) {
        existing.teachers.push(teacherData);
      } else {
        byClassSection.set(key, {
          className: teacher.assignedClass,
          section: teacher.assignedSection,
          studentCount: 0,
          teachers: [teacherData]
        });
      }
    }

    const classes = Array.from(byClassSection.values()).sort((a, b) => {
      if (a.className === b.className) return a.section.localeCompare(b.section);
      return a.className.localeCompare(b.className, undefined, { numeric: true });
    });

    return res.json(classes);
  } catch {
    return res.status(503).json({ message: 'Database is unavailable.' });
  }
});

classesRouter.get('/classes/export', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const className = typeof req.query.className === 'string' ? req.query.className.trim() : '';
    const section = typeof req.query.section === 'string' ? req.query.section.trim() : '';

    if (!className || !section) {
      return res.status(400).json({ message: 'className and section are required.' });
    }

    const students = await prisma.student.findMany({
      where: {
        schoolId,
        className,
        section
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { admissionNo: 'asc' }],
      select: {
        admissionNo: true,
        firstName: true,
        lastName: true,
        className: true,
        section: true,
        guardianPhone: true,
        samagraId: true,
        dateOfBirth: true,
        gender: true,
        caste: true,
        religion: true,
        busRoute: true,
        aadhaarNumber: true,
        fullAddress: true,
        city: true,
        state: true,
        pinCode: true,
        fatherName: true,
        motherName: true,
        parentPhone: true,
        parentEmail: true,
        studentPhone: true,
        studentEmail: true,
        photoUrl: true,
        birthCertificateUrl: true,
        aadhaarCardUrl: true,
        previousReportCardUrl: true,
        transferCertificateUrl: true,
        profileSubmittedAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        feeAssignment: {
          select: {
            billingCycle: true,
            components: {
              orderBy: { createdAt: 'asc' },
              select: {
                feeType: true,
                cadence: true,
                amount: true
              }
            }
          }
        },
        discount: {
          select: {
            type: true,
            value: true,
            reason: true
          }
        },
        feeCredit: {
          select: {
            balance: true
          }
        },
        feeInvoices: {
          orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
          select: {
            invoiceNumber: true,
            title: true,
            amount: true,
            paidAmount: true,
            dueDate: true,
            status: true,
            paymentStatus: true,
            payments: {
              select: {
                amount: true
              }
            }
          }
        }
      }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'School ERP';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet(`${className}-${section}`);

    worksheet.columns = [
      { header: 'Admission No', key: 'admissionNo', width: 18 },
      { header: 'First Name', key: 'firstName', width: 18 },
      { header: 'Last Name', key: 'lastName', width: 18 },
      { header: 'Class', key: 'className', width: 12 },
      { header: 'Section', key: 'section', width: 12 },
      { header: 'Guardian Phone', key: 'guardianPhone', width: 18 },
      { header: 'Samagra ID', key: 'samagraId', width: 18 },
      { header: 'Date Of Birth', key: 'dateOfBirth', width: 16 },
      { header: 'Gender', key: 'gender', width: 12 },
      { header: 'Caste', key: 'caste', width: 14 },
      { header: 'Religion', key: 'religion', width: 14 },
      { header: 'Bus Route', key: 'busRoute', width: 18 },
      { header: 'Aadhaar Number', key: 'aadhaarNumber', width: 20 },
      { header: 'Full Address', key: 'fullAddress', width: 28 },
      { header: 'City', key: 'city', width: 16 },
      { header: 'State', key: 'state', width: 16 },
      { header: 'Pin Code', key: 'pinCode', width: 12 },
      { header: 'Father Name', key: 'fatherName', width: 18 },
      { header: 'Mother Name', key: 'motherName', width: 18 },
      { header: 'Parent Phone', key: 'parentPhone', width: 18 },
      { header: 'Parent Email', key: 'parentEmail', width: 24 },
      { header: 'Student Phone', key: 'studentPhone', width: 18 },
      { header: 'Student Email', key: 'studentEmail', width: 24 },
      { header: 'Profile Submitted At', key: 'profileSubmittedAt', width: 22 },
      { header: 'Active', key: 'isActive', width: 10 },
      { header: 'Fee Billing Cycle', key: 'billingCycle', width: 16 },
      { header: 'Fee Components', key: 'feeComponents', width: 42 },
      { header: 'Discount', key: 'discount', width: 24 },
      { header: 'Total Fees Summary', key: 'totalFeesSummary', width: 18 },
      { header: 'Invoice Generated Amount', key: 'invoiceGeneratedAmount', width: 22 },
      { header: 'Invoice Paid Amount', key: 'invoicePaidAmount', width: 18 },
      { header: 'Total Pending', key: 'totalPending', width: 16 },
      { header: 'Advance Balance', key: 'advanceBalance', width: 16 },
      { header: 'Invoice Count', key: 'invoiceCount', width: 12 },
      { header: 'Latest Invoice No', key: 'latestInvoiceNumber', width: 20 },
      { header: 'All Invoice Numbers', key: 'allInvoiceNumbers', width: 34 },
      { header: 'Invoice Titles', key: 'invoiceTitles', width: 40 },
      { header: 'Invoice Statuses', key: 'invoiceStatuses', width: 24 },
      { header: 'Payment Records Count', key: 'paymentRecordsCount', width: 20 },
      { header: 'Photo URL', key: 'photoUrl', width: 28 },
      { header: 'Birth Certificate URL', key: 'birthCertificateUrl', width: 28 },
      { header: 'Aadhaar Card URL', key: 'aadhaarCardUrl', width: 28 },
      { header: 'Previous Report Card URL', key: 'previousReportCardUrl', width: 30 },
      { header: 'Transfer Certificate URL', key: 'transferCertificateUrl', width: 30 },
      { header: 'Created At', key: 'createdAt', width: 22 },
      { header: 'Updated At', key: 'updatedAt', width: 22 }
    ];

    students.forEach((student: any) => {
      const totalFeesSummary = computeAssignmentSummaryTotal(student.feeAssignment, student.discount);
      const invoiceGeneratedAmount = student.feeInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.amount), 0);
      const invoicePaidAmount = student.feeInvoices.reduce((sum: number, invoice: any) => sum + Number(invoice.paidAmount), 0);
      const totalPending = Math.max(invoiceGeneratedAmount - invoicePaidAmount, 0);
      const feeComponents = (student.feeAssignment?.components ?? [])
        .map((component: any) => `${component.feeType} (${component.cadence}) - ${Number(component.amount)}`)
        .join('; ');
      const discount = student.discount
        ? `${student.discount.type} ${Number(student.discount.value)}${student.discount.reason ? ` - ${student.discount.reason}` : ''}`
        : '';
      const invoiceNumbers = student.feeInvoices.map((invoice: any) => invoice.invoiceNumber).filter(Boolean) as string[];
      const paymentRecordsCount = student.feeInvoices.reduce((sum: number, invoice: any) => sum + invoice.payments.length, 0);

      worksheet.addRow({
        admissionNo: student.admissionNo,
        firstName: student.firstName,
        lastName: student.lastName,
        className: student.className,
        section: student.section,
        guardianPhone: student.guardianPhone,
        samagraId: student.samagraId ?? '',
        dateOfBirth: student.dateOfBirth ? student.dateOfBirth.toISOString().slice(0, 10) : '',
        gender: student.gender ?? '',
        caste: student.caste ?? '',
        religion: student.religion ?? '',
        busRoute: student.busRoute ?? '',
        aadhaarNumber: student.aadhaarNumber ?? '',
        fullAddress: student.fullAddress ?? '',
        city: student.city ?? '',
        state: student.state ?? '',
        pinCode: student.pinCode ?? '',
        fatherName: student.fatherName ?? '',
        motherName: student.motherName ?? '',
        parentPhone: student.parentPhone ?? '',
        parentEmail: student.parentEmail ?? '',
        studentPhone: student.studentPhone ?? '',
        studentEmail: student.studentEmail ?? '',
        profileSubmittedAt: student.profileSubmittedAt ? student.profileSubmittedAt.toISOString() : '',
        isActive: student.isActive ? 'Yes' : 'No',
        billingCycle: student.feeAssignment?.billingCycle ?? '',
        feeComponents,
        discount,
        totalFeesSummary: Number(totalFeesSummary.toFixed(2)),
        invoiceGeneratedAmount: Number(invoiceGeneratedAmount.toFixed(2)),
        invoicePaidAmount: Number(invoicePaidAmount.toFixed(2)),
        totalPending: Number(totalPending.toFixed(2)),
        advanceBalance: Number((Number(student.feeCredit?.balance ?? 0)).toFixed(2)),
        invoiceCount: student.feeInvoices.length,
        latestInvoiceNumber: invoiceNumbers[0] ?? '',
        allInvoiceNumbers: invoiceNumbers.join(', '),
        invoiceTitles: student.feeInvoices.map((invoice: any) => invoice.title).join('; '),
        invoiceStatuses: student.feeInvoices.map((invoice: any) => `${invoice.invoiceNumber ?? invoice.title}: ${invoice.status}/${invoice.paymentStatus}`).join('; '),
        paymentRecordsCount,
        photoUrl: student.photoUrl ?? '',
        birthCertificateUrl: student.birthCertificateUrl ?? '',
        aadhaarCardUrl: student.aadhaarCardUrl ?? '',
        previousReportCardUrl: student.previousReportCardUrl ?? '',
        transferCertificateUrl: student.transferCertificateUrl ?? '',
        createdAt: student.createdAt.toISOString(),
        updatedAt: student.updatedAt.toISOString()
      });
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const fileName = `class-${sanitizeFileSegment(className)}-${sanitizeFileSegment(section)}-students.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error('Unable to export class student list', error);
    return res.status(400).json({ message: 'Unable to export class student list.' });
  }
});

export { classesRouter };
