# Architecture

Safe Nest is a server-rendered Next.js App Router application with three route surfaces:

- Public website: editorial content, safe property projections, referrals, contact, news, and policy pages.
- Staff authentication: login, password-reset entry point, secure session cookie, and noindex metadata.
- CRM: a separate operational shell with server-side session checks, tables, metric cards, pipeline views, profiles, and governance screens.

Prisma provides the relational data layer. The current provider and migration target SQLite, suitable
for a protected single-instance development or small VPS deployment with tested backups. A PostgreSQL
variant requires changing the provider and generating a PostgreSQL migration before release. API routes
use Zod validation, bounded request throttling, provider-independent email, and append-only audit writes.

Public queries select only safe fields. Full addresses, room labels, resident names, operational notes,
restricted content, and document keys are never serialized into public responses. Private document
uploads are scanned before write, carry a SHA-256 integrity hash, and are read only through authenticated
organisation-scoped routes. Documents use a local private filesystem or S3-compatible object storage;
no public URLs are generated.

Authentication uses random session tokens stored as SHA-256 hashes in `UserSession` and presented only
in an httpOnly, same-site cookie. Passwords use bcrypt. The active access model is one state:
authenticated means complete, unrestricted access to every CRM module and API. Legacy membership, role,
permission, scope, restricted-assignment, and MFA tables remain in the schema for database compatibility
but are not runtime authorization dependencies. Every protected CRM route resolves the current session
server-side; client-side navigation is not the security boundary.
