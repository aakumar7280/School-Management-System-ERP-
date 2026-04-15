# School ERP Architecture

## Stack
- Frontend: React + Vite + Tailwind (apps/web)
- Backend: Node.js + Express + TypeScript (apps/api)
- Database: PostgreSQL + Prisma (packages/db)
- Local Infra: Docker Compose for PostgreSQL

## Modules (from client docs)
- User & role management (RBAC)
- Students & admissions
- Attendance
- Fees and accounting
- Exams and results
- Reports and analytics
- Communication/notice workflows

## Folder Layout
- apps/api: REST API and business logic
- apps/web: Admin web interface
- packages/db: Prisma schema, migrations, seed data
- docs: architecture, API mapping, implementation checklist
- scripts: setup scripts

## Design Principles
- Strong schema-first approach (Prisma)
- Validation at API boundary (zod)
- Environment-driven config
- Feature-oriented growth per module
- Reusable frontend layout/components
