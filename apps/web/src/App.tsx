import { Navigate, Route, Routes } from 'react-router-dom';
import { useState } from 'react';

import { getSession } from './auth/session';
import { AppRole, AuthSession } from './auth/types';
import { MainLayout } from './layout/MainLayout';
import { ClassesPage } from './pages/ClassesPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminSettingsPage } from './pages/AdminSettingsPage';
import { FinanceDashboardPage } from './pages/FinanceDashboardPage';
import { FinanceInvoicesPage } from './pages/FinanceInvoicesPage';
import { FinancePage } from './pages/FinancePage';
import { FinanceSalariesPage } from './pages/FinanceSalariesPage';
import { LoginPage } from './pages/LoginPage';
import { StaffManagementPage } from './pages/StaffManagementPage';
import { StudentAdmissionPage } from './pages/StudentAdmissionPage';
import { StudentDashboardPage } from './pages/StudentDashboardPage';
import { StudentFeesPage } from './pages/StudentFeesPage';
import { StudentsPage } from './pages/StudentsPage';
import { TeacherPortalPage } from './pages/TeacherPortalPage';

function getDefaultPortal(role: AppRole) {
  switch (role) {
    case 'TEACHER':
      return '/teacher/portal';
    case 'STUDENT':
      return '/student/dashboard';
    case 'PARENT':
      return '/parent/dashboard';
    case 'SUPER_ADMIN':
    case 'SCHOOL_ADMIN':
    case 'ACCOUNTANT':
    default:
      return '/admin/dashboard';
  }
}

function canAccessAdmin(role: AppRole) {
  return role === 'SUPER_ADMIN' || role === 'SCHOOL_ADMIN' || role === 'ACCOUNTANT';
}

function canAccessTeacher(role: AppRole) {
  return role === 'TEACHER';
}

function canAccessStudent(role: AppRole) {
  return role === 'STUDENT';
}

function canAccessParent(role: AppRole) {
  return role === 'PARENT';
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => getSession());

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={setSession} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const defaultPortal = getDefaultPortal(session.user.role);

  return (
    <MainLayout session={session} onLogout={() => setSession(null)}>
      <Routes>
        <Route path="/" element={<Navigate to={defaultPortal} replace />} />
        <Route path="/login" element={<Navigate to={defaultPortal} replace />} />

        <Route
          path="/admin/dashboard"
          element={canAccessAdmin(session.user.role) ? <DashboardPage /> : <Navigate to={defaultPortal} replace />}
        />
        <Route
          path="/admin/students"
          element={canAccessAdmin(session.user.role) ? <StudentsPage /> : <Navigate to={defaultPortal} replace />}
        />
        <Route
          path="/admin/staff"
          element={canAccessAdmin(session.user.role) ? <StaffManagementPage /> : <Navigate to={defaultPortal} replace />}
        />
        <Route
          path="/admin/finance"
          element={<Navigate to="/admin/finance/dashboard" replace />}
        />
        <Route
          path="/admin/finance/dashboard"
          element={canAccessAdmin(session.user.role) ? <FinanceDashboardPage /> : <Navigate to={defaultPortal} replace />}
        />
        <Route
          path="/admin/finance/fees"
          element={canAccessAdmin(session.user.role) ? <FinancePage /> : <Navigate to={defaultPortal} replace />}
        />
        <Route
          path="/admin/finance/invoices"
          element={canAccessAdmin(session.user.role) ? <FinanceInvoicesPage /> : <Navigate to={defaultPortal} replace />}
        />
        <Route
          path="/admin/finance/invoices/*"
          element={canAccessAdmin(session.user.role) ? <FinanceInvoicesPage /> : <Navigate to={defaultPortal} replace />}
        />
        <Route path="/admin/finance/invoice" element={<Navigate to="/admin/finance/invoices" replace />} />
        <Route
          path="/admin/finance/salaries"
          element={canAccessAdmin(session.user.role) ? <FinanceSalariesPage /> : <Navigate to={defaultPortal} replace />}
        />
        <Route path="/admin/fees" element={<Navigate to="/admin/finance/fees" replace />} />
        <Route
          path="/admin/classes"
          element={canAccessAdmin(session.user.role) ? <ClassesPage /> : <Navigate to={defaultPortal} replace />}
        />
        <Route
          path="/admin/settings"
          element={canAccessAdmin(session.user.role) ? <AdminSettingsPage /> : <Navigate to={defaultPortal} replace />}
        />

        <Route
          path="/teacher/portal"
          element={
            canAccessTeacher(session.user.role) ? (
              <TeacherPortalPage session={session} />
            ) : (
              <Navigate to={defaultPortal} replace />
            )
          }
        />
        <Route
          path="/student/dashboard"
          element={
            canAccessStudent(session.user.role) ? (
              <StudentDashboardPage portalLabel="Student Portal" />
            ) : (
              <Navigate to={defaultPortal} replace />
            )
          }
        />
        <Route
          path="/student/portal"
          element={<Navigate to="/student/profile" replace />}
        />
        <Route
          path="/student/profile"
          element={
            canAccessStudent(session.user.role) ? (
              <StudentAdmissionPage portalLabel="Student Portal" />
            ) : (
              <Navigate to={defaultPortal} replace />
            )
          }
        />
        <Route
          path="/student/fees"
          element={
            canAccessStudent(session.user.role) ? (
              <StudentFeesPage portalLabel="Student Portal" />
            ) : (
              <Navigate to={defaultPortal} replace />
            )
          }
        />
        <Route
          path="/parent/dashboard"
          element={
            canAccessParent(session.user.role) ? (
              <StudentDashboardPage portalLabel="Parent Portal" />
            ) : (
              <Navigate to={defaultPortal} replace />
            )
          }
        />
        <Route
          path="/parent/portal"
          element={<Navigate to="/parent/profile" replace />}
        />
        <Route
          path="/parent/profile"
          element={
            canAccessParent(session.user.role) ? (
              <StudentAdmissionPage portalLabel="Parent Portal" />
            ) : (
              <Navigate to={defaultPortal} replace />
            )
          }
        />
        <Route
          path="/parent/fees"
          element={
            canAccessParent(session.user.role) ? (
              <StudentFeesPage portalLabel="Parent Portal" />
            ) : (
              <Navigate to={defaultPortal} replace />
            )
          }
        />

        <Route path="*" element={<Navigate to={defaultPortal} replace />} />
      </Routes>
    </MainLayout>
  );
}
