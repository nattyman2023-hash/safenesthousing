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

Open `http://localhost:3000`. The seeded development staff account is `admin@safenesthousing.co.uk` with password `ChangeMe!123`. Change or remove this account before any shared environment. Seed data is fictional and the seed script must not run automatically in production.

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

## Production-ready presentation build (Phase 1)

The project is delivered in two phases (see [docs/go-live-runbook.md](docs/go-live-runbook.md)):

- **Phase 1 (current)** is a complete, production-style application that looks and behaves exactly
  like the finished product, using **fictional seed data only**. Real residents, confidential records
  and service-user data are never entered in this phase.
- **Phase 2** activates the remaining security controls (MFA, real secrets, HTTPS/domain, persistent
  database and storage, backups, email and malware integrations, data-protection sign-off) before any
  real data is entered.

To present Phase 1 as a genuine production bundle that still carries the fictional data:

```bash
npm install
npm run db:migrate
npm run db:seed
# Environment for the presentation build (see `.env`):
#   SAFE_NEST_PRESENTATION_MODE=true
#   ENABLE_DEV_AUTH_BYPASS=false
#   MFA_ENABLED=false
npm run build
npm run start
```

Open the site and sign in as `admin@safenesthousing.co.uk` with password `ChangeMe!123`. Real login and
role-based permissions are active (there is **no** sandbox bypass in a production build); MFA is held
off until Phase 2.

`SAFE_NEST_PRESENTATION_MODE=true` is safe for demo/UAT builds: it keeps fictional seed data visible
if the database is momentarily unreachable and lets unconfigured email and malware scanning degrade to
a logged no-op so every form and upload completes end-to-end. It never relaxes authentication, RBAC,
MFA, restricted-record masking, audit, or rate limiting — and it **must never be set in a real go-live
deployment**.
## Important production boundary

Local development and the current generated migration target a persistent SQLite database so the full workflow can run without a hosted database. A single-instance VPS deployment can use a protected persistent SQLite file with tested backup/restore. If the organisation needs PostgreSQL for scale or high concurrency, change the Prisma provider and generate a new PostgreSQL migration before deployment; do not point the SQLite migration at PostgreSQL. Private object storage, SMTP/transactional email, rate limiting, malware scanning, secrets, HTTPS, and organisational policy approvals are required before launch.

Software alone does not make Safe Nest UK GDPR compliant. Lawful bases, retention periods, safeguarding policy, DPIA conclusions, access governance, and data-sharing arrangements need approval by the organisation's responsible legal, safeguarding, and data-protection personnel.

See [docs/deployment-hostinger.md](docs/deployment-hostinger.md) for the server deployment path.
