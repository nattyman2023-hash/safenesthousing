# Feature status

Implemented means the route or domain rule exists in the repository. Production rollout still
requires real credentials, infrastructure, policy approval, and operational testing.

| Area | Current state | Remaining operational work |
|---|---|---|
| Foundation | Next.js/TypeScript App Router, Prisma, SQLite migration target, shared design system | Build and deployment checks |
| Public website | Home, policy, services, properties, news, referral, contact, and confidentiality-safe projections | Content, email, and public-route checks |
| Staff authentication | Bcrypt password verification, rate-limited login, hashed httpOnly sessions, password reset, audit | Production secrets, email, HTTPS, backup and restore |
| CRM access model | Authenticated session grants complete CRM/API access; organisation tenant filters and audit remain active. Every signed-in account can view and download every document held for the organisation | Deliberate future access-control redesign before real resident data |
| Client form hardening | Server-rendered client forms keep their submit control disabled until hydration and POST their own fallback, so a pre-hydration click or Enter press cannot leak credentials, case notes, or handover notes into a URL | Keep new client forms on the shared `useHydrated` hook |
| Dashboard and search | Live organisation dashboard projections (open work by department, due and overdue, concerns, complaints, compliance, appointments, Safe & Well), CRM search, reports, and audited CSV export | Operational data and indexing checks |
| Referrals | Audited status transitions, assignment history, validation, and live forms | Email integration and workflow testing |
| Clients and placements | Profiles, audited placement lifecycle, room occupancy protection, and placement board | Operational workflow testing |
| Service user profile | Enriched profile (contact details, pronouns, admission and move-in dates, referral source, important alerts, safeguarding flag, key and support worker, contact and Safe & Well frequency), aggregated service-user timeline, profile-gap prompts, and the profile documents table | Operational data-quality review |
| Service user relationships | Structured links between service users and to external people (next of kin, emergency contact, consent to contact, inverse labels, soft end dates) | Policy review for relationship recording |
| Users and settings | Organisation user register, invites, activation, role labels for compatibility, settings, content editing | Email and policy review |
| Support plans and case notes | Versioned support-plan changes, support goals and reviews, append-only case notes with addenda, and contact tracking (method, direction, duration, attempted/meaningful, next contact due) | Resident-data policy and operational testing |
| PEN portrait | One portrait per service user covering about me, needs, communication, what matters, strengths, likes and dislikes, health needs and risks, with a review date | Content review with residents |
| Risk assessments | Dated assessments with level, status, review due date, control measures, supersession and individual risk factors scored by likelihood × impact | Approved risk methodology |
| Safe & Well checks | Scheduled welfare checks with method, answers, outcome and next due date, raising concerns and repair referrals when an issue is found | Operational schedule configuration |
| Moving checklists | Move-in and move-out checklists with ordered items, owners, due dates and completion | Operational testing |
| Incidents and safeguarding | Incident review, updates, actions, closure workflow, and audit | Safeguarding review and operational testing |
| Concerns | Early-warning concerns with severity, owner, due date, action log and resolution | Operational escalation policy |
| Complaints | Formal complaints with stage, working-day acknowledgement and response deadlines, outcome, learning record and closure | Approved complaints policy |
| Properties and occupancy | Property, room, occupancy, void, and maintenance views | Private-address handling and workflow testing |
| Repairs and maintenance | Repair tickets with trade, priority, safety risk, target fix date, contractor, cost, progress updates and status transitions | Contractor process review |
| Property compliance | Statutory compliance items per property (type, last checked, next due, certificate reference, contractor) with interval rules | Certificate retention policy |
| Policies and resources | Policy, procedure and resource register with version, owner, effective date, review due date, read requirement and optional private document or external link | Approved policy publication process |
| Tasks and rota | Workflow tasks (department, category, source, recurrence, automated creation) with audited status changes, plus shift assignment with overlap and conflict validation | Operational workflow testing |
| Appointments and calendar | Diary entries linked to a service user, property or repair, with clash detection, open and closed states, outcome capture and day and week calendar views | Calendar integration |
| Billing and Housing Benefit | Integer minor-unit claims, invoices, payments, balance protection, status transitions, invoice-to-service-user and billing-period attribution, and audited Housing Benefit changes on the service user profile | Finance workflow testing |
| Documents | Private local/S3 storage seam, signature/size checks, SHA-256 integrity, scan state, optional description and document date, and authenticated downloads; the restricted flag is reporting metadata only and never blocks a signed-in account from viewing or downloading a file | Persistent storage and scanner configuration |
| Governance and retention | Audited retention rules, subject requests, legal holds, and dry-run review history | Approved policy and scheduler configuration |
| Security foundations | Audit service, validation, ORM field maps, headers, bounded rate-limit adapters, health/config checks | External provider and deployment review |
| Quality | Vitest domain/security tests, typecheck, lint, production build, and Playwright coverage of public navigation, staff sign-in, referral/task/incident/rota workflows, private document upload, pre-hydration submit guards, and document access for two staff accounts | Keep e2e coverage aligned with workflows |

## Document access policy (current build)

> In the current SafeNest operational build, all authenticated staff within the organisation can view
> and download all CRM documents, including documents carrying restricted/sensitive metadata. The
> metadata remains for reporting and future access-control development but does not currently restrict
> document access. Anonymous access and cross-organisation access remain blocked.

This behaviour is intentional for this build and may be replaced later with granular document
permissions. Until then, document access is deliberately unaffected by:

- who uploaded the file;
- whether the signed-in staff member is assigned to the related service user, referral or incident;
- any document role, permission or restricted-document label;
- the `restricted` flag on a document, service user, incident or case note.

Record-level narrative redactions are a separate mechanism and are unchanged: restricted client and
incident narratives are withheld in case-record and timeline views, and restricted relationship
counterpart names are masked in pickers. Those rules never filter the document register, a profile's
document table or the download route.

Still enforced for documents: an authenticated session, organisation tenant scope, private storage
outside `public/`, extension/MIME/size/signature validation, SHA-256 integrity checks, malware-scan
state, and audit of restricted record views. See `security-model.md` for the full statement.

## Form hydration safety

Client forms are server-rendered, so the browser owns them until React hydrates. In that window a click
or Enter press submits the form natively with its default method, which for a plain form is `GET` — that
would append every field value to the URL and therefore to browser history, reverse-proxy logs and
monitoring systems. The shared `useHydrated()` hook (`src/lib/use-hydrated.ts`) reports hydration via
`useSyncExternalStore`, and every operational client form keeps its submit control
`disabled={!hydrated || …}` while also carrying `method="post"` as defence in depth. Passwords, case
narratives, contact notes and handover text can therefore never reach a query string. Genuine
search and filter forms such as `/crm/search` keep their `GET` method and are exempt by design; see the
form hydration section in `security-model.md`.

Legacy membership, role, permission, scope, restricted-assignment, and MFA schema records remain only
for migration compatibility. They are not runtime authorization dependencies.


