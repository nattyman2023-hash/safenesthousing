# Hostinger deployment

This application is server-rendered and must not be deployed as a static export. Use a Hostinger plan that can run a persistent Node 20 process (VPS or a supported Node application environment). If the selected plan cannot run a persistent Node server, use the Docker/VPS path or choose another plan; do not silently produce a static build.

## Deploy from Git (hPanel Node.js app)

Hostinger's "Deploy from Git" only pulls the repository files — a Next.js app must also be built and run as a persistent Node process. Configure the Node.js app in hPanel as follows, then every Git push will rebuild and restart the live site.

1. **Node.js app (hPanel):** Node 20.11+, app root = the repository (where `package.json` lives).
2. **Startup command:** `npm run start` (Next reads the `PORT` Hostinger assigns).
3. **Post-deploy / build command:** `bash scripts/hostinger-build.sh`. This runs `npm ci && npx prisma generate && npm run build && npm run db:migrate:deploy` after every pull.
4. **Environment variables:** import `.env.production.example` (or add manually). Set strong `AUTH_SECRET`, `FILE_SIGNING_SECRET`, `RETENTION_REVIEW_SECRET`, `APP_URL=https://<domain>`, a persistent absolute `DATABASE_URL` outside `public_html`, `STORAGE_PROVIDER=local` + `PRIVATE_STORAGE_PATH` outside `public_html`, `MFA_ENABLED`, `SAFE_NEST_PRESENTATION_MODE`, and the email/malware/rate-limit providers. Never paste secrets into source.
5. **Persistent storage:** create the `DATABASE_URL` directory and the `PRIVATE_STORAGE_PATH` directory (outside `public_html`) so they survive redeployes.
6. **First deploy:** after the build runs, create the first administrator.
   - Preview (fictional data): `npm run db:seed`.
   - Real go-live: `npm run bootstrap:admin -- --name="Full Name"` — **never** `db:seed` in production.
7. **Domain/HTTPS:** point the domain at the Node app, enable HTTPS, and redirect HTTP to HTTPS.
8. **Verify:** `GET /health` (reports not-ready/503 until production config is complete — see Phase 2), then test staff login, referral submission, and restricted-record behaviour.
9. **Phase 2 (real data):** set `MFA_ENABLED=true`, remove `SAFE_NEST_PRESENTATION_MODE`, configure the real email provider and malware scanner, enable backups, and complete data-protection sign-off before entering any real resident or safeguarding data.

> If the live site shows raw `:HL[...]` text or appears static, the build/post-deploy step or the startup command is not configured — Hostinger is serving files instead of running `next start`.


## Release steps

1. Provision Node 20.11+ and a persistent application directory.
2. Clone the release and run `npm ci`.
3. Create production environment variables from `.env.example`; set a strong `AUTH_SECRET`, `FILE_SIGNING_SECRET`, `RETENTION_REVIEW_SECRET`, `APP_URL`, the email provider and sender, and an authenticated malware scanner (`MALWARE_SCAN_PROVIDER=http`, `MALWARE_SCAN_URL`, `MALWARE_SCAN_TOKEN`). For Emailit, the API key may be supplied as the protected `EMAILIT_API_KEY` deployment secret or entered by an organisation administrator in CRM → Settings after the first administrator can sign in; the CRM value is encrypted at rest. For one instance, `STORAGE_PROVIDER=local` requires a persistent `PRIVATE_STORAGE_PATH` outside the public web root. For S3-compatible storage, set `STORAGE_PROVIDER=s3`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, and the endpoint/path-style options required by the provider. For more than one application instance, use the token-authenticated HTTP rate-limit adapter (`RATE_LIMIT_PROVIDER=http`, `RATE_LIMIT_URL`, `RATE_LIMIT_TOKEN`). Never paste secrets into source or public logs.
4. Create a persistent production database. The repository's current migration targets SQLite, so a single-instance VPS deployment can use a protected persistent SQLite file. For concurrent staff use at larger scale, change `datasource db.provider` to `postgresql`, configure a PostgreSQL URL, generate and review a PostgreSQL migration, then deploy that release; never apply the SQLite SQL to PostgreSQL. Apply the matching migrations with `npm run db:migrate:deploy`.
5. Do not run `npm run db:seed` in production — it also inserts fictional demo clients, referrals, and incidents. Instead run `npm run bootstrap:admin -- --name="Full Name"` (see `scripts/bootstrap-admin.ts`), which creates the first administrator as `admin@safenesthousing.co.uk` by default, with an unusable temporary password and a one-time, 30-minute password-setup link — the same pattern the CRM's own "Invite user" flow uses. Deliver the printed link to the administrator through a private channel; it is never logged anywhere else. If an existing first administrator needs the address corrected, run `npm run rename:admin-email -- --from=old-address@example.org` once against the production database; the command refuses non-administrator accounts and address collisions. To set a temporary password without storing it in GitHub or shell history, set `ADMIN_PASSWORD` only in the terminal session and run `npm run set:admin-password -- --email=admin@safenesthousing.co.uk`, then unset the variable; this revokes existing sessions and records an audit event.
6. Build with `npm run build` and start with `npm run start` under a process manager such as systemd or the Hostinger process manager.
7. Point the domain/reverse proxy to the Node port, enable HTTPS, and redirect HTTP to HTTPS.
8. Confirm the private object-storage bucket is persistent, non-public, encrypted where available, and accessible only through the app's signing credentials.
9. Check `GET /health`, then test staff login, referral persistence, confirmation email, and restricted-record behaviour.
10. Run `npm run check:production-config` with the production environment loaded. It checks HTTPS `APP_URL`, database configuration, non-placeholder signing secrets, SMTP readiness, and the configured rate-limit provider without printing values.
11. Configure a protected external cron task to `POST /api/internal/retention-review` with `Authorization: Bearer $RETENTION_REVIEW_SECRET`. Start with dry-run summaries, review them with the organisation's data-protection lead, and do not add deletion or anonymisation until a separately approved policy and implementation exist.
12. Configure log rotation and alerting. Do not log request bodies or sensitive notes.

## Rollback

Keep the previous application release and migration compatibility in place. Stop the process, point the process manager back to the previous release, and restore the database only if the migration is not backward-compatible and a verified backup exists. Re-run `/health`, login, referral submission, email delivery, and audit checks after rollback. Document the incident and follow `docs/incident-response.md`.
