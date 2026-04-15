import { Router } from 'express';

import { authRouter } from './auth.routes.js';
import { healthRouter } from './health.routes.js';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { teachersRouter } from '../modules/teachers/teachers.routes.js';
import { feesRouter } from '../modules/fees/fees.routes.js';
import { classesRouter } from '../modules/classes/classes.routes.js';
import { attendanceRouter } from '../modules/attendance/attendance.routes.js';
import { studentsRouter } from '../modules/students/students.routes.js';
import { studentPortalRouter } from '../modules/students/student-portal.routes.js';
import { settingsRouter } from '../modules/settings/settings.routes.js';
import { financeRouter } from '../modules/finance/finance.routes.js';

const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(dashboardRouter);
apiRouter.use(teachersRouter);
apiRouter.use(feesRouter);
apiRouter.use(classesRouter);
apiRouter.use(attendanceRouter);
apiRouter.use(studentsRouter);
apiRouter.use(studentPortalRouter);
apiRouter.use(settingsRouter);
apiRouter.use(financeRouter);

export { apiRouter };
