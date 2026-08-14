# Feature status

Implemented means the route or domain rule exists in the repository. Production rollout still
requires real credentials, infrastructure, policy approval, and operational testing.

| Area | Current state | Remaining operational work |
|---|---|---|
| Foundation | Next.js/TypeScript App Router, Prisma, SQLite migration target, shared design system | Build and deployment checks |
| Public website | Home, policy, services, properties, news, referral, contact, and confidentiality-safe projections | Content, email, and public-route checks |
| Staff authentication | Bcrypt password verification, rate-limited login, hashed httpOnly sessions, password reset, audit | Production secrets, email, HTTPS, backup and restore |
| CRM access model | Authenticated session grants complete CRM/API access; organisation tenant filters and audit remain active | Deliberate future access-control redesign before real resident data |
| Dashboard and search | Live organisation dashboard projections, CRM search, reports, and audited CSV export | Operational data and indexing checks |
| Referrals | Audited status transitions, assignment history, validation, and live forms | Email integration and workflow testing |
| Clients and placements | Profiles, audited placement lifecycle, room occupancy protection, and placement board | Operational workflow testing |
| Users and settings | Organisation user register, invites, activation, role labels for compatibility, settings, content editing | Email and policy review |
| Support plans and case notes | Versioned support-plan changes and append-only case notes with addenda | Resident-data policy and operational testing |
| Incidents and safeguarding | Incident review, updates, actions, closure workflow, and audit | Safeguarding review and operational testing |
| Properties and occupancy | Property, room, occupancy, void, and maintenance views | Private-address handling and workflow testing |
| Tasks and rota | Audited task/status changes, shift assignment, overlap and conflict validation | Operational workflow testing |
| Billing and Housing Benefit | Integer minor-unit claims, invoices, payments, balance protection, and status transitions | Finance workflow testing |
| Documents | Private local/S3 storage seam, signature/size checks, SHA-256 integrity, scan state, authenticated downloads | Persistent storage and scanner configuration |
| Governance and retention | Audited retention rules, subject requests, legal holds, and dry-run review history | Approved policy and scheduler configuration |
| Security foundations | Audit service, validation, ORM field maps, headers, bounded rate-limit adapters, health/config checks | External provider and deployment review |
| Quality | Vitest domain/security tests, typecheck, lint, build, and Playwright staff/public smoke coverage | Keep e2e coverage aligned with workflows |

Legacy membership, role, permission, scope, restricted-assignment, and MFA schema records remain only
for migration compatibility. They are not runtime authorization dependencies.
