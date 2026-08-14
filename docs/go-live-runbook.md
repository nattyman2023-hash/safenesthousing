# Safe Nest — go-live runbook

The project is delivered in two phases. **Phase 1 (current)** presents the complete, production-style
application using fictional data only. **Phase 2** activates the remaining security controls before any
real resident or safeguarding data is entered.

## Phase 1 — presentation / UAT (fictional data only)

The application is fully functional and looks and behaves like the finished product. No real resident,
confidential, or service-user data is entered at this stage.

- All CRM modules work end-to-end: dashboard, referrals, clients, placements, properties & rooms,
  incidents, tasks, rota, billing, documents, users & roles, governance, audit, reports, settings.
- Fictional seed data populates the system for demonstration (`npm run db:seed`).
- The recommended way to demonstrate is a genuine production bundle run with
  `SAFE_NEST_PRESENTATION_MODE=true` in the environment. In that mode fictional seed data stays visible
  (so a production build never shows empty states) and unconfigured email/malware-scanning degrade to a
  logged no-op, so every form and upload completes end-to-end. The flag NEVER relaxes authentication,
  RBAC, MFA, restricted-record masking, audit, or rate limiting, and must never be set in a real
  go-live deploy.
- The testing bypass (`ENABLE_DEV_AUTH_BYPASS`) is OFF for presentations — staff sign in for real via
  the seeded administrator (`admin@safenesthousing.co.uk` / `ChangeMe!123`), with MFA held off until Phase 2.
  The bypass is only for ad-hoc local exploration and is hard-disabled whenever `NODE_ENV=production`.

### Presenting to stakeholders
1. `npm install && npm run db:migrate && npm run db:seed && npm run build && npm run start` with
   `SAFE_NEST_PRESENTATION_MODE=true` (see `.env`).
2. Open the site, sign in with the seeded admin, and navigate every module.
3. All forms, filters, dashboards and workflows behave exactly as intended for the live system.

## Phase 2 — production hardening (before real data)

Complete these before entering any real resident or safeguarding information. See
[deployment-hostinger.md](deployment-hostinger.md) for the full procedure and
[deployment-credentials-checklist.md](deployment-credentials-checklist.md) for the secrets list.

1. **Disable the testing bypass** — ensure `ENABLE_DEV_AUTH_BYPASS` is unset/false (already off for
   presentations).
2. **Enable MFA** — set `MFA_ENABLED=true`, remove `DISABLE_MFA_FOR_DEV` (if set), and unset
   `SAFE_NEST_PRESENTATION_MODE=true`. Privileged roles then require TOTP.
3. **Secrets** — set strong `AUTH_SECRET`, `FILE_SIGNING_SECRET`, `RETENTION_REVIEW_SECRET` (>=32 random
   chars each).
4. **Database** — persistent production database; apply migrations with `npm run db:migrate:deploy`.
   Do **not** run `npm run db:seed` in production. Create the first admin with `npm run bootstrap:admin`.
5. **HTTPS / domain** — set `APP_URL` to the https origin; terminate TLS and redirect HTTP to HTTPS.
6. **Storage** — persistent private storage outside the web root (`STORAGE_PROVIDER=local` +
   `PRIVATE_STORAGE_PATH`) or S3-compatible object storage.
7. **Email** — configure Emailit or SMTP so referral confirmations and password resets send.
8. **Malware scanning** — set `MALWARE_SCAN_PROVIDER=http` with an authenticated scanner for document
   uploads.
9. **Backups & recovery** — schedule database and storage backups; test a restore.
10. **Rate limiting** — use the HTTP provider if running more than one instance.
11. **Verify** — run `npm run check:production-config` (must report *ready*), then test login, MFA,
    referral submission, email delivery, and restricted-record behaviour.
12. **Data-protection sign-off** — complete the organisation's final security and data-protection
    review.

## Rollback

Keep the previous release and a verified backup. Stop the process, point the process manager back to the
previous release, restore the database only if the migration is not backward-compatible, then re-run the
health, login, referral, email and audit checks. Follow [incident-response.md](incident-response.md).