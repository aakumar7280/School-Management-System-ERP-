export type AppRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT' | 'ACCOUNTANT';

export interface AuthUser {
  id: string;
  role: AppRole;
  name: string;
  schoolId: string;
  schoolCode: string;
  schoolName: string;
  loginId: string;
  email: string;
  assignedClass?: string | null;
  assignedSection?: string | null;
  subjects?: string[];
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  portal: string;
}
