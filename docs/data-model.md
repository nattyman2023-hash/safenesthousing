# Data model dictionary

The complete schema is in `prisma/schema.prisma`. The local database uses SQLite; production should
use a persistent database with migration and backup controls.

| Table/model | Purpose | Important fields | Sensitive fields | Retention/access |
|---|---|---|---|---|
| Organisation | Tenant boundary and organisation settings | `slug`, `timezone` | Operational settings | Authenticated organisation staff; retain while the organisation exists |
| User / Membership / Role / Permission | Staff identity plus legacy access metadata | `email`, `active`, legacy role label and scopes | Password hash | Authenticated organisation staff; deactivation is preferred to deletion |
| UserSession / PasswordResetToken / MfaMethod / MfaRecoveryCode / LoginAttempt | Authentication state and security events; MFA objects are migration compatibility records | token hash, expiry, attempt outcome | Token hashes, encrypted legacy MFA secret, recovery-code hashes | Security retention schedule; never expose raw tokens, secrets, or recovery codes |
| SiteSetting | Structured editable public content | key/value | Emergency contact settings may be operationally sensitive | Authenticated organisation staff |
| OrganisationSecret | Encrypted organisation provider credentials | key, timestamps | Encrypted API key ciphertext | Authenticated organisation staff; never expose or include in audit metadata |
| Service | Published service content and referral rules | slug, eligibility, published | None by default | Authenticated organisation staff; public output is projected |
| Property / PropertyImage / Room | Public-safe and operational accommodation data | public name, neighbourhood, capacity, room status | Full address, refuge flags, room occupancy | Authenticated organisation staff; do not publish confidential fields |
| NewsCategory / NewsPost / TeamMember | Public editorial content | slug, publishedAt, published | Check consent for resident stories | Authenticated organisation staff; public output is projected |
| ContactSubmission | Public contact enquiries | category, status, retentionUntil | Message and contact details | Authenticated organisation staff; apply approved retention |
| Referral and related risk/note/document/history tables | Referral intake and auditable pipeline | reference, status, follow-up date | Housing situation, needs, risks, documents | Authenticated organisation staff; keep sensitive fields out of public projections |
| Client / Placement / OccupancyRecord | Resident profile and placement lifecycle | reference, status, dates | DOB, risk, contacts, tenancy information | Authenticated organisation staff; tenant filters and audit still apply |
| SupportPlan / SupportGoal / SupportPlanReview | Versioned support delivery | goal status, review date | Review notes and outcomes | Authenticated organisation staff |
| CaseNote / CaseNoteVersion | Append-only support notes and corrections | finalised, category, author | Full note content | Authenticated organisation staff; append-only rule and audit apply |
| Incident / IncidentUpdate / IncidentAction | Incident and safeguarding workflow | severity, status, assigned lead | Description, injuries, safeguarding narrative | Authenticated organisation staff; audit applies to sensitive views and mutations |
| RestrictedAccessAssignment | Legacy need-to-know metadata retained for compatibility | resource type/id, expiry, reason | Access reason | Not used as a runtime gate; audit changes |
| Task / RotaShift / RotaAssignment | Work management and staffing | due time, shift interval | Handover details may be sensitive | Authenticated organisation staff |
| FundingSource / HousingBenefitClaim / Invoice / InvoiceItem / Payment | Finance operations | integer minor-unit amounts, status | Claim evidence and arrears context | Authenticated organisation staff; money remains integer minor units |
| Document / DocumentVersion | Private object storage metadata | storage key, MIME, size, SHA-256, malware scan state | File contents and associations | Authenticated organisation staff; authenticated downloads and scanner state |
| AuditLog | Append-only security and change history | actor, action, resource, timestamp, success | Redacted before/after metadata only | Auditors and operations; never log passwords, tokens, full notes, or documents |
| DataRetentionRule / DataSubjectRequest | Governance workflows | retention days, legal basis, due date, status, legal hold | Subject reference and request notes | Authenticated organisation staff; legal holds block closure |
| DataRetentionReviewRun | Auditable dry-run retention review summary | mode, status, evaluated rules, counts, timestamps | No record contents or subject references | Governance reviewers and scheduler; deletion is not performed |

Foreign keys, uniqueness rules, indexes, status strings, and relation ownership are defined in Prisma.
Active room occupancy must also be checked by a transaction/domain rule because SQLite cannot express
every temporal overlap constraint as a simple unique index.
