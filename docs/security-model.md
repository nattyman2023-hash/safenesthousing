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
  projections remain active. Document access follows the policy in "Document access policy" below.
- Client forms are server-rendered with their submit control disabled until React hydrates (shared
  `useHydrated` hook), and sensitive or operational forms also carry `method="post"`. See "Form
  hydration safety" below.
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

## Document access policy

> In the current SafeNest operational build, all authenticated staff within the organisation can view
> and download all CRM documents, including documents carrying restricted/sensitive metadata. The
> metadata remains for reporting and future access-control development but does not currently restrict
> document access. Anonymous access and cross-organisation access remain blocked.

This is intentional for the current operational build and may be replaced with granular document
permissions later. Until then there is no document-level permission to grant or revoke:

- The uploader never affects access: a file filed by a colleague is visible and downloadable to every
  signed-in staff member in the organisation.
- Staff assignment never affects access: key worker, support worker, incident lead and complaint owner
  assignments do not gate a document.
- Role and permission labels never affect access: no role, scope or document permission is consulted,
  and the legacy membership, role and permission tables are not used as a runtime gate.
- The `restricted` flag never blocks a read or a download. It stays on the record for reporting and
  future access-control work and is shown as a badge; the service-user timeline withholds only the
  optional description text of a restricted document, never the file itself.
- Anonymous requests are rejected: every CRM document read and the download route require a valid
  session, and an unauthenticated request receives 401 without document metadata.
- Other organisations remain blocked: document registers, profiles, search and downloads are filtered by
  the session's organisation, and a document id belonging to another organisation returns 404 rather
  than the file.
- Filesystem and delivery protections remain active: files are stored under the private storage root
  outside `public/`, storage keys are validated before use so a crafted key cannot traverse the
  filesystem, the recorded SHA-256 is verified when the file is served, and responses send safe
  filename, content-type and no-sniff headers. Private storage is not web-reachable.

Record-level narrative redactions (`Client.restricted`, `Incident.restricted`, restricted case notes and
masked restricted relationship counterpart names) are a separate mechanism and are unchanged. They
withhold narrative text in case-record and timeline views only, and must never filter a document list, a
document row or a download.

## Form hydration safety

Server-rendered client forms are only interactive once React has hydrated them. Before that the browser
owns the form, so a click or Enter press submits it natively with the form's default method — for a plain
form that is `GET`, which appends every field value to the URL and therefore to the address bar, browser
history, reverse-proxy logs and monitoring systems. On a sign-in form that is the password; on a
case-note, contact, incident or handover form it is the narrative text.

The shared `useHydrated()` hook (`src/lib/use-hydrated.ts`) uses `useSyncExternalStore` with a server
snapshot of `false` and a client snapshot of `true`. Its first `true` render is exactly the moment React
owns the tree, so hydration is reported without a `setState` in an effect (which the project's React
Compiler lint rules reject, and which would leave a second frame of vulnerability).

Every operational client form therefore:

- keeps its submit control `disabled={!hydrated || …}` until hydration, so the pre-hydration DOM cannot
  submit at all — the server-rendered HTML ships with the button already disabled;
- carries `method="post"` as defence in depth, so even a control enabled by other scripting can only
  POST and never append values to a query string;
- still calls `preventDefault()` in its own `onSubmit`, so a hydrated form is handled by React and never
  navigates natively.

A pre-hydration submit can therefore only produce a harmless page re-render. A JavaScript-disabled probe
of the sign-in page confirms that `password=` and `email=` never appear in the URL.

Search and filter forms are exempt by design. `/crm/search` and similar filterable pages keep a genuine
`GET` form because they submit non-sensitive query terms and must stay linkable, shareable and usable
without JavaScript. The rule is about the data rather than the verb: personal, credential, operational
and narrative values must never be `GET`-submitted, while a search term may be.

This is engineering guidance, not a claim of UK GDPR compliance. The organisation must approve lawful
bases, retention, DPIA findings, safeguarding procedures, incident response, and data governance.
