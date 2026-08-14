# Operations checklist

Before launch:

- [ ] Production Node, database, private-storage, email, malware-scanner, and rate-limit settings are configured through protected environment/secrets.
- [ ] The first administrator is created with `npm run bootstrap:admin`; `npm run db:seed` is never used for production.
- [ ] HTTPS, reverse proxy, process restart, health checks, and log rotation are confirmed.
- [ ] `npm run check:production-config` passes and `/health` returns HTTP 200 after startup.
- [ ] `npm audit --omit=dev` passes with the approved production dependency policy.
- [ ] `RETENTION_REVIEW_SECRET` is strong; the scheduler returns 401 without its bearer token and creates only dry-run summaries with it.
- [ ] A governance reviewer has inspected a dry-run report and confirmed legal holds and open subject requests are excluded.
- [ ] A shared rate-limit provider is configured before adding a second application instance.
- [ ] Database and private-storage backups exist and restore tests are recorded.
- [ ] Referral, contact, password reset, authenticated CRM, audit, document, and email flows are tested.
- [ ] Malware scanner health and failure behaviour are tested; production uploads follow the approved fail-closed policy.
- [ ] Public property pages contain no confidential addresses or resident details.
- [ ] Retention, safeguarding, lawful bases, DPIA, and data-sharing decisions are approved by the organisation.
