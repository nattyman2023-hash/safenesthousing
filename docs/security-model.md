# Security model

- Passwords are bcrypt hashes; raw passwords are never logged or stored.
- Sessions use random tokens stored as SHA-256 hashes in the database and presented through httpOnly,
  same-site cookies. Sessions expire and can be revoked server-side.
- Login, password reset, referral, and contact boundaries are rate-limited by client address or
  account. The local adapter is bounded and suitable for one application instance; use a shared
  provider before horizontal scaling.
- Zod validates public input on the server. Database writes use Prisma parameterisation and explicit
  field maps to reduce mass-assignment risk.
- Security headers include no-sniff, frame denial, referrer policy, permissions policy, cross-origin
  isolation, transport security on HTTPS production deployments, and a baseline CSP.
- Protected documents stay outside `public/` and require an authenticated download route. Upload
  handling enforces extension/MIME/size/signature checks, records a SHA-256 integrity hash, and passes
  files through the configured malware scanner before release.
- Authenticated sessions are the sole CRM access boundary in the current build. Legacy membership,
  role, permission, and MFA schema objects remain for database compatibility and are not consulted by
  the runtime access path. Organisation tenant filters, validation, audit, and public confidentiality
  projections remain active.
- Audit records do not store passwords, tokens, full document bodies, full case notes, or unnecessary
  safeguarding narratives.
- Organisation provider credentials entered in the CRM are encrypted at rest with an `AUTH_SECRET`-
  derived AES-GCM key and are never returned or written to audit metadata in plaintext.
- Governance mutations require an authenticated organisation session. Retention rules require an
  approved policy reference, data-subject request closure requires a resolution note, and legal holds
  must be released in a separate audited step before closure.
- The scheduled retention endpoint requires a strong bearer secret, compares it in constant time,
  persists only aggregate dry-run summaries, and never deletes or anonymises records.
- Production secrets must be supplied through environment variables, rotated, and excluded from logs
  and source control.
- `GET /health` checks database connectivity and reports configuration readiness without returning
  secret values. Run `npm run check:production-config` against the deployment environment before release.

This is engineering guidance, not a claim of UK GDPR compliance. The organisation must approve lawful
bases, retention, DPIA findings, safeguarding procedures, incident response, and data governance.
