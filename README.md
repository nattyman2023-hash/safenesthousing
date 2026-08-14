# Safe Nest Housing & Support

Server-rendered Safe Nest public website and secure staff CRM. The project uses Next.js App Router,
TypeScript, Prisma, SQLite for local development, cookie-backed sessions, Zod validation, and
provider-independent email and storage seams.

## Local development

Requirements: Node 20.11+ and npm.

```bash
copy .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. The seeded development staff account is
`admin@safenesthousing.co.uk` with password `ChangeMe!123`. Change or remove it before any shared
environment. Seed data is fictional and the seed script must not run automatically in production.

## Useful checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Project shape

- `src/app/(public)` - public website and policy routes.
- `src/app/staff` - staff authentication routes.
- `src/app/crm` - separate CRM shell and operational routes.
- `src/app/api` - server-backed forms and protected mutations.
- `src/components` - reusable public and CRM UI.
- `src/lib` - Prisma client, validation, domain rules, auth, audit, email, and data projections.
- `prisma/schema.prisma` - relational domain schema.
- `prisma/seed.ts` - idempotent fictional development data (never run in production).
- `prisma/rbac-definitions.ts` - compatibility metadata used by seed/bootstrap tooling; it is not a runtime access gate.
- `scripts/bootstrap-admin.ts` - creates the real bootstrap records and exactly one real administrator for production.
- `docs/` - architecture, data model, security, privacy, testing, deployment, and operations guidance.

## Access model

The application uses one predictable authentication state: **authenticated means complete access** to
every CRM module and API. Login (bcrypt password verification plus a hashed httpOnly session cookie)
is the only access boundary. Legacy membership, role, permission, and MFA columns/tables remain only
so existing databases can migrate safely; the active session and CRM code do not depend on them.

Run it with `npm run dev`, or use `npm run build && npm run start` for the production server. Sign in
at `/staff/login` using the local seeded account. Tenant organisation filters, input validation,
password hashing, safe private file paths, audit logging, append-only case notes, integer money
values, and public confidentiality projections remain active.

Before real resident data, complete the security and operations hardening review in
[docs/go-live-runbook.md](docs/go-live-runbook.md), including strong secrets, HTTPS/domain,
persistent storage, backups, email, malware scanning, and any future access-control redesign.

## Production boundary

The current migration target is persistent SQLite for a single-instance VPS deployment. If scale or
concurrency requires PostgreSQL, change the Prisma provider and generate a PostgreSQL migration before
deployment; do not point SQLite SQL at PostgreSQL. Private object storage, email, rate limiting,
malware scanning, secrets, HTTPS, backups, and organisational policy approvals are required before
launch.

See [docs/deployment-hostinger.md](docs/deployment-hostinger.md) for the Hostinger deployment path.
