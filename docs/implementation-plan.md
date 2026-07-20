# Safe Nest implementation plan

## Audit baseline — 18 July 2026

The repository initially contained only three bundled HTML design prototypes in `Source/`:

- `Safe Nest Website.html`
- `Safe Nest Website (1).html`
- `Safe Nest CRM.html`

There was no `package.json`, application framework, route tree, `AGENTS.md`, database, migration, authentication, storage, email provider, test runner, environment template, or deployment configuration. The HTML files use a design-tool bundler loader and embedded resource manifest; those assets are reference material only and are not suitable as the production runtime.

The supplied public screens establish a calm editorial housing-and-support identity: warm off-white surfaces, dark ink text, muted ochre accents, Cormorant Garamond/Lora-style serif typography, fine dividers, restrained rounded corners, compact outlined controls, large whitespace, and neighbourhood-only accommodation locations. The CRM reference is intentionally separate: a high-density work application with side navigation, top bar, dashboard metrics, data tables, statuses, resident profiles, referrals, and occupancy operations.

The brief's navy/teal tokens are adopted as the application system tokens for Safe Nest. The public layout preserves the reference's editorial rhythm while using the safer navy/teal palette consistently across public and CRM surfaces.

## Implementation sequence

1. **Foundation** — Next.js App Router, TypeScript, Prisma/PostgreSQL schema, Zod validation, server actions/API routes, tokenized CSS, separate public/auth/CRM layouts, security headers, health check, and environment validation.
2. **Public website** — home, about, services, properties, news, contact, policy pages, responsive navigation, accessible forms, confidentiality-safe property rendering, and dynamic content seeded from the database.
3. **Referral workflow** — server validation, honeypot/rate-limit hooks, human-readable reference numbers, transaction-safe persistence, audit logging, confirmation screen, and provider-independent email adapters.
4. **Authentication and access** — staff login, session cookies, password hashing, reset-token model, configurable roles/permissions, service/property scoping, restricted-record checks, and audit events.
5. **CRM operations** — dashboard, referral pipeline, clients, placements, properties/rooms/occupancy, support plans, case notes, incidents, tasks, rota, billing, documents, reports, content administration, and permission-aware search.
6. **Hardening** — private document storage abstraction, signed download integration point, upload validation, CSP/security headers, retention controls, export audit events, rate limiting abstraction, and security/privacy/operations documentation.
7. **Verification** — unit/integration tests for domain rules, Playwright flows for public referral and CRM transitions, lint/typecheck/build, migration and seed verification, and route-level manual checks.

## Architecture decisions

- Server-rendered Next.js App Router application; no static export.
- Prisma as the relational data access layer, targeting PostgreSQL in production. Local development can use SQLite through the same Prisma model where supported, but production deployment requires PostgreSQL.
- Cookie-backed server sessions. No authentication tokens in localStorage or sessionStorage.
- Zod schemas shared between server actions and form clients where safe.
- Structured editable content entities rather than a generic page builder.
- Public property queries select only public-safe fields. Confidential addresses, room identifiers, resident identities, and operational notes are never serialized into public responses.
- Object storage is private by default. Protected files are served through short-lived authorized links after permission checks.
- Email delivery is provider-independent and records delivery metadata without unnecessary sensitive bodies.
- Audit events are append-only application records with redacted before/after metadata.

## Delivery boundaries

The first implementation includes complete, usable public flows and the core CRM workflows with fictional seed data. Provider credentials, production database, object storage, malware scanner, SMTP/transactional email service, Sentry, and Hostinger infrastructure remain environment/deployment concerns and are represented through adapters and documented variables.

Organisational approval is still required for lawful bases, safeguarding policy, retention periods, DPIA conclusions, data-sharing arrangements, and operational incident procedures. Software alone does not make the organisation UK GDPR compliant.
