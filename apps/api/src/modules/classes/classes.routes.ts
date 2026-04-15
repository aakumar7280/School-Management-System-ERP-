import { Router } from 'express';

import { prisma } from '../../config/prisma.js';
import { AuthenticatedRequest, requireStaffAuth } from '../../middleware/auth.js';

const classesRouter = Router();

classesRouter.use(requireStaffAuth);

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

export { classesRouter };
