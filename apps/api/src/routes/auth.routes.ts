import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import { env } from '../env.js';
import { prisma } from '../config/prisma.js';

const authRouter = Router();
const jwtSignOptions: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };

const loginSchema = z.object({
  loginId: z.string().min(3),
  password: z.string().min(6)
});

authRouter.post('/auth/login', async (req, res) => {
  const payload = loginSchema.parse(req.body);

  const user = await prisma.user.findFirst({
    where: {
      loginId: payload.loginId
    },
    include: {
      school: {
        select: {
          id: true,
          code: true,
          name: true
        }
      }
    }
  });

  if (!user || !user.isActive || !user.school) {
    return res.status(401).json({ message: 'Invalid login ID or password' });
  }

  const isValidPassword = await bcrypt.compare(payload.password, user.passwordHash);

  if (!isValidPassword) {
    return res.status(401).json({ message: 'Invalid login ID or password' });
  }

  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
      schoolId: user.school.id,
      schoolCode: user.school.code,
      loginId: user.loginId
    },
    env.JWT_SECRET,
    jwtSignOptions
  );

  const roleToPortal: Record<string, string> = {
    SUPER_ADMIN: '/admin/dashboard',
    SCHOOL_ADMIN: '/admin/dashboard',
    ACCOUNTANT: '/admin/dashboard',
    TEACHER: '/teacher/portal',
    STUDENT: '/student/portal',
    PARENT: '/parent/portal'
  };

  const portal = roleToPortal[user.role] ?? '/login';

  return res.json({
    token,
    user: {
      id: user.id,
      role: user.role,
      name: `${user.firstName} ${user.lastName}`,
      schoolId: user.school.id,
      schoolCode: user.school.code,
      schoolName: user.school.name,
      loginId: user.loginId,
      email: user.email,
      assignedClass: user.assignedClass,
      assignedSection: user.assignedSection,
      subjects: user.subjects
    },
    portal
  });
});

export { authRouter };
