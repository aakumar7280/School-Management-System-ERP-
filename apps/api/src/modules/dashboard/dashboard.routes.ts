import { Router } from 'express';

import { prisma } from '../../config/prisma.js';
import { AuthenticatedRequest, requireStaffAuth } from '../../middleware/auth.js';

const dashboardRouter = Router();

dashboardRouter.use(requireStaffAuth);

dashboardRouter.get('/dashboard/summary', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;

    const [totalStudents, totalTeachers] = await Promise.all([
      prisma.student.count({ where: { schoolId, isActive: true } }),
      prisma.user.count({ where: { schoolId, role: 'TEACHER', isActive: true } })
    ]);

    return res.json({
      totalStudents,
      totalTeachers
    });
  } catch {
    return res.status(503).json({
      message: 'Database is unavailable. Start PostgreSQL and run migrations.'
    });
  }
});

dashboardRouter.get('/dashboard/activity', async (req: AuthenticatedRequest, res) => {
  try {
    const schoolId = req.auth!.schoolId;

    const latestInvoice = await prisma.feeInvoice.findFirst({
      where: {
        student: {
          schoolId
        }
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        student: {
          select: { firstName: true, lastName: true }
        }
      }
    });

    const activities = latestInvoice
      ? [
          {
            type: 'fee',
            message: `${latestInvoice.student.firstName} ${latestInvoice.student.lastName} paid ₹${Number(latestInvoice.paidAmount)}`,
            date: latestInvoice.updatedAt.toISOString().slice(0, 10)
          }
        ]
      : [];

    return res.json(activities);
  } catch {
    return res.status(503).json({
      message: 'Database is unavailable. Start PostgreSQL and run migrations.'
    });
  }
});

export { dashboardRouter };
