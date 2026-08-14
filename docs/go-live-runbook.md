# Safe Nest — go-live runbook

## Current access model (assessment build)

The application uses a single authentication state: **authenticated = complete, unrestricted access**
to every CRM module and API. MFA, RBAC permission gates, role checks, service/property scoping,
restricted-record gating, and the previous `MFA_ENABLED` / `DISABLE_MFA_FOR_DEV` /
`ENABLE_DEV_AUTH_BYPASS` / `SAFE_NEST_PRESENTATION_MODE` flags have all been removed from the active
flow. Login (bcrypt password + a hashed httpOnly session cookie) is the only access boundary.

Run locally:

```bash
npm install && npm run db:migrate && npm run db:seed && npm run dev
# or the production build:
npm install && npm run db:migrate && npm run db:seed && npm run build && npm run start
```

Sign in at `/staff/login` as `admin@safenesthousing.co.uk` / `ChangeMe!123`. There is no MFA challenge
and no permission/role gate on any CRM page or API. Local and production use the same code path.

Unconfigured email and malware scanning degrade to logged no-ops, so referral/contact forms and
document uploads always complete. Fictional fallback data keeps the CRM populated when the database
is empty or momentarily unreachable.

## Phase 2 — production hardening (before real data)

Complete these before entering any real resident or safeguarding information. See
[deployment-hostinger.md](deployment-hostinger.md) and
[deployment-credentials-checklist.md](deployment-credentials-checklist.md).

1. **Re-introduce MFA + RBAC as a deliberate redesign** (TOTP, role/permission gates, restricted-record
   masking, service/property scoping) — the assessment build removed them from the active flow.
2. **Secrets** — set strong `AUTH_SECRET`, `FILE_SIGNING_SECRET`, `RETENTION_REVIEW_SECRET` (>=32 random chars each).
3. **Database** — persistent production database; apply migrations with `npm run db:migrate:deploy`.
   Do **not** run `npm run db:seed` in production. Create the first admin with `npm run bootstrap:admin`.
4. **HTTPS / domain** — set `APP_URL` to the https origin; terminate TLS and redirect HTTP to HTTPS.
5. **Storage** — persistent private storage outside the web root (`STORAGE_PROVIDER=local` +
   `PRIVATE_STORAGE_PATH`) or S3-compatible object storage.
6. **Email** — configure Emailit or SMTP so referral confirmations and password resets send.
7. **Malware scanning** — set `MALWARE_SCAN_PROVIDER=http` with an authenticated scanner for uploads.
8. **Backups & recovery** — schedule database and storage backups; test a restore.
9. **Rate limiting** — use the HTTP provider if running more than one instance.
10. **Verify** — run `npm run check:production-config` (must report *ready*), then test login, MFA,
    referral submission, email delivery, and restricted-record behaviour.
11. **Data-protection sign-off** — complete the organisation's final security and data-protection review.

## Rollback

Keep the previous release and a verified backup. Stop the process, point the process manager back to the
previous release, restore the database only if the migration is not backward-compatible, then re-run the
health, login, referral, email and audit checks. Follow [incident-response.md](incident-response.md).