# API Contract (Phase 1)

## Auth
- POST /api/auth/login
  - request: email, password
  - response: token + user profile

## System
- GET /api/health
  - response: service status

## Students
- GET /api/students
  - response: list of students
- POST /api/students
  - request: admissionNo, firstName, lastName, className, section, guardianPhone
  - response: created student

## Next APIs to implement
- Dashboard summary and activity
- Attendance marking and reports
- Fee invoices and payment updates
- Exam schedules and marks entry
- Notices and parent communication
