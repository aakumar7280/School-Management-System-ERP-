# Multi-School ERP Architecture Roadmap

This ERP already has the beginnings of multi-school support in the database through `School`, `User.schoolId`, and `Student.schoolId`.

To make it sellable as a shared SaaS product, the application now needs to move from **single-school assumptions** to **tenant-aware behavior** in every layer.

## Target model

- One shared product
- One shared codebase
- One shared database
- One logical tenant per school
- Strict tenant isolation using `schoolId`
- Optional branded subdomains later, such as `school-a.yourerp.com`

## Recommended tenancy rules

1. Every authenticated request must carry the current `schoolId`.
2. Every school-scoped query must filter by `schoolId`.
3. Every create operation must write `schoolId` from auth context, not from client input.
4. `SUPER_ADMIN` may cross tenants.
5. `SCHOOL_ADMIN`, `TEACHER`, `ACCOUNTANT`, `STUDENT`, and `PARENT` must stay inside their own tenant.
6. Unique business identifiers should become tenant-scoped where needed.

## What already exists

- `School` model in [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma)
- `schoolId` on `User`
- `schoolId` on `Student`
- `schoolId` on `SchoolGradeConfig`

## Current gaps found in the API

The following patterns still assume one global school:

- `findFirst({ orderBy: { createdAt: 'asc' } })` used to pick a school globally
- admin routes with no auth guard
- dashboard counts across all tenants
- teacher, fee, class, finance, and student admin endpoints that query all records without `schoolId`
- login/session previously returned no school metadata to the frontend

## Phase 1: Tenant identity foundation

Status: started.

Implemented in this step:

- login token now includes `schoolId`
- login response now includes `schoolId`, `schoolCode`, and `schoolName`
- API auth middleware now requires `schoolId` in the JWT
- frontend session types now keep school identity

Outcome:

- every future request can be made tenant-aware without guessing the school

## Phase 2: Protect admin routes

Next change should be to require auth on all admin/staff modules:

- [apps/api/src/modules/dashboard/dashboard.routes.ts](apps/api/src/modules/dashboard/dashboard.routes.ts)
- [apps/api/src/modules/teachers/teachers.routes.ts](apps/api/src/modules/teachers/teachers.routes.ts)
- [apps/api/src/modules/fees/fees.routes.ts](apps/api/src/modules/fees/fees.routes.ts)
- [apps/api/src/modules/classes/classes.routes.ts](apps/api/src/modules/classes/classes.routes.ts)
- [apps/api/src/modules/attendance/attendance.routes.ts](apps/api/src/modules/attendance/attendance.routes.ts)
- [apps/api/src/modules/students/students.routes.ts](apps/api/src/modules/students/students.routes.ts)
- [apps/api/src/modules/settings/settings.routes.ts](apps/api/src/modules/settings/settings.routes.ts)
- [apps/api/src/modules/finance/finance.routes.ts](apps/api/src/modules/finance/finance.routes.ts)

Recommended rule:

- `SUPER_ADMIN`, `SCHOOL_ADMIN`, `ACCOUNTANT`, `TEACHER` can authenticate
- module-level authorization can then restrict write actions more tightly

## Phase 3: Enforce school-scoped querying

Every query that reads tenant-owned data should follow this pattern:

```ts
where: {
  schoolId: req.auth!.schoolId
}
```

Examples:

- `prisma.student.findMany(...)`
- `prisma.user.findMany(...)`
- `prisma.student.count(...)`
- `prisma.user.count(...)`
- `prisma.schoolGradeConfig.findUnique(...)`

For models without direct `schoolId`, scope through relations.

Example:

```ts
where: {
  student: {
    schoolId: req.auth!.schoolId
  }
}
```

This applies to:

- `FeeInvoice`
- `FeePayment`
- `Attendance`
- `Discount`
- `StudentFeeAssignment`
- `StudentFeeComponent`
- `PayStub`

## Phase 4: Fix tenant-wide uniqueness rules

Right now some fields are globally unique, which will block selling to many schools.

Most important examples in [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma):

- `User.email @unique`
- `User.loginId @unique`
- `Student.admissionNo @unique`

Recommended future schema direction:

- remove global uniqueness where appropriate
- replace with compound uniqueness

Examples:

- `@@unique([schoolId, loginId])`
- `@@unique([schoolId, email])` if email must be unique inside a school only
- `@@unique([schoolId, admissionNo])`

This is required before two schools can safely use the same admission numbering or staff login format.

## Phase 5: Tenant-aware UX and branding

Add school-level customization:

- logo
- primary/secondary colors
- board affiliation
- address and contacts
- website URL
- invoice header/footer settings

These should live on `School` or a related branding/settings table.

Frontend usage:

- show school name/logo after login
- apply per-school theme tokens
- use school branding in reports, portals, and receipts

## Phase 6: SaaS operations

To make this product sellable, add:

- school onboarding flow
- super admin tenant management panel
- usage/billing tracking per school
- audit logs
- backup/export per tenant
- subscription plan enforcement

## Safest implementation order

1. Add tenant identity to auth and session
2. Add auth protection to admin routes
3. Scope all reads/writes by tenant
4. Convert global unique fields to compound unique fields
5. Add super admin school management UI
6. Add school branding and onboarding

## Immediate next coding task

The next best implementation step is:

**Protect and tenant-scope the admin API modules one by one, starting with dashboard, students, and teachers.**

That will give the biggest security improvement with the least product risk.