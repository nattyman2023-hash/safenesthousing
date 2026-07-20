# Operations checklist

Before launch:

- [ ] Production Node/database/storage/email credentials are set through a secret manager or protected environment.
- [ ] First administrator is created via `npm run bootstrap:admin` (never `npm run db:seed`) and seed credentials are not used.
- [ ] MFA is enabled for privileged users.
- [ ] Each privileged user has stored recovery codes securely; recovery-code regeneration and break-glass access are covered by an approved policy.
- [ ] HTTPS, reverse proxy, process restart, health checks, and log rotation are confirmed.
- [ ] `npm run check:production-config` passes; `/health` returns HTTP 200 after the process is running.
- [ ] `npm audit --omit=dev` passes with zero production vulnerabilities after the Next.js 16 migration.
- [ ] `RETENTION_REVIEW_SECRET` is a strong deployment secret; the external scheduler receives 401 without the bearer token and creates only dry-run review summaries with the token.
- [ ] A governance reviewer has inspected a dry-run report and confirmed legal holds and open data-subject requests are excluded before any future deletion/anonymisation work is approved.
- [ ] A shared rate-limit provider is configured before adding a second application instance; memory limiting is treated as single-instance only.
- [ ] Database and private storage backups exist and restore tests are recorded.
- [ ] Referral, contact, password reset, restricted access, audit, document, and email flows are tested.
- [ ] Malware scanner health and failure behaviour are tested; production document uploads fail closed when the scanner is unavailable.
- [ ] Public property pages contain no confidential addresses or resident details.
- [ ] Retention, safeguarding, lawful bases, DPIA, and data-sharing decisions are approved by the organisation.
