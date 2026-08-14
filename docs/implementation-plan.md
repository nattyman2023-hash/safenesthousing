# Safe Nest implementation plan

## Audit baseline

The initial repository contained only bundled HTML design prototypes. The application now has a
Next.js App Router runtime, TypeScript, Prisma schema/migrations, authentication, storage/email seams,
tests, environment templates, and Hostinger deployment guidance. The prototypes remain reference
material in `docs/design-archive/`.

## Implementation sequence

1. Foundation - Next.js App Router, TypeScript, Prisma, Zod, server API routes, design tokens, separate layouts, security headers, health check, and environment validation.
2. Public website - editorial pages, services, properties, news, contact, policy routes, responsive navigation, accessible forms, and confidentiality-safe projections.
3. Referral workflow - server validation, rate-limit hooks, reference numbers, transaction-safe persistence, audit logging, confirmation screen, and provider-independent email.
4. Authentication - staff login, hashed session cookies, password hashing, reset-token model, tenant session checks, and audit events.
5. CRM operations - dashboard, referrals, clients, placements, properties/rooms/occupancy, support plans, case notes, incidents, tasks, rota, billing, documents, reports, content administration, and authenticated search.
6. Hardening - private document storage, upload validation, CSP/security headers, retention controls, export audits, rate limiting, and security/privacy/operations documentation.
7. Verification - domain/security tests, Playwright flows, lint/typecheck/build, migration verification, production smoke checks, and route-level manual checks.

## Architecture decisions

- Server-rendered Next.js App Router application; no static export.
- Prisma is the relational data layer. SQLite is the current migration target for local and protected single-instance VPS use; PostgreSQL requires a provider change and new migration.
- Cookie-backed server sessions. No authentication tokens in localStorage or sessionStorage.
- Zod schemas validate server input and explicit field maps reduce mass-assignment risk.
- Public property queries select only public-safe fields. Confidential addresses, room identifiers, resident identities, operational notes, and document keys never enter public responses.
- Object storage is private by default. Protected files are served only through authenticated, tenant-scoped routes.
- Email delivery is provider-independent and records delivery metadata without unnecessary sensitive bodies.
- Audit events are append-only with redacted before/after metadata.
- Authenticated is the only active CRM access state. Legacy role, permission, scope, restricted-assignment, and MFA schema records remain solely for database compatibility.

## Delivery boundaries

Fictional seed data supports local development and tests only. Production credentials, persistent
storage, malware scanning, email, rate limiting, backups, HTTPS, and organisational approval remain
deployment concerns. Software alone does not make the organisation UK GDPR compliant.
