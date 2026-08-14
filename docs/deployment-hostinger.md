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
6. For real go-live, use `npm run bootstrap:admin -- --name="Full Name"`; never seed production.
7. Point the domain at the Node app, enable HTTPS, and redirect HTTP to HTTPS.
8. Verify `GET /health`, staff login, CRM pages/APIs, referral persistence, email, uploads, audit
   logging, tenant isolation, and public confidentiality behaviour.

The storage adapter uses explicit Turbopack ignore annotations around dynamic private filesystem paths.
This keeps the private persistent storage path out of Next's NFT tracing while retaining traversal,
public-root, MIME, signature, size, and integrity protections. S3-compatible storage is available for
multi-instance deployments.

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
4. Run `npm run build`, then start under the Hostinger process manager or systemd.
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
