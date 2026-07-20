# Hostinger deployment

This application is server-rendered and must not be deployed as a static export. Use a Hostinger plan that can run a persistent Node 20 process (VPS or a supported Node application environment). If the selected plan cannot run a persistent Node server, use the Docker/VPS path or choose another plan; do not silently produce a static build.

## Release steps

1. Provision Node 20.11+ and a persistent application directory.
2. Clone the release and run `npm ci`.
3. Create production environment variables from `.env.example`; set a strong `AUTH_SECRET`, `FILE_SIGNING_SECRET`, `RETENTION_REVIEW_SECRET`, `APP_URL`, database URL, email settings, and an authenticated malware scanner (`MALWARE_SCAN_PROVIDER=http`, `MALWARE_SCAN_URL`, `MALWARE_SCAN_TOKEN`). For one instance, `STORAGE_PROVIDER=local` requires a persistent `PRIVATE_STORAGE_PATH` outside the public web root. For S3-compatible storage, set `STORAGE_PROVIDER=s3`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, and the endpoint/path-style options required by the provider. For more than one application instance, use the token-authenticated HTTP rate-limit adapter (`RATE_LIMIT_PROVIDER=http`, `RATE_LIMIT_URL`, `RATE_LIMIT_TOKEN`). Never paste secrets into source or public logs.
4. Create a persistent production database. The repository's current migration targets SQLite, so a single-instance VPS deployment can use a protected persistent SQLite file. For concurrent staff use at larger scale, change `datasource db.provider` to `postgresql`, configure a PostgreSQL URL, generate and review a PostgreSQL migration, then deploy that release; never apply the SQLite SQL to PostgreSQL. Apply the matching migrations with `npm run db:migrate:deploy`.
5. Do not run `npm run db:seed` in production — it also inserts fictional demo clients, referrals, and incidents. Instead run `npm run bootstrap:admin -- --email=admin@yourdomain.org --name="Full Name"` (see `scripts/bootstrap-admin.ts`), which creates only the structural RBAC scaffolding plus one real administrator with an unusable temporary password and a one-time, 30-minute password-setup link — the same pattern the CRM's own "Invite user" flow uses. Deliver the printed link to the administrator through a private channel; it is never logged anywhere else.
6. Build with `npm run build` and start with `npm run start` under a process manager such as systemd or the Hostinger process manager.
7. Point the domain/reverse proxy to the Node port, enable HTTPS, and redirect HTTP to HTTPS.
8. Confirm the private object-storage bucket is persistent, non-public, encrypted where available, and accessible only through the app's signing credentials.
9. Check `GET /health`, then test staff login, referral persistence, confirmation email, and restricted-record behaviour.
10. Run `npm run check:production-config` with the production environment loaded. It checks HTTPS `APP_URL`, database configuration, non-placeholder signing secrets, SMTP readiness, and the configured rate-limit provider without printing values.
11. Configure a protected external cron task to `POST /api/internal/retention-review` with `Authorization: Bearer $RETENTION_REVIEW_SECRET`. Start with dry-run summaries, review them with the organisation's data-protection lead, and do not add deletion or anonymisation until a separately approved policy and implementation exist.
12. Configure log rotation and alerting. Do not log request bodies or sensitive notes.

## Rollback

Keep the previous application release and migration compatibility in place. Stop the process, point the process manager back to the previous release, and restore the database only if the migration is not backward-compatible and a verified backup exists. Re-run `/health`, login, referral submission, email delivery, and audit checks after rollback. Document the incident and follow `docs/incident-response.md`.
