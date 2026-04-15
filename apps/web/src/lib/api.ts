const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

import { AuthSession } from '../auth/types';
import { getSession } from '../auth/session';

export interface Student {
  id: string;
  schoolId?: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  className: string;
  section: string;
  guardianPhone: string;
  samagraId?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  caste?: string | null;
  religion?: 'Hindu' | 'Muslim' | 'Christian' | null;
  busRoute?: string | null;
  photoUrl?: string | null;
  aadhaarNumber?: string | null;
  fullAddress?: string | null;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  studentPhone?: string | null;
  studentEmail?: string | null;
  birthCertificateUrl?: string | null;
  aadhaarCardUrl?: string | null;
  previousReportCardUrl?: string | null;
  transferCertificateUrl?: string | null;
  profileSubmittedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
}

export interface LoginPayload {
  loginId: string;
  password: string;
}

export interface AdminStudentProfile {
  personal: Student;
  fees: {
    assignment: {
      id: string;
      billingCycle: 'YEARLY' | 'QUARTERLY' | 'MONTHLY';
      components: Array<{
        id: string;
        feeType: string;
        cadence: 'MONTHLY' | 'YEARLY';
        amount: number;
      }>;
      discount: {
        id: string;
        type: 'FLAT' | 'PERCENTAGE';
        value: number;
        reason?: string | null;
      } | null;
      subtotal: number;
      yearlySubtotal: number;
      monthlySubtotal: number;
      discountAmount: number;
      finalTotal: number;
    } | null;
    invoices: Array<{
      id: string;
      title: string;
      amount: number;
      paidAmount: number;
      due: number;
      dueDate: string;
      status: 'UNPAID' | 'PARTIAL' | 'PAID';
      createdAt: string;
      updatedAt: string;
      payments: Array<{
        id: string;
        amount: number;
        paymentMethod: 'UPI' | 'CASH';
        feeType: string | null;
        dueAfterPayment: number | null;
        createdAt: string;
      }>;
    }>;
    payments: Array<{
      id: string;
      amount: number;
      paymentMethod: 'UPI' | 'CASH';
      feeType: string | null;
      dueAfterPayment: number | null;
      createdAt: string;
      invoiceId: string;
      invoiceTitle: string;
    }>;
    totals: {
      billed: number;
      paid: number;
      due: number;
    };
  };
  attendance: {
    summary: {
      total: number;
      present: number;
      absent: number;
    };
    records: Array<{
      id: string;
      date: string;
      present: boolean;
      remark?: string | null;
    }>;
  };
  grades: {
    available: boolean;
    items: unknown[];
  };
}

export interface AdminStudentProfileUpdatePayload {
  admissionNo: string;
  firstName: string;
  lastName: string;
  className: string;
  section: string;
  guardianPhone: string;
  samagraId?: string;
  dateOfBirth?: string;
  gender?: string;
  caste?: string;
  religion?: 'Hindu' | 'Muslim' | 'Christian' | '';
  busRoute?: string;
  aadhaarNumber?: string;
  fullAddress?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  fatherName?: string;
  motherName?: string;
  parentPhone?: string;
  parentEmail?: string;
  studentPhone?: string;
  studentEmail?: string;
  isActive?: boolean;
  photo?: File | null;
  birthCertificate?: File | null;
  aadhaarCard?: File | null;
  previousReportCard?: File | null;
  transferCertificate?: File | null;
}

export interface Teacher {
  id: string;
  loginId: string;
  firstName: string;
  lastName: string;
  email: string;
  assignedClass: string | null;
  assignedSection: string | null;
  subjects: string[];
}

export interface DashboardSummary {
  totalStudents: number;
  totalTeachers: number;
}

export interface DashboardActivity {
  type: string;
  message: string;
  date: string;
}

export interface ClassOverview {
  className: string;
  section: string;
  studentCount: number;
  teachers: { name: string; subjects: string[] }[];
}

export interface ClassAttendanceRecord {
  studentId: string;
  admissionNo: string;
  name: string;
  present: boolean;
  remark: string;
}

export interface StudentAdmissionProfile {
  id: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  className: string;
  section: string;
  samagraId: string;
  aadhaarNumber: string;
  caste: string;
  religion: 'Hindu' | 'Muslim' | 'Christian' | '';
  busRoute: string;
  fullAddress: string;
  city: string;
  state: string;
  pinCode: string;
  fatherName: string;
  motherName: string;
  phoneNumber: string;
  email: string;
  studentPhoneNumber: string;
  studentEmail: string;
  profileSubmittedAt: string | null;
  photoUrl: string;
  birthCertificateUrl: string;
  aadhaarCardUrl: string;
  previousReportCardUrl: string;
  transferCertificateUrl: string;
}

export interface StudentAdmissionSubmission {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  samagraId: string;
  aadhaarNumber?: string;
  caste?: string;
  religion?: 'Hindu' | 'Muslim' | 'Christian' | '';
  busRoute?: string;
  fullAddress: string;
  city: string;
  state: string;
  pinCode: string;
  fatherName: string;
  motherName: string;
  phoneNumber: string;
  email: string;
  studentPhoneNumber?: string;
  studentEmail?: string;
  photo?: File | null;
  birthCertificate?: File | null;
  aadhaarCard?: File | null;
  previousReportCard?: File | null;
  transferCertificate?: File | null;
}

export interface StudentPortalFees {
  student: {
    id: string;
    admissionNo: string;
    name: string;
    className: string;
    section: string;
  };
  assignedFee: {
    id: string;
    billingCycle: 'YEARLY' | 'QUARTERLY' | 'MONTHLY';
    components: Array<{
      id: string;
      feeType: string;
      cadence: 'MONTHLY' | 'YEARLY';
      amount: number;
    }>;
    discount: {
      id: string;
      type: 'FLAT' | 'PERCENTAGE';
      value: number;
      reason?: string | null;
    } | null;
    subtotal: number;
    yearlySubtotal: number;
    monthlySubtotal: number;
    discountAmount: number;
    finalTotal: number;
    annualTotal: number;
    monthlyInstallment: number;
    quarterlyInstallment: number;
    updatedAt: string;
  } | null;
  feePolicy: {
    feeDueDayOfMonth: number;
  };
  invoices: Array<{
    id: string;
    title: string;
    amount: number;
    paidAmount: number;
    due: number;
    dueDate: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  totals: {
    totalBilled: number;
    totalPaid: number;
    totalDue: number;
  };
}

export interface GradeSetting {
  grade: string;
  sections: string[];
}

export interface AcademicStructureResponse {
  feeDueDayOfMonth: number;
  grades: GradeSetting[];
}

export interface FinanceOverview {
  view?: 'month' | 'year';
  periodKey?: string;
  month: string;
  year?: string;
  summary: {
    totalBilled: number;
    totalCollected: number;
    totalDue: number;
    unpaidStudentsCount: number;
    salaryPaid: number;
    salariesSentCount: number;
    pendingSalariesCount: number;
  };
  pie: { label: string; value: number }[];
  feesChart: { label: string; value: number }[];
  salariesChart: { label: string; value: number }[];
  revenueChart: { label: string; value: number }[];
  feeTransactions: Array<{
    id: string;
    createdAt: string;
    amount: number;
    paymentMethod: 'UPI' | 'CASH';
    feeType: string | null;
    invoice: {
      id: string;
      title: string;
      amount: number;
      paidAmount: number;
      due: number;
      dueDate: string;
      status: string;
    };
    student: {
      id: string;
      admissionNo: string;
      name: string;
      className: string;
      section: string;
    };
  }>;
  dueStudents: Array<{
    id: string;
    title: string;
    dueDate: string;
    amount: number;
    paid: number;
    due: number;
    status: string;
    student: {
      id: string;
      admissionNo: string;
      name: string;
      className: string;
      section: string;
    };
  }>;
  salariesSent: Array<{
    id: string;
    month: string;
    amount: number;
    note?: string | null;
    createdAt: string;
    teacher: {
      id: string;
      loginId: string;
      name: string;
      assignedClass: string | null;
      assignedSection: string | null;
    };
  }>;
  pendingSalaries: Array<{
    id: string;
    loginId: string;
    name: string;
    assignedClass: string | null;
    assignedSection: string | null;
  }>;
}

export interface FeeStudentOption {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  className: string;
  section: string;
}

export interface StudentFeeAssignment {
  id: string;
  studentId: string;
  billingCycle: 'YEARLY' | 'QUARTERLY' | 'MONTHLY';
  components: Array<{
    id: string;
    feeType: string;
    cadence: 'MONTHLY' | 'YEARLY';
    amount: number;
  }>;
  discount: {
    id: string;
    type: 'FLAT' | 'PERCENTAGE';
    value: number;
    reason?: string | null;
  } | null;
  subtotal: number;
  yearlySubtotal: number;
  monthlySubtotal: number;
  discountAmount: number;
  finalTotal: number;
  annualTotal: number;
  monthlyInstallment: number;
  quarterlyInstallment: number;
  installmentAmount: number;
  updatedAt: string;
  student: {
    id: string;
    admissionNo: string;
    name: string;
    className: string;
    section: string;
  };
}

export interface FeeInvoiceListItem {
  id: string;
  title: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
  createdAt: string;
  updatedAt: string;
  student: {
    admissionNo: string;
    firstName: string;
    lastName: string;
  };
}

function getAuthHeader() {
  const session = getSession();
  const headers: Record<string, string> = {};
  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  return headers;
}

function formatValidationError(data: unknown, fallbackMessage: string) {
  const parsed = data as {
    message?: string;
    issues?: Array<{ message?: string; path?: Array<string | number> }>;
  };

  if (Array.isArray(parsed?.issues) && parsed.issues.length > 0) {
    const firstIssue = parsed.issues[0];
    const path = Array.isArray(firstIssue.path)
      ? firstIssue.path.filter((part) => typeof part === 'string' || typeof part === 'number').join('.')
      : '';
    const rawMessage = typeof firstIssue.message === 'string' ? firstIssue.message : '';
    const genericMessages = new Set(['Invalid', 'Invalid input', 'Invalid value']);

    if (path && rawMessage && !genericMessages.has(rawMessage)) {
      return `${path}: ${rawMessage}`;
    }

    if (path) {
      return `${path}: Invalid value`;
    }

    if (rawMessage) {
      return rawMessage;
    }
  }

  if (typeof parsed?.message === 'string' && parsed.message.trim().length > 0) {
    return parsed.message;
  }

  return fallbackMessage;
}

export async function fetchStudents(params?: { className?: string; section?: string; sort?: 'createdAt' | 'name' | 'admissionNo' }): Promise<Student[]> {
  const search = new URLSearchParams();
  if (params?.className) search.set('className', params.className);
  if (params?.section) search.set('section', params.section);
  if (params?.sort) search.set('sort', params.sort);

  const url = `${API_BASE_URL}/students${search.toString() ? `?${search.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    throw new Error('Failed to load students');
  }

  return response.json();
}

export async function createStudent(payload: Omit<Student, 'id'>): Promise<Student> {
  const response = await fetch(`${API_BASE_URL}/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to create student' }));
    const firstIssue = Array.isArray(data.issues) ? data.issues[0] : null;
    const issueMessage = firstIssue && typeof firstIssue.message === 'string' ? firstIssue.message : null;
    throw new Error(issueMessage ?? data.message ?? 'Failed to create student');
  }

  return response.json();
}

export async function updateStudent(studentId: string, payload: Omit<Student, 'id'>): Promise<Student> {
  const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to update student' }));
    const firstIssue = Array.isArray(data.issues) ? data.issues[0] : null;
    const issueMessage = firstIssue && typeof firstIssue.message === 'string' ? firstIssue.message : null;
    throw new Error(issueMessage ?? data.message ?? 'Failed to update student');
  }

  return response.json();
}

export async function fetchAdminStudentProfile(studentId: string): Promise<AdminStudentProfile> {
  const response = await fetch(`${API_BASE_URL}/students/${studentId}/profile`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to load student profile' }));
    throw new Error(data.message ?? 'Failed to load student profile');
  }

  return response.json();
}

export async function updateAdminStudentProfile(studentId: string, payload: AdminStudentProfileUpdatePayload): Promise<{ message: string; student: Student }> {
  const formData = new FormData();

  formData.set('admissionNo', payload.admissionNo);
  formData.set('firstName', payload.firstName);
  formData.set('lastName', payload.lastName);
  formData.set('className', payload.className);
  formData.set('section', payload.section);
  formData.set('guardianPhone', payload.guardianPhone);
  formData.set('samagraId', payload.samagraId ?? '');
  formData.set('dateOfBirth', payload.dateOfBirth ?? '');
  formData.set('gender', payload.gender ?? '');
  formData.set('caste', payload.caste ?? '');
  formData.set('religion', payload.religion ?? '');
  formData.set('busRoute', payload.busRoute ?? '');
  formData.set('aadhaarNumber', payload.aadhaarNumber ?? '');
  formData.set('fullAddress', payload.fullAddress ?? '');
  formData.set('city', payload.city ?? '');
  formData.set('state', payload.state ?? '');
  formData.set('pinCode', payload.pinCode ?? '');
  formData.set('fatherName', payload.fatherName ?? '');
  formData.set('motherName', payload.motherName ?? '');
  formData.set('parentPhone', payload.parentPhone ?? '');
  formData.set('parentEmail', payload.parentEmail ?? '');
  formData.set('studentPhone', payload.studentPhone ?? '');
  formData.set('studentEmail', payload.studentEmail ?? '');
  if (typeof payload.isActive === 'boolean') formData.set('isActive', String(payload.isActive));

  if (payload.photo) formData.set('photo', payload.photo);
  if (payload.birthCertificate) formData.set('birthCertificate', payload.birthCertificate);
  if (payload.aadhaarCard) formData.set('aadhaarCard', payload.aadhaarCard);
  if (payload.previousReportCard) formData.set('previousReportCard', payload.previousReportCard);
  if (payload.transferCertificate) formData.set('transferCertificate', payload.transferCertificate);

  const response = await fetch(`${API_BASE_URL}/students/${studentId}/profile`, {
    method: 'PUT',
    headers: getAuthHeader(),
    body: formData
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to update student profile' }));
    throw new Error(formatValidationError(data, 'Failed to update student profile'));
  }

  return response.json();
}

export async function login(loginId: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ loginId, password } satisfies LoginPayload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Login failed' }));
    throw new Error(data.message ?? 'Login failed');
  }

  return response.json();
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const response = await fetch(`${API_BASE_URL}/dashboard/summary`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    throw new Error('Failed to load dashboard summary');
  }

  return response.json();
}

export async function fetchDashboardActivity(): Promise<DashboardActivity[]> {
  const response = await fetch(`${API_BASE_URL}/dashboard/activity`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    throw new Error('Failed to load dashboard activity');
  }

  return response.json();
}

export async function fetchTeachers(params?: { className?: string; section?: string; subject?: string }): Promise<Teacher[]> {
  const search = new URLSearchParams();
  if (params?.className) search.set('className', params.className);
  if (params?.section) search.set('section', params.section);
  if (params?.subject) search.set('subject', params.subject);

  const url = `${API_BASE_URL}/teachers${search.toString() ? `?${search.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    throw new Error('Failed to load teachers');
  }

  return response.json();
}

export async function createTeacher(payload: {
  loginId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  assignedClass: string;
  assignedSection: string;
  subjects: string[];
}): Promise<Teacher> {
  const response = await fetch(`${API_BASE_URL}/teachers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to create teacher' }));
    throw new Error(data.message ?? 'Failed to create teacher');
  }

  return response.json();
}

export async function updateTeacher(
  teacherId: string,
  payload: {
    loginId: string;
    firstName: string;
    lastName: string;
    email: string;
    assignedClass: string;
    assignedSection: string;
    subjects: string[];
  }
): Promise<Teacher> {
  const response = await fetch(`${API_BASE_URL}/teachers/${teacherId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to update teacher' }));
    throw new Error(data.message ?? 'Failed to update teacher');
  }

  return response.json();
}

export async function createFeeInvoice(payload: {
  admissionNo: string;
  title: string;
}): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/fees/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to send fee invoice' }));
    throw new Error(data.message ?? 'Failed to send fee invoice');
  }

  return response.json();
}

export async function fetchFeeInvoices(): Promise<FeeInvoiceListItem[]> {
  const response = await fetch(`${API_BASE_URL}/fees/invoices`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to load fee invoices' }));
    throw new Error(data.message ?? 'Failed to load fee invoices');
  }

  return response.json();
}

export async function generateBulkFeeInvoices(): Promise<{
  message: string;
  summary: {
    totalEligible: number;
    created: number;
    skipped: number;
    skippedReasons: {
      missingSchoolConfig: number;
      invalidInstallment: number;
      existingInvoiceForDueDate: number;
    };
  };
}> {
  const response = await fetch(`${API_BASE_URL}/fees/invoices/bulk`, {
    method: 'POST',
    headers: getAuthHeader()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to generate bulk fee invoices' }));
    throw new Error(data.message ?? 'Failed to generate bulk fee invoices');
  }

  return response.json();
}

export async function fetchFeeTeachers(): Promise<Teacher[]> {
  const response = await fetch(`${API_BASE_URL}/fees/teachers`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    throw new Error('Failed to load teachers for payments');
  }

  return response.json();
}

export async function createPayStub(payload: { teacherId: string; month: string; amount: number; note?: string }): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/fees/pay-stubs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to issue pay stub' }));
    throw new Error(data.message ?? 'Failed to issue pay stub');
  }

  return response.json();
}

export async function fetchClassesOverview(): Promise<ClassOverview[]> {
  const response = await fetch(`${API_BASE_URL}/classes/overview`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    throw new Error('Failed to load classes overview');
  }

  return response.json();
}

export async function fetchClassAttendance(params: {
  className: string;
  section: string;
  date: string;
}): Promise<ClassAttendanceRecord[]> {
  const search = new URLSearchParams({
    className: params.className,
    section: params.section,
    date: params.date
  });

  const response = await fetch(`${API_BASE_URL}/attendance/class?${search.toString()}`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to load class attendance' }));
    throw new Error(data.message ?? 'Failed to load class attendance');
  }

  return response.json();
}

export async function saveClassAttendance(payload: {
  className: string;
  section: string;
  date: string;
  records: { studentId: string; present: boolean; remark?: string }[];
}): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/attendance/class`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to save class attendance' }));
    throw new Error(data.message ?? 'Failed to save class attendance');
  }

  return response.json();
}

export async function fetchStudentAdmissionProfile(): Promise<StudentAdmissionProfile> {
  const response = await fetch(`${API_BASE_URL}/student-portal/admission-form`, {
    headers: {
      ...getAuthHeader()
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to load admission form' }));
    throw new Error(data.message ?? 'Failed to load admission form');
  }

  return response.json();
}

export async function submitStudentAdmissionForm(payload: StudentAdmissionSubmission): Promise<{ message: string }> {
  const formData = new FormData();

  formData.set('fullName', payload.fullName);
  formData.set('dateOfBirth', payload.dateOfBirth);
  formData.set('gender', payload.gender);
  formData.set('samagraId', payload.samagraId);
  formData.set('aadhaarNumber', payload.aadhaarNumber ?? '');
  formData.set('caste', payload.caste ?? '');
  formData.set('religion', payload.religion ?? '');
  formData.set('busRoute', payload.busRoute ?? '');
  formData.set('fullAddress', payload.fullAddress);
  formData.set('city', payload.city);
  formData.set('state', payload.state);
  formData.set('pinCode', payload.pinCode);
  formData.set('fatherName', payload.fatherName);
  formData.set('motherName', payload.motherName);
  formData.set('phoneNumber', payload.phoneNumber);
  formData.set('email', payload.email);
  formData.set('studentPhoneNumber', payload.studentPhoneNumber ?? '');
  formData.set('studentEmail', payload.studentEmail ?? '');

  if (payload.photo) formData.set('photo', payload.photo);
  if (payload.birthCertificate) formData.set('birthCertificate', payload.birthCertificate);
  if (payload.aadhaarCard) formData.set('aadhaarCard', payload.aadhaarCard);
  if (payload.previousReportCard) formData.set('previousReportCard', payload.previousReportCard);
  if (payload.transferCertificate) formData.set('transferCertificate', payload.transferCertificate);

  const response = await fetch(`${API_BASE_URL}/student-portal/admission-form`, {
    method: 'PUT',
    headers: {
      ...getAuthHeader()
    },
    body: formData
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to submit admission form' }));
    throw new Error(formatValidationError(data, 'Failed to submit admission form'));
  }

  return response.json();
}

export async function fetchAcademicStructure(): Promise<AcademicStructureResponse> {
  const response = await fetch(`${API_BASE_URL}/settings/academic-structure`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to load settings' }));
    throw new Error(data.message ?? 'Failed to load settings');
  }

  return response.json();
}

export async function updateAcademicStructure(payload: AcademicStructureResponse): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/settings/academic-structure`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to update settings' }));
    throw new Error(data.message ?? 'Failed to update settings');
  }

  return response.json();
}

export async function fetchStudentPortalFees(): Promise<StudentPortalFees> {
  const response = await fetch(`${API_BASE_URL}/student-portal/fees`, {
    headers: {
      ...getAuthHeader()
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to load student fee details' }));
    throw new Error(data.message ?? 'Failed to load student fee details');
  }

  return response.json();
}

export async function payStudentPortalInvoice(
  invoiceId: string,
  amount?: number,
  paymentMethod: 'UPI' | 'CASH' = 'UPI',
  feeType?: string
): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/student-portal/fees/${invoiceId}/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader()
    },
    body: JSON.stringify(amount ? { amount, paymentMethod, feeType } : { paymentMethod, feeType })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to pay fee invoice' }));
    throw new Error(data.message ?? 'Failed to pay fee invoice');
  }

  return response.json();
}

export async function payFeeInvoiceAsAdmin(
  invoiceId: string,
  payload: { amount: number; paymentMethod: 'UPI' | 'CASH'; feeType?: string }
): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/fees/invoices/${invoiceId}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to record fee payment' }));
    throw new Error(data.message ?? 'Failed to record fee payment');
  }

  return response.json();
}

export async function deleteFeeInvoiceAsAdmin(invoiceId: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/fees/invoices/${invoiceId}`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to delete fee due' }));
    throw new Error(data.message ?? 'Failed to delete fee due');
  }

  return response.json();
}

export async function clearFeeTransactionsAsAdmin(): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/fees/transactions`, {
    method: 'DELETE',
    headers: getAuthHeader()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to clear transaction log' }));
    throw new Error(data.message ?? 'Failed to clear transaction log');
  }

  return response.json();
}

export async function fetchFinanceOverview(
  params?: string | { view?: 'month' | 'year'; month?: string; year?: string }
): Promise<FinanceOverview> {
  const search = new URLSearchParams();

  if (typeof params === 'string') {
    search.set('month', params);
  } else if (params) {
    if (params.view) search.set('view', params.view);
    if (params.month) search.set('month', params.month);
    if (params.year) search.set('year', params.year);
  }

  const response = await fetch(`${API_BASE_URL}/finance/overview${search.toString() ? `?${search.toString()}` : ''}`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to load finance overview' }));
    throw new Error(data.message ?? 'Failed to load finance overview');
  }

  return response.json();
}

export async function fetchFeeStudents(): Promise<FeeStudentOption[]> {
  const response = await fetch(`${API_BASE_URL}/fees/students`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to load students for fees' }));
    throw new Error(data.message ?? 'Failed to load students for fees');
  }

  return response.json();
}

export async function fetchStudentFeeAssignments(): Promise<StudentFeeAssignment[]> {
  const response = await fetch(`${API_BASE_URL}/fees/student-assignments`, {
    headers: getAuthHeader()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to load student fee assignments' }));
    throw new Error(data.message ?? 'Failed to load student fee assignments');
  }

  return response.json();
}

export async function upsertStudentFeeAssignment(
  studentId: string,
  payload: {
    billingCycle: 'YEARLY' | 'QUARTERLY' | 'MONTHLY';
    components: Array<{
      feeType: string;
      cadence: 'MONTHLY' | 'YEARLY';
      amount: number;
    }>;
    discount?: {
      type: 'FLAT' | 'PERCENTAGE';
      value: number;
      reason?: string;
    };
  }
): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/fees/student-assignments/${studentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Failed to assign student fee' }));
    throw new Error(data.message ?? 'Failed to assign student fee');
  }

  return response.json();
}
