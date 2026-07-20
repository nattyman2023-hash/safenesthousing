# Deployment credentials checklist

A fillable handoff sheet for whoever provisions production infrastructure. Copy this file, fill in the "Source" and "Status" columns as each credential is obtained, and keep the completed copy in the organisation's secret manager — never in git, chat, or email.

Every row here is enforced by `npm run check:production-config` (see `src/lib/env.ts:runtimeConfigChecks`), which reports `OK`/`MISSING` per item without printing values. Run it against the real production environment before going live.

## 1. Core application secrets

Generate these yourself; no external provider needed. Each must be a long random string (32+ characters), unique per environment, and different from any value used in `.env.example` or development.

| Variable | Purpose | How to generate | Status |
|---|---|---|---|
| `AUTH_SECRET` | Signs staff session cookies | `openssl rand -base64 32` | ☐ |
| `FILE_SIGNING_SECRET` | Signs private document download URLs | `openssl rand -base64 32` | ☐ |
| `RETENTION_REVIEW_SECRET` | Bearer token for the external retention-review cron | `openssl rand -base64 32` | ☐ |

## 2. Domain and HTTPS

| Item | Needed from | Notes | Status |
|---|---|---|---|
| Production domain | Organisation / registrar | Sets `APP_URL` (must be `https://...`) | ☐ |
| TLS certificate | Hosting provider / Let's Encrypt via reverse proxy | Required before `Strict-Transport-Security` header activates (see `next.config.mjs`) | ☐ |

## 3. Database

| Item | Needed from | Notes | Status |
|---|---|---|---|
| `DATABASE_URL` | Infra owner | Single-instance VPS: protected persistent SQLite file path. Multi-instance/scale: PostgreSQL connection string — requires switching `prisma/schema.prisma` provider and generating a new migration first (do not apply the SQLite migration to Postgres). | ☐ |
| Backup schedule | Infra owner | Automated backup + a *tested* restore, per `docs/backup-and-restore.md` | ☐ |

## 4. Email (SMTP) — Emailit

Provider: [Emailit](https://emailit.com). Get the exact SMTP host/port and credentials from the Emailit dashboard (Settings → SMTP/API credentials) rather than assuming values here, since providers change these over time.

| Variable | Needed from | Notes | Status |
|---|---|---|---|
| `SMTP_HOST` | Emailit dashboard | Confirm the current SMTP hostname in Emailit's docs/dashboard | ☐ |
| `SMTP_PORT` | Emailit dashboard | Typically 587 (STARTTLS); confirm Emailit's supported ports | ☐ |
| `SMTP_USER` | Emailit dashboard | Often the sending domain or an API key identifier | ☐ |
| `SMTP_PASSWORD` | Emailit dashboard | Emailit API/SMTP key — store as a secret | ☐ |
| `EMAIL_FROM` | Organisation + Emailit | Must be on a domain verified in Emailit with SPF/DKIM/DMARC records published, or deliverability will suffer | ☐ |
| Domain verification | Emailit dashboard | Add the DNS records (SPF, DKIM, and ideally DMARC) Emailit provides for the sending domain before launch | ☐ |
| Sending limits/reputation | Emailit dashboard | Confirm plan limits are sufficient for expected referral/notification volume | ☐ |

## 5. Private object storage

Pick one path.

**Single instance — local filesystem (simplest):**

| Variable | Notes | Status |
|---|---|---|
| `STORAGE_PROVIDER=local` | | ☐ |
| `PRIVATE_STORAGE_PATH` | Must be a persistent path **outside** the public web root and `public/`; confirm it survives redeploys | ☐ |

**Multi-instance or S3-compatible object storage:**

| Variable | Needed from | Status |
|---|---|---|
| `STORAGE_PROVIDER=s3` | | ☐ |
| `STORAGE_REGION` | Storage provider | ☐ |
| `STORAGE_BUCKET` | Storage provider — must be private/non-public | ☐ |
| `STORAGE_ACCESS_KEY` | Storage provider | ☐ |
| `STORAGE_SECRET_KEY` | Storage provider | ☐ |
| `STORAGE_ENDPOINT` | Storage provider (non-AWS S3-compatible services) | ☐ |
| `STORAGE_FORCE_PATH_STYLE` | Storage provider docs (usually `true` for non-AWS endpoints) | ☐ |

Confirm the bucket/filesystem is encrypted where available and reachable only through the app's signing credentials, per `docs/deployment-hostinger.md` step 8.

## 6. Malware scanning

Required in production (`REQUIRE_MALWARE_SCAN` is implied true whenever `NODE_ENV=production`).

| Variable | Needed from | Status |
|---|---|---|
| `MALWARE_SCAN_PROVIDER=http` | | ☐ |
| `MALWARE_SCAN_URL` | Scanner vendor (e.g. hosted ClamAV/ICAP or a SaaS scanning API) | ☐ |
| `MALWARE_SCAN_TOKEN` | Scanner vendor | ☐ |

Confirm fail-closed behaviour: production uploads must be rejected, not silently accepted, when the scanner is unreachable.

## 7. Rate limiting (multi-instance only)

Only required once more than one application instance runs.

| Variable | Needed from | Status |
|---|---|---|
| `RATE_LIMIT_PROVIDER=http` | | ☐ |
| `RATE_LIMIT_URL` | Rate-limit backend (e.g. Redis-backed service) | ☐ |
| `RATE_LIMIT_TOKEN` | Rate-limit backend | ☐ |

## 8. Optional but recommended

| Variable | Purpose | Status |
|---|---|---|
| `SENTRY_DSN` | Error monitoring | ☐ |

## After every item above is filled in

1. Load the real production environment and run `npm run check:production-config`. Every check must print `OK`.
2. Work through `docs/operations-checklist.md` in full — it covers first-admin bootstrap, MFA, HTTPS, health checks, backups, and the retention-review cron, which are process steps, not credentials.
3. Follow `docs/deployment-hostinger.md` for the release sequence.

Never paste filled-in secret values into git, this file's committed version, chat, or an issue tracker. This template should stay blank in version control; only a private copy held by the person provisioning infrastructure should contain real values.
