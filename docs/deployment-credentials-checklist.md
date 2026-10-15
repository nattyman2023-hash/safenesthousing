# Deployment credentials checklist

Keep the completed version in the organisation's secret manager, never in git, chat, or email. Run
`npm run check:production-config` against the real environment; it reports status without printing
secret values.

## Core secrets

Generate unique random values of at least 32 characters:

| Variable | Purpose | Status |
|---|---|---|
| `AUTH_SECRET` | Session and credential encryption material | [ ] |
| `FILE_SIGNING_SECRET` | Private document integrity/signing material | [ ] |
| `RETENTION_REVIEW_SECRET` | Bearer token for the retention-review scheduler | [ ] |

## Domain and database

| Item | Requirement | Status |
|---|---|---|
| `APP_URL` | HTTPS production origin | [ ] |
| `DATABASE_URL` | Persistent protected SQLite path or separately migrated PostgreSQL deployment | [ ] |
| Backups | Automated backup and tested restore | [ ] |

## Email

Choose Emailit or SMTP and configure the provider's current credentials, verified sending domain,
SPF/DKIM/DMARC records, and delivery limits:

`EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAILIT_API_KEY`, `EMAILIT_API_URL`, or `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, and `SMTP_PASSWORD`.

## Private storage

For one instance, set `STORAGE_PROVIDER=local` and a persistent `PRIVATE_STORAGE_PATH` outside the
public web root. For multiple instances, use private S3-compatible storage with `STORAGE_REGION`,
`STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, and any endpoint/path-style settings.

## Malware scanning and rate limiting

Configure `MALWARE_SCAN_PROVIDER=http`, `MALWARE_SCAN_URL`, and `MALWARE_SCAN_TOKEN` before accepting
real documents if the deployment policy requires scanning. Use `RATE_LIMIT_PROVIDER=http` with its URL
and token when running more than one application instance.

## Release checks

1. Run `npm run check:production-config`; every required check must be OK.
2. Apply migrations with `npm run db:migrate:deploy`; never run `npm run db:seed` in production, and
   never during an upgrade of an existing installation.
3. **Fresh installations only:** create the first administrator with `npm run bootstrap:admin`. It is
   used only when creating the first organisation/administrator for a completely new SafeNest
   installation. **DO NOT run it when upgrading an existing populated installation** — existing
   organisations, administrator accounts and authentication records must be preserved.
4. Follow `docs/deployment-hostinger.md`, then verify `/health`, login, tenant isolation, uploads,
   email, audit logging, backups, and public confidentiality behaviour.
