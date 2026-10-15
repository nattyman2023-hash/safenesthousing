# Hostinger deployment

This application is server-rendered and must not be deployed as a static export. Use a Hostinger plan
that can run a persistent Node 20 process (VPS or a supported Node application environment). If the
selected plan cannot run a persistent Node server, use the Docker/VPS path or choose another plan.

## Deploy from Git (hPanel Node.js app)

Configure the Node.js app so Git pulls are followed by a build and process restart:

1. Node 20.11+; application root is the repository containing `package.json`.
2. Startup command: `npm run start` (Next reads Hostinger's assigned `PORT`).
3. Build command: `bash scripts/hostinger-build.sh`. It runs `npm ci`, Prisma generation, the production configuration check, `npm run db:migrate:deploy`, removes the previous `.next` build output, and runs `npm run build`.
4. Import `.env.production.example` or add variables manually. Set strong secrets, HTTPS `APP_URL`, a persistent absolute `DATABASE_URL` outside `public_html`, private storage outside `public_html`, and the required email, malware, and rate-limit providers.
5. Create the database and private-storage directories outside the public web root and confirm they survive redeploys.
6. **Fresh installations only:** create the first organisation and administrator with
   `npm run bootstrap:admin -- --name="Full Name"`. This command is used only when creating the first
   organisation/administrator for a completely new SafeNest installation. **DO NOT run it when
   upgrading an existing populated installation** — existing organisations, administrator accounts and
   authentication records must be preserved. Never run `npm run db:seed` in production.
7. Point the domain at the Node app, enable HTTPS, and redirect HTTP to HTTPS.
8. Verify `GET /health`, staff login, CRM pages/APIs, referral persistence, email, uploads, audit
   logging, tenant isolation, and public confidentiality behaviour.
9. Compare production row counts against the preflight baseline for the protected records (clients,
   placements, documents, incidents, case notes, support plans, referrals, users) and for tasks.
   Record the real production task count before the deploy and confirm that the same pre-existing tasks
   are still present afterwards. A task created by a post-deploy smoke test is new data and is accounted
   for separately from the migrated rows — never expect or hardcode a fixed number.

The storage adapter uses explicit Turbopack ignore annotations around dynamic private filesystem paths.
This keeps the private persistent storage path out of Next's NFT tracing while retaining traversal,
public-root, MIME, signature, size, and integrity protections. S3-compatible storage is available for
multi-instance deployments.

## Upgrading an existing populated installation

An upgrade of a live SafeNest installation is **not** a first install. Over an existing database the
release only applies new migrations and rebuilds the application; it must never recreate an
organisation, an administrator, or authentication records.

**FRESH INSTALLATIONS ONLY:** `npm run bootstrap:admin` is used only when creating the first
organisation/administrator for a completely new SafeNest installation.

**DO NOT run this command when upgrading an existing populated SafeNest installation.** Existing
organisations, administrator accounts and authentication records must be preserved. `bootstrap-admin.ts`
is designed to run once per environment: re-running it attempts to ensure organisation scaffolding and
creates another administrator with a password-reset invite, which is never wanted during an ordinary
upgrade.

Production upgrades must never run `db:seed`. `prisma/seed.ts` inserts fictional development data and
refuses to run when `NODE_ENV=production`.

Use this order for an upgrade. The migration runs inside `bash scripts/hostinger-build.sh`, so the
verified backup must exist before that build/deploy step begins:

1. Read-only production preflight (`npm run check:production-config`, the current release SHA, current
   row counts, and the effective `DATABASE_URL` and `PRIVATE_STORAGE_PATH`).
2. Freeze application writes (stop the Node process).
3. Create and verify a production database backup, including any `.db-wal`, `.db-shm`, and
   `.db-journal` sidecars.
4. Create and verify a private-storage backup of `PRIVATE_STORAGE_PATH`.
5. Verify local Git state (clean working tree at the reviewed release commit).
6. Push the release commit and confirm the GitHub SHA.
7. Confirm Hostinger has pulled that exact SHA.
8. Run `bash scripts/hostinger-build.sh`: `npm ci`, `npx prisma generate`,
   `npm run check:production-config`, `npm run db:migrate:deploy`, `rm -rf .next`, `npm run build`.
9. Restart/start the Node application.
10. Check `GET /health`.
11. Sign in with an existing staff account.
12. Run the smoke tests, including creating and completing a task.
13. Compare production row counts with the preflight baseline.
14. Retain the database and private-storage backups until the organisation accepts the release.

For an existing populated installation:

| Action | Allowed during an upgrade |
|---|---|
| `npm run bootstrap:admin` | **NO** — fresh installations only |
| `npm run db:seed` | **NO** |
| `npx prisma migrate reset` | **NO** |
| `npx prisma db push --force-reset` | **NO** |
| Copying `prisma/dev.db` to production | **NO** |
| Changing `DATABASE_URL` | **NO** — it must keep pointing at the existing production database |
| Changing `PRIVATE_STORAGE_PATH` | **NO** — it must keep pointing at the existing production storage |
| Force-pushing the release branch | **NO** |

Never re-import `.env.production.example` over a live `.env`: its paths are placeholders, and
`scripts/migrate-local.mjs` creates and verifies a full schema when the configured database file does
not exist, so a placeholder path would start the application against a new, empty database.

## RSC and proxy verification

The app is an App Router server-rendered application, not a static export. Staff authentication routes
are explicitly dynamic and must not be shared-cacheable. A normal request to `GET /staff/login` must
return an HTML content type and an HTML document. An explicit browser-router
request with `RSC: 1` and an `_rsc` query value may correctly return a React Server Component payload
with an `text/x-component` content type. That payload must never be served as the normal page.

If a production browser displays raw Flight/RSC text, inspect the Hostinger proxy or cache layer before
changing application rendering: preserve the request's RSC-related headers and query string, respect
Next's response `Vary` behaviour, and do not cache HTML and RSC responses under one shared key. Purge
the affected proxy cache and restart the Node process after correcting the routing/cache rule. Verify
both normal and explicit RSC requests again with headers and the first bytes of the response body.

## Release sequence

1. Provision Node 20.11+ and a persistent application directory.
2. Clone the release and run `npm ci`.
3. Load the protected production environment and run `npm run db:migrate:deploy`.
4. Run `npm run build`, then start under the Hostinger process manager or systemd. When the hPanel
   post-deploy command is `bash scripts/hostinger-build.sh`, steps 3 and 4 run automatically in that
   order — migration first, then the build. Keep that order: never build the bundle before migrating.
5. Run `npm run check:production-config` with the production environment loaded.
6. Configure a protected external cron for `POST /api/internal/retention-review` with its bearer secret.
   Start with dry-run summaries; deletion or anonymisation is not implemented.
7. Configure log rotation and alerting. Do not log request bodies or sensitive notes.

The current migration target is SQLite and is suitable for a protected single-instance VPS deployment.
For larger concurrent deployments, change the Prisma provider and generate/review a PostgreSQL
migration before release; never apply SQLite SQL to PostgreSQL.

## Rollback

Keep the previous release and a verified backup. Stop the process, point the process manager back to
the previous release, and restore the database only if the migration is not backward-compatible.
Re-run health, login, referral, email, storage, and audit checks after rollback.
