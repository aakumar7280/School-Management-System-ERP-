import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../config/prisma.js';
import { AuthenticatedRequest, requireStaffAuth } from '../../middleware/auth.js';

const teachersRouter = Router();

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

const createTeacherSchema = z.object({
  loginId: z.string().min(3),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  assignedClass: z.string().min(1),
  assignedSection: z.string().min(1),
  subjects: z.array(z.string().min(1)).min(1)
});

const assignTeacherSchema = z.object({
  assignedClass: z.string().min(1),
  assignedSection: z.string().min(1)
});

const updateTeacherSchema = z.object({
  loginId: z.string().min(3),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  assignedClass: z.string().min(1),
  assignedSection: z.string().min(1),
  subjects: z.array(z.string().min(1)).min(1),
  isActive: z.boolean().optional()
});

const payStubSchema = z.object({
  month: z.string().min(7),
  amount: z.number().positive(),
  note: z.string().optional()
});

teachersRouter.use(requireStaffAuth);

teachersRouter.get('/teachers', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const className = typeof req.query.className === 'string' ? req.query.className : undefined;
    const section = typeof req.query.section === 'string' ? req.query.section : undefined;
    const subject = typeof req.query.subject === 'string' ? req.query.subject : undefined;

    const teachers = await prisma.user.findMany({
      where: {
        schoolId,
        role: 'TEACHER',
        isActive: true,
        ...(className ? { assignedClass: className } : {}),
        ...(section ? { assignedSection: section } : {}),
        ...(subject ? { subjects: { has: subject } } : {})
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        loginId: true,
        firstName: true,
        lastName: true,
        email: true,
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

teachersRouter.post('/teachers', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = createTeacherSchema.parse(req.body);

    const validation = await validateClassSection(schoolId, payload.assignedClass, payload.assignedSection);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    const teacher = await prisma.user.create({
      data: {
        schoolId,
        loginId: payload.loginId,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        passwordHash,
        role: 'TEACHER',
        assignedClass: payload.assignedClass,
        assignedSection: payload.assignedSection,
        subjects: payload.subjects
      },
      select: {
        id: true,
        loginId: true,
        firstName: true,
        lastName: true,
        email: true,
        assignedClass: true,
        assignedSection: true,
        subjects: true
      }
    });

    return res.status(201).json(teacher);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', issues: error.issues });
    }

    return res.status(400).json({ message: 'Unable to create teacher. Check if login ID/email already exists.' });
  }
});

teachersRouter.patch('/teachers/:id/assignment', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = assignTeacherSchema.parse(req.body);

    const teacher = await prisma.user.findFirst({
      where: {
        id: req.params.id,
        schoolId,
        role: 'TEACHER'
      }
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found.' });
    }

    const validation = await validateClassSection(schoolId, payload.assignedClass, payload.assignedSection);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        assignedClass: payload.assignedClass,
        assignedSection: payload.assignedSection
      },
      select: {
        id: true,
        loginId: true,
        firstName: true,
        lastName: true,
        assignedClass: true,
        assignedSection: true,
        subjects: true
      }
    });

    return res.json(updated);
  } catch {
    return res.status(400).json({ message: 'Unable to assign class to teacher.' });
  }
});

teachersRouter.patch('/teachers/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = updateTeacherSchema.parse(req.body);

    const teacher = await prisma.user.findFirst({
      where: {
        id: req.params.id,
        schoolId,
        role: 'TEACHER'
      }
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found.' });
    }

    const validation = await validateClassSection(schoolId, payload.assignedClass, payload.assignedSection);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const normalizedPassword = payload.password?.trim();
    const passwordHash = normalizedPassword ? await bcrypt.hash(normalizedPassword, 10) : undefined;

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        loginId: payload.loginId,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        ...(passwordHash ? { passwordHash } : {}),
        assignedClass: payload.assignedClass,
        assignedSection: payload.assignedSection,
        subjects: payload.subjects,
        isActive: payload.isActive
      },
      select: {
        id: true,
        loginId: true,
        firstName: true,
        lastName: true,
        email: true,
        assignedClass: true,
        assignedSection: true,
        subjects: true
      }
    });

    return res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', issues: error.issues });
    }

    return res.status(400).json({ message: 'Unable to update teacher. Check login ID/email uniqueness.' });
  }
});

teachersRouter.post('/teachers/:id/pay-stubs', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = payStubSchema.parse(req.body);

    const teacher = await prisma.user.findFirst({
      where: {
        id: req.params.id,
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
  } catch {
    return res.status(400).json({ message: 'Unable to issue pay stub.' });
  }
});

export { teachersRouter };
