import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../config/prisma.js';
import { AuthenticatedRequest, requireStaffAuth } from '../../middleware/auth.js';

const settingsRouter = Router();

const gradeConfigSchema = z.object({
  grade: z.string().min(1),
  sections: z.array(z.string().min(1)).min(1)
});

const updateStructureSchema = z.object({
  grades: z.array(gradeConfigSchema).min(1),
  feeDueDayOfMonth: z.number().int().min(1).max(31)
});

settingsRouter.use(requireStaffAuth);

settingsRouter.get('/settings/academic-structure', async (req: AuthenticatedRequest, res) => {
  try {
    const school = await prisma.school.findUnique({ where: { id: req.auth!.schoolId } });

    if (!school) {
      return res.status(400).json({ message: 'No school found.' });
    }

    const configs = await prisma.schoolGradeConfig.findMany({
      where: { schoolId: school.id },
      orderBy: { grade: 'asc' }
    });

    return res.json({
      feeDueDayOfMonth: school.feeDueDayOfMonth,
      grades: configs.map((config: { grade: string; sections: string[] }) => ({
        grade: config.grade,
        sections: config.sections
      }))
    });
  } catch {
    return res.status(503).json({ message: 'Unable to load academic structure settings.' });
  }
});

settingsRouter.put('/settings/academic-structure', async (req: AuthenticatedRequest, res) => {
  try {
    const payload = updateStructureSchema.parse(req.body);

    const school = await prisma.school.findUnique({ where: { id: req.auth!.schoolId } });
    if (!school) {
      return res.status(400).json({ message: 'No school found.' });
    }

    const sanitizedGrades = payload.grades
      .map((entry) => ({
        grade: entry.grade.trim(),
        sections: Array.from(new Set(entry.sections.map((section) => section.trim()).filter(Boolean)))
      }))
      .filter((entry) => entry.grade.length > 0 && entry.sections.length > 0);

    if (sanitizedGrades.length === 0) {
      return res.status(400).json({ message: 'At least one grade with one section is required.' });
    }

    const duplicateGrade = sanitizedGrades.find((entry, index) => sanitizedGrades.findIndex((candidate) => candidate.grade === entry.grade) !== index);
    if (duplicateGrade) {
      return res.status(400).json({ message: `Duplicate grade found: ${duplicateGrade.grade}` });
    }

    await prisma.$transaction(async (transaction: typeof prisma) => {
      await transaction.school.update({
        where: { id: school.id },
        data: { feeDueDayOfMonth: payload.feeDueDayOfMonth }
      });

      await transaction.schoolGradeConfig.deleteMany({ where: { schoolId: school.id } });
      await transaction.schoolGradeConfig.createMany({
        data: sanitizedGrades.map((entry) => ({
          schoolId: school.id,
          grade: entry.grade,
          sections: entry.sections
        }))
      });
    });

    return res.json({ message: 'Academic structure settings updated successfully.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', issues: error.issues });
    }

    return res.status(400).json({ message: 'Unable to update academic structure settings.' });
  }
});

export { settingsRouter };
