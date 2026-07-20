# Data model dictionary

The complete schema is in `prisma/schema.prisma`. The local database uses SQLite; production should use a persistent database with migration and backup controls.

| Table/model | Purpose | Important fields | Sensitive fields | Retention/access |
|---|---|---|---|---|
| Organisation | Tenant boundary and organisation settings | `slug`, `timezone` | Operational settings | Administrators; retain while organisation account exists |
| User / Membership / Role / Permission | Staff identity and RBAC | `email`, `active`, role slug, service/property scopes | Password hash, MFA secret | Administrators; deactivation is preferred to deletion |
| UserSession / PasswordResetToken / MfaMethod / MfaRecoveryCode / LoginAttempt | Authentication state and security events | token hash, expiry, MFA verification time, recovery-code use, attempt outcome | Token hashes, encrypted MFA secret, recovery-code hashes | Security retention schedule; never expose raw tokens, secrets, or recovery codes after initial display |
| SiteSetting | Structured editable public content | key/value | Emergency contact settings may be operationally sensitive | Content/admin roles |
| Service | Published service content and referral rules | slug, eligibility, published | None by default | Content and service roles |
| Property / PropertyImage / Room | Public-safe and operational accommodation data | public name, neighbourhood, capacity, room status | Full address, refuge flags, room occupancy | Property roles; do not publish confidential fields |
| NewsCategory / NewsPost / TeamMember | Public editorial content | slug, publishedAt, published | Check consent for resident stories | Content editors |
| ContactSubmission | Public contact enquiries | category, status, retentionUntil | Message and contact details | Contact/admin roles; apply approved retention |
| Referral and related risk/note/document/history tables | Referral intake and auditable pipeline | reference, status, follow-up date | Housing situation, needs, risks, documents | Need-to-know referral/support roles |
| Client / Placement / OccupancyRecord | Resident profile and placement lifecycle | reference, status, dates | DOB, risk, contacts, tenancy information | Assigned staff; restrictive records need explicit access |
| SupportPlan / SupportGoal / SupportPlanReview | Versioned support delivery | goal status, review date | Review notes and outcomes | Assigned support roles |
| CaseNote / CaseNoteVersion | Append-only support notes and corrections | finalised, category, author | Full note content | Assigned support roles; restricted flag enforced |
| Incident / IncidentUpdate / IncidentAction | Incident and safeguarding workflow | severity, status, assigned lead | Description, injuries, safeguarding narrative | Safeguarding and assigned roles only |
| RestrictedAccessAssignment | Explicit need-to-know grants | resource type/id, expiry, reason | Access reason | Safeguarding/admin roles; audit changes |
| Task / RotaShift / RotaAssignment | Work management and staffing | due time, shift interval | Handover details may be sensitive | Operational roles |
| FundingSource / HousingBenefitClaim / Invoice / InvoiceItem / Payment | Finance operations | integer minor-unit amounts, status | Claim evidence and arrears context | Finance roles; keep separate from support notes |
| Document / DocumentVersion | Private object storage metadata | storage key, MIME, size, SHA-256, malware scan state, review date | File contents and associations | Permissioned roles; authorized downloads; scanner state is retained without file contents |
| AuditLog | Append-only security and change history | actor, action, resource, timestamp, success | Redacted before/after metadata only | Auditors/admins; never log passwords, tokens, full notes, or documents |
| DataRetentionRule / DataSubjectRequest | Governance workflows | retention days, approved legal basis, due date, status, legal hold, review metadata | Subject reference and request notes | `governance.manage`; legal holds block closure |
| DataRetentionReviewRun | Auditable dry-run retention review summary | mode, status, evaluated rules, candidate/exclusion counts, timestamps | No record contents or subject references | Governance reviewers and scheduler; deletion is not performed |

Foreign keys, uniqueness rules, indexes, status strings, and relation ownership are defined in Prisma. Active room occupancy must also be checked by a transaction/domain rule because SQLite cannot express every temporal overlap constraint as a simple unique index.
