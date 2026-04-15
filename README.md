# School ERP Starter (Client-Ready Foundation)

This starter repository is prepared from your requirement documents to reduce implementation risk and give a clean production path.

## Included
- Monorepo workspace for API, web, and database packages
- API starter (Express + TypeScript + zod + Prisma)
- Frontend starter (React + Vite + Tailwind)
- PostgreSQL schema and seed for core school/student workflows
- Docker Compose for local database
- Architecture, API, and implementation checklist docs

## Quick Start
1. Copy env file
   - `cp .env.example .env`
2. Install dependencies
   - `npm install`
3. Start database
   - `docker compose up -d postgres`
4. Run migrations and seed
   - `npm run db:migrate`
   - `npm run db:generate`
   - `npm run db:seed`
5. Run apps
   - API: `npm run dev:api`
   - Web: `npm run dev:web`

## Endpoints (current)
- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/students`
- `POST /api/students`

## Deploy (Render + Vercel)

### 1) Deploy API on Render
- Use Blueprint deploy with `render.yaml` from repo root.
- Set secrets in Render dashboard:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `CORS_ORIGIN` (example: `https://erp.yourschool.com`)
- After deploy, verify `GET /api/health` is successful.

### 2) Deploy Web on Vercel
- Import this repo in Vercel.
- Set Root Directory to `apps/web`.
- Add env var:
   - `VITE_API_BASE_URL=https://<your-render-api-domain>/api`
- `apps/web/vercel.json` is included for SPA route rewrites.

### 3) Connect custom domain
- Map your frontend domain (example: `erp.yourschool.com`) to Vercel.
- Keep API on Render domain or attach an API subdomain.
- Update Render `CORS_ORIGIN` with your final frontend domain.

### 4) Production login mode
- Current mode is single-school login (`loginId + password`).
- Multi-school school-code/subdomain mode can be added later without changing tenant-scoped modules.

## Project Layout
- `apps/api` Backend API
- `apps/web` Frontend web app
- `packages/db` Prisma schema + seed
- `docs` Project docs and plan
- `scripts` Bootstrap script

## Important Notes
- Current login endpoint is scaffolded and should be replaced with real password verification.
- Add role middleware before exposing admin/finance routes.
- Add automated tests before production release.
