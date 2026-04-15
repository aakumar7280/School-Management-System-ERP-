import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

import { env } from '../env.js';

type AuthRole = 'STUDENT' | 'PARENT' | 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'ACCOUNTANT';

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    role: AuthRole;
    schoolId: string;
    schoolCode?: string;
    loginId?: string;
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      sub?: string;
      role?: AuthRole;
      schoolId?: string;
      schoolCode?: string;
      loginId?: string;
    };

    if (!payload.sub || !payload.role || !payload.schoolId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.auth = {
      userId: payload.sub,
      role: payload.role,
      schoolId: payload.schoolId,
      schoolCode: payload.schoolCode,
      loginId: payload.loginId
    };

    return next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

export function requireStudentOrParent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.auth || (req.auth.role !== 'STUDENT' && req.auth.role !== 'PARENT')) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return next();
  });
}

export function requireStaffAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.auth || !['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ACCOUNTANT', 'TEACHER'].includes(req.auth.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return next();
  });
}
