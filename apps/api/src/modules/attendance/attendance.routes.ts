import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../config/prisma.js';
import { AuthenticatedRequest, requireStaffAuth } from '../../middleware/auth.js';

const attendanceRouter = Router();

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

attendanceRouter.use(requireStaffAuth);

attendanceRouter.get('/attendance/class', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const className = typeof req.query.className === 'string' ? req.query.className : '';
    const section = typeof req.query.section === 'string' ? req.query.section : '';
    const date = typeof req.query.date === 'string' ? req.query.date : '';

    if (!className || !section || !date) {
      return res.status(400).json({ message: 'className, section and date are required.' });
    }

    const targetDate = new Date(date);

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

attendanceRouter.post('/attendance/class', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;
    const payload = submitAttendanceSchema.parse(req.body);
    const attendanceDate = new Date(payload.date);

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
