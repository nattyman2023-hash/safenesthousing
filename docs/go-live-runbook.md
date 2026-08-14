# Safe Nest - go-live runbook

## Current access model

The application uses one authentication state: **authenticated means complete, unrestricted access**
to every CRM module and API. Login (bcrypt password verification plus a hashed httpOnly session cookie)
is the only access boundary. Legacy membership, role, permission, and MFA schema objects remain only
for database compatibility and are not consulted by the active request path.

Run locally:

```bash
npm install && npm run db:migrate && npm run db:seed && npm run dev
# or the production build:
npm install && npm run db:migrate && npm run build && npm run start
```

Sign in at `/staff/login` with the local seeded account. There is no second-factor challenge or
permission/role gate on CRM pages or APIs. Local and production use the same application code path.

## Production hardening before real data

Complete these steps before entering real resident or safeguarding information:

1. Set strong `AUTH_SECRET`, `FILE_SIGNING_SECRET`, and `RETENTION_REVIEW_SECRET` values.
2. Use a persistent production database and apply migrations with `npm run db:migrate:deploy`.
   Never run `npm run db:seed` in production; create the first administrator with
   `npm run bootstrap:admin`.
3. Set `APP_URL` to the HTTPS origin and terminate TLS at the domain or proxy.
4. Configure private persistent storage outside the public web root, or S3-compatible storage.
5. Configure Emailit or SMTP for referral confirmations and password resets.
6. Configure authenticated malware scanning for document uploads.
7. Schedule database and storage backups and test a restore.
8. Use the HTTP rate-limit provider when running more than one application instance.
9. Run `npm run check:production-config` and verify health, login, referrals, email, uploads,
   audit logging, tenant isolation, and public confidentiality behaviour.
10. Obtain the organisation's security, safeguarding, and data-protection sign-off. Any future
    access-control redesign must be approved and tested before real data is handled.

See [deployment-hostinger.md](deployment-hostinger.md) and
[deployment-credentials-checklist.md](deployment-credentials-checklist.md).

## Rollback

Keep the previous release and a verified backup. Stop the process, point the process manager back to
the previous release, restore the database only if the migration is not backward-compatible, then
re-run health, login, referral, email, storage, and audit checks. Follow [incident-response.md](incident-response.md).
