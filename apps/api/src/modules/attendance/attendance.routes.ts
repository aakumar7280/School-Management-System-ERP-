import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../config/prisma.js';
import { AuthenticatedRequest, requireStaffAuth } from '../../middleware/auth.js';

const attendanceRouter = Router();

type ClassScope = {
  className: string;
  section: string;
};

const submitAttendanceSchema = z.object({
  className: z.string().min(1),
  section: z.string().min(1),
  date: z.string().min(8),
  records: z.array(
    z.object({
      studentId: z.string().min(1),
      present: z.boolean(),
      remark: z.string().optional()
    })
  )
});

function scopeToken(className: string, section: string) {
  return `${className.trim().toLowerCase()}::${section.trim().toLowerCase()}`;
}

function parseSubjectClassAssignments(subjects: string[] = []): ClassScope[] {
  const assignments: ClassScope[] = [];

  subjects.forEach((item) => {
    const trimmed = item.trim();
    const match = trimmed.match(/^(.+?)\s*@\s*([^/\-\s]+)\s*[\/\-]\s*([^/\-\s]+)$/i);
    if (!match) {
      return;
    }

    assignments.push({
      className: match[2].trim(),
      section: match[3].trim()
    });
  });

  return assignments;
}

async function getTeacherClassAccess(req: AuthenticatedRequest): Promise<{ classTeacher: ClassScope | null; teaching: ClassScope[] } | null> {
  if (!req.auth || req.auth.role !== 'TEACHER') {
    return null;
  }

  const teacher = await prisma.user.findFirst({
    where: {
      id: req.auth.userId,
      schoolId: req.auth.schoolId,
      role: 'TEACHER',
      isActive: true
    },
    select: {
      assignedClass: true,
      assignedSection: true,
      subjects: true
    }
  });

  if (!teacher) {
    return { classTeacher: null, teaching: [] };
  }

  const teachingByScope = new Map<string, ClassScope>();
  let classTeacher: ClassScope | null = null;

  if (teacher.assignedClass && teacher.assignedSection) {
    classTeacher = {
      className: teacher.assignedClass,
      section: teacher.assignedSection
    };
    teachingByScope.set(scopeToken(classTeacher.className, classTeacher.section), classTeacher);
  }

  parseSubjectClassAssignments(teacher.subjects ?? []).forEach((scope) => {
    teachingByScope.set(scopeToken(scope.className, scope.section), scope);
  });

  return {
    classTeacher,
    teaching: Array.from(teachingByScope.values())
  };
}

attendanceRouter.use(requireStaffAuth);

attendanceRouter.get('/attendance/class', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    let className = typeof req.query.className === 'string' ? req.query.className : '';
    let section = typeof req.query.section === 'string' ? req.query.section : '';
    const date = typeof req.query.date === 'string' ? req.query.date : '';

    if (!date) {
      return res.status(400).json({ message: 'date is required.' });
    }

    const teacherAccess = await getTeacherClassAccess(req);

    if (teacherAccess) {
      if (!teacherAccess.classTeacher) {
        return res.status(403).json({ message: 'Class teacher assignment is required to access attendance.' });
      }

      if (!className || !section) {
        className = teacherAccess.classTeacher.className;
        section = teacherAccess.classTeacher.section;
      }

      const requestScopeToken = scopeToken(className, section);
      const hasAccess = teacherAccess.teaching.some(
        (scope) => scopeToken(scope.className, scope.section) === requestScopeToken
      );

      if (!hasAccess) {
        return res.status(403).json({ message: 'Teachers can only view attendance for classes they teach.' });
      }
    } else if (!className || !section) {
      return res.status(400).json({ message: 'className and section are required.' });
    }

    const targetDate = new Date(date);

    if (Number.isNaN(targetDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date.' });
    }

    const students = await prisma.student.findMany({
      where: { schoolId, className, section, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true
      }
    });

    const attendances = await prisma.attendance.findMany({
      where: {
        date: targetDate,
        student: { schoolId, className, section }
      },
      select: {
        studentId: true,
        present: true,
        remark: true
      }
    });

    const attendanceByStudent = new Map<string, { present: boolean; remark: string | null }>(
      attendances.map((row: { studentId: string; present: boolean; remark: string | null }) => [row.studentId, row])
    );

    const records = students.map((student: { id: string; admissionNo: string; firstName: string; lastName: string }) => {
      const attendance = attendanceByStudent.get(student.id);
      return {
        studentId: student.id,
        admissionNo: student.admissionNo,
        name: `${student.firstName} ${student.lastName}`,
        present: attendance?.present ?? false,
        remark: attendance?.remark ?? ''
      };
    });

    return res.json(records);
  } catch {
    return res.status(503).json({ message: 'Database is unavailable.' });
  }
});

attendanceRouter.get('/attendance/class/history', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    let className = typeof req.query.className === 'string' ? req.query.className : '';
    let section = typeof req.query.section === 'string' ? req.query.section : '';

    const teacherAccess = await getTeacherClassAccess(req);

    if (teacherAccess) {
      if (!teacherAccess.classTeacher) {
        return res.status(403).json({ message: 'Class teacher assignment is required to access attendance history.' });
      }

      if (!className || !section) {
        className = teacherAccess.classTeacher.className;
        section = teacherAccess.classTeacher.section;
      }

      const requestScopeToken = scopeToken(className, section);
      const classTeacherScopeToken = scopeToken(teacherAccess.classTeacher.className, teacherAccess.classTeacher.section);
      if (requestScopeToken !== classTeacherScopeToken) {
        return res.status(403).json({ message: 'Teachers can only view attendance history for their class-teacher class.' });
      }
    } else if (!className || !section) {
      return res.status(400).json({ message: 'className and section are required.' });
    }

    const totalStudents = await prisma.student.count({
      where: {
        schoolId,
        className,
        section,
        isActive: true
      }
    });

    const attendanceRows = await prisma.attendance.findMany({
      where: {
        student: {
          schoolId,
          className,
          section
        }
      },
      select: {
        date: true,
        present: true
      },
      orderBy: {
        date: 'desc'
      }
    });

    const summaryByDate = new Map<string, { presentCount: number; absentCount: number }>();

    attendanceRows.forEach((row: { date: Date; present: boolean }) => {
      const dateKey = row.date.toISOString().slice(0, 10);
      const existing = summaryByDate.get(dateKey) ?? { presentCount: 0, absentCount: 0 };
      if (row.present) {
        existing.presentCount += 1;
      } else {
        existing.absentCount += 1;
      }
      summaryByDate.set(dateKey, existing);
    });

    const history = Array.from(summaryByDate.entries())
      .map(([dateKey, counts]) => {
        const markedCount = counts.presentCount + counts.absentCount;
        const attendancePct = totalStudents > 0 ? Math.round((counts.presentCount / totalStudents) * 100) : 0;

        return {
          date: dateKey,
          presentCount: counts.presentCount,
          absentCount: counts.absentCount,
          markedCount,
          totalStudents,
          attendancePct
        };
      })
      .sort((left, right) => right.date.localeCompare(left.date));

    return res.json(history);
  } catch {
    return res.status(503).json({ message: 'Database is unavailable.' });
  }
});

attendanceRouter.post('/attendance/class', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = submitAttendanceSchema.parse(req.body);
    const attendanceDate = new Date(payload.date);

    if (Number.isNaN(attendanceDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date.' });
    }

    const teacherAccess = await getTeacherClassAccess(req);

    if (teacherAccess) {
      if (!teacherAccess.classTeacher) {
        return res.status(403).json({ message: 'Class teacher assignment is required to submit attendance.' });
      }

      const requestScopeToken = scopeToken(payload.className, payload.section);
      const classTeacherScopeToken = scopeToken(teacherAccess.classTeacher.className, teacherAccess.classTeacher.section);
      if (requestScopeToken !== classTeacherScopeToken) {
        return res.status(403).json({ message: 'Teachers can only submit attendance for their class-teacher class.' });
      }
    }

    const validStudents = await prisma.student.findMany({
      where: {
        schoolId,
        className: payload.className,
        section: payload.section,
        id: {
          in: payload.records.map((record) => record.studentId)
        }
      },
      select: { id: true }
    });

    const validStudentIds = new Set(validStudents.map((student: { id: string }) => student.id));

    if (validStudentIds.size !== payload.records.length) {
      return res.status(400).json({ message: 'One or more attendance records do not belong to this class or school.' });
    }

    await prisma.$transaction(
      payload.records.map((record) =>
        prisma.attendance.upsert({
          where: {
            studentId_date: {
              studentId: record.studentId,
              date: attendanceDate
            }
          },
          update: {
            present: record.present,
            remark: record.remark
          },
          create: {
            studentId: record.studentId,
            date: attendanceDate,
            present: record.present,
            remark: record.remark
          }
        })
      )
    );

    return res.json({ message: 'Attendance saved successfully.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', issues: error.issues });
    }

    return res.status(400).json({ message: 'Unable to save attendance.' });
  }
});

export { attendanceRouter };
