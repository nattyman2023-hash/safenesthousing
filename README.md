# Safe Nest Housing & Support

Server-rendered Safe Nest public website and secure staff CRM. The project is built with Next.js App Router, TypeScript, Prisma, SQLite for local development, cookie-backed sessions, Zod validation, and provider-independent email/storage seams.

## Local development

Requirements: Node 20.11+ and npm.

```bash
copy .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. The seeded development staff account is `admin@safenest.test` with password `ChangeMe!123`. Change or remove this account before any shared environment. Seed data is fictional and the seed script must not run automatically in production.

## Useful checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Project shape

- `src/app/(public)` — public website and policy routes.
- `src/app/staff` — staff authentication routes.
- `src/app/crm` — separate CRM shell and operational routes.
- `src/app/api` — server-backed forms and protected mutations.
- `src/components` — reusable public and CRM UI.
- `src/lib` — Prisma client, validation, domain rules, auth, audit, email, and data projections.
- `prisma/schema.prisma` — relational domain schema.
- `prisma/seed.ts` — idempotent fictional development data (never run in production).
- `prisma/rbac-definitions.ts` — shared, production-safe RBAC scaffolding used by both the seed script and the admin bootstrap script.
- `scripts/bootstrap-admin.ts` — creates the real RBAC scaffolding and exactly one real administrator for production (`npm run bootstrap:admin`).
- `docs/` — architecture, data model, security, privacy, testing, deployment, and operations guidance.

## Important production boundary

Local development and the current generated migration target a persistent SQLite database so the full workflow can run without a hosted database. A single-instance VPS deployment can use a protected persistent SQLite file with tested backup/restore. If the organisation needs PostgreSQL for scale or high concurrency, change the Prisma provider and generate a new PostgreSQL migration before deployment; do not point the SQLite migration at PostgreSQL. Private object storage, SMTP/transactional email, rate limiting, malware scanning, secrets, HTTPS, and organisational policy approvals are required before launch.

Software alone does not make Safe Nest UK GDPR compliant. Lawful bases, retention periods, safeguarding policy, DPIA conclusions, access governance, and data-sharing arrangements need approval by the organisation's responsible legal, safeguarding, and data-protection personnel.

See [docs/deployment-hostinger.md](docs/deployment-hostinger.md) for the server deployment path.
