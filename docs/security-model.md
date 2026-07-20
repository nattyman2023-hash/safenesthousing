# Security model

- Passwords are bcrypt hashes; raw passwords are never logged or stored.
- Sessions use random tokens stored as SHA-256 hashes in the database and presented through httpOnly, same-site cookies. Sessions expire and can be revoked server-side.
- Login, password reset, MFA, referral, and contact boundaries are rate-limited by client address or account. The local adapter is bounded and suitable for one application instance; use a shared provider before horizontal scaling.
- Zod validates public input on the server. Database writes use Prisma parameterisation and explicit field maps to reduce mass assignment risk.
- Security headers include no-sniff, frame denial, referrer policy, permissions policy, cross-origin isolation, transport security on HTTPS production deployments, and a baseline CSP. Review the CSP with any future third-party integrations.
- Protected documents stay outside `public/` and require an authorised download route. Upload handling enforces extension/MIME/size/signature checks, records a SHA-256 integrity hash, and passes files through the configured malware scanner before release; production uploads fail closed when scanning is unavailable.
- Restricted record access is visually marked and should create an audit event. Search and exports must use the same permission-aware projections.
- MFA-required users complete an encrypted-secret TOTP challenge before the session can access the CRM. Privileged roles are forced into the MFA flow and elevated users' active sessions are revoked. Ten one-time recovery codes are generated after enrolment, stored only as hashes, returned once, and individually marked used; password acceptance and MFA completion are separate audit events.
- Audit records do not store passwords, tokens, full document bodies, full case notes, or unnecessary safeguarding narratives.
- Governance changes require the dedicated `governance.manage` permission. Retention rules require an approved policy reference, data-subject request closure requires a resolution note, and legal holds must be released in a separate audited step before closure.
- The scheduled retention endpoint requires a strong bearer secret, compares it in constant time, persists only aggregate dry-run summaries, and never deletes or anonymises records.
- Production secrets must be supplied through environment variables, rotated, and excluded from logs and source control.
- `GET /health` checks database connectivity and reports configuration readiness without returning secret values. Run `npm run check:production-config` against the deployment environment before release.

This is engineering guidance, not a claim of UK GDPR compliance. The organisation must approve lawful bases, retention, DPIA findings, safeguarding procedures, incident response, and access governance.
