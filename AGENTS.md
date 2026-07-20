# Safe Nest engineering notes

## Commands

- `npm run dev` starts the development server.
- `npm run lint` checks ESLint rules.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run test` runs domain and validation tests.
- `npm run db:migrate` creates the local Prisma database.
- `npm run db:seed` inserts fictional development data; it must never run automatically in production.
- `npm run bootstrap:admin -- --email=... --name=...` creates the real RBAC scaffolding and exactly one real administrator for production, without any fictional data. See `scripts/bootstrap-admin.ts`.
- `npm run build` creates the server-rendered production build.
- `npm run test:e2e` runs the Playwright suite (public flow + full staff login/MFA/CRM workflows); it starts its own dev server against the local dev database.

## Safety boundaries

- Never place protected documents in `public/`.
- Never return confidential refuge addresses, room numbers, resident identities, case-note text, or safeguarding narratives in public pages, metadata, search previews, email subjects, or ordinary exports.
- Use `audit()` for security-sensitive mutations and restricted record views.
- Keep status changes inside domain transition functions.
- Money is stored as integer minor units.
- Finalised case notes are append-only; corrections are addenda or new versions.
- Use fictional data only in seed files and tests.

## Design system

Public pages are editorial and calm, with a warm off-white surface, dark navy text, serif display typography, fine dividers, compact controls, and generous whitespace. CRM pages use the same token palette but a separate dense shell with operational navigation, metric cards, status badges, tables, and responsive cards.
