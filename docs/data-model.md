# Data model dictionary

The complete schema is in `prisma/schema.prisma`. The local database uses SQLite; production should
use a persistent database with migration and backup controls.

## Migration history

| Migration | Adds | Notes |
|---|---|---|
| `0001_init` | Baseline schema | Organisation and staff identity, services, properties and rooms, referrals, clients and placements, support plans, case notes, incidents, tasks and rota, Housing Benefit, invoices and payments, documents, audit, public content |
| `0002_mfa_session_state` | `UserSession.mfaVerifiedAt` | Session-state column for the legacy sign-in step-up flow |
| `0003_mfa_recovery_codes` | `MfaRecoveryCode` | Migration-compatibility records only |
| `0004_document_security_metadata` | Document integrity and scan columns (`sha256`, scanner state) | Integrity hash and malware-scan state |
| `0005_governance_workflows` | Retention-rule and subject-request workflow fields, legal hold, resolution | Governance approvals and holds |
| `0006_retention_review_runs` | `DataRetentionReviewRun` | Auditable dry-run retention summaries |
| `0007_organisation_secrets` | `OrganisationSecret` | Encrypted organisation provider credentials |
| `0008_client_profile_relationships` | Service user contact/profile columns, `Placement.endedReason`, `Document.clientId`, `RelatedPerson`, `ClientRelationship` | Enriched profile and structured relationships |
| `0009_support_operations` | Support-worker, lifecycle and frequency columns, contact-tracking `CaseNote` fields, workflow `Task` fields, `Invoice` attribution, PEN portrait, risk assessment, Safe & Well, moving checklist, repairs, appointments, concerns, complaints, property compliance, policies | Support and housing operations |
| `0010_document_description` | `Document.description` | Optional plain-language description of a filed file |
| `0011_document_date` | `Document.documentDate` | Optional date carried on the file, which may differ from the upload date |

`0009_support_operations` rebuilds `CaseNote` and `Task` because SQLite cannot add `NOT NULL` columns
with non-constant defaults; existing rows are copied across with foreign keys deferred, so nothing is
lost, and the new `Task.updatedAt` (a `NOT NULL` column with no database default) is seeded from each
row's existing `Task.createdAt` so the rebuild is valid on a database that already holds tasks.
`scripts/migrate-local.mjs` asserts each migration's schema effect (columns and tables), copies the
local database and its SQLite sidecars to a timestamped `prisma/*.backup-*` file before applying
anything, and reports row counts for protected tables so a migration cannot silently empty data.

## Shared records (baseline and security migrations)

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

## Service user profile, relationships and documents (`0008`, `0010`, `0011`)

| Table/model | Purpose | Important fields | Sensitive fields | Retention/access |
|---|---|---|---|---|
| RelatedPerson | External person linked to a service user: family, friend, professional, landlord or emergency contact | `fullName`, `phone`, `email`, `address`, `preferredContactMethod`, `consentToContact` | Contact details and notes | Organisation staff; `consentToContact` records whether contact is permitted |
| ClientRelationship | Structured link from a service user to another service user or to an external person | `relationshipType`, `inverseRelationshipType`, `startDate`, `endDate`, `isNextOfKin`, `isEmergencyContact`, `createdBy` | Relationship notes | Organisation staff; one target per row, unique per pair and type |

Columns added to existing records:

- `Client` (`0008`): `phone`, `email`, `address`, `gender`, `pronouns`, `admissionDate`, `importantAlerts`,
  `safeguardingFlag`.
- `Client` (`0009`): `supportWorkerId`, `dischargeDate`, `moveInTargetDate`, `referralSource`,
  `contactFrequencyDays` (default 7), `safeWellFrequencyDays` (default 30).
- `Placement` (`0008`): `endedReason`.
- `Document`: `clientId` (`0008`), `description` (`0010`), `documentDate` (`0011`).
- `CaseNote` (`0009`): `occurredAt`, `method`, `direction`, `durationMinutes`, `completed`, `attempted`,
  `meaningful`, `nextContactDueAt`.
- `Task` (`0009`): `department`, `category`, `source`, `automationKey`, `recurrenceRule`,
  `recurrenceIntervalDays`, `relatedType`, `relatedId`.
- `Invoice` (`0009`): `clientId`, `periodStart`, `periodEnd`.

## Support and housing operations (`0009`)

| Table/model | Purpose | Important fields | Sensitive fields | Retention/access |
|---|---|---|---|---|
| PenPortrait | One "this is me" portrait per service user: how the person wishes to be supported | `status`, `aboutMe`, `myNeeds`, `howIShow`, `whatMatters`, `myStrengths`, `communication`, `likes`, `dislikes`, `healthNeeds`, `risksToMe`, `whoSupportsMe`, `completedAt`, `reviewDueAt` | Personal history, health and preference narrative | Organisation staff; unique per service user |
| RiskAssessment | Dated risk assessment with level, status and review cycle | `assessmentType`, `level`, `status`, `assessedAt`, `reviewDueAt`, `assessedBy`, `summary`, `controlMeasures`, `triggerReason`, `supersedesId` | Risk narrative and control measures | Organisation staff; supersession keeps history |
| RiskFactor | Individual risk line belonging to one assessment | `category`, `description`, `likelihood`, `impact`, `score`, `controlMeasures`, `status` | Risk narrative | Organisation staff; score derived from likelihood × impact |
| SafeWellCheck | Scheduled welfare check with outcome and next due date | `status`, `scheduledFor`, `completedAt`, `checkedById`, `method`, `concernRaised`, `nextDueAt` | Answers and welfare narrative | Organisation staff; frequency driven by `Client.safeWellFrequencyDays` |
| MoveChecklist | Move-in or move-out readiness checklist | `checklistType`, `status`, `targetDate`, `completedAt`, `propertyId`, `placementId`, `createdBy`, `notes` | Address-linked notes | Organisation staff |
| MoveChecklistItem | Ordered checklist line with owner and due date | `label`, `category`, `status`, `ownerId`, `dueAt`, `completedAt`, `notes`, `sortOrder` | Notes | Organisation staff; ordered by `sortOrder` |
| MaintenanceTicket | Repair or maintenance request | `reference`, `clientId`, `propertyId`, `roomId`, `title`, `category`, `trade`, `priority`, `status`, `safetyRisk`, `reportedById`, `assignedToId`, `contractor`, `reportedAt`, `targetFixAt`, `completedAt`, `costMinor` | Description and access notes | Organisation staff; cost stays in integer minor units |
| MaintenanceUpdate | Progress log and status change for one ticket | `status`, `note`, `authorId` | Notes | Organisation staff; append-style history |
| Appointment | Diary entry for a service user, property or repair visit | `title`, `category`, `location`, `startsAt`, `endsAt`, `allDay`, `status`, `ownerId`, `attendees`, `notes`, `completedAt`, `outcome` | Purpose, location and outcome notes | Organisation staff; clash detection is a domain rule, not a database constraint |
| Concern | Early-warning concern raised before a formal complaint | `reference`, `clientId`, `propertyId`, `title`, `summary`, `category`, `severity`, `status`, `raisedById`, `ownerId`, `raisedAt`, `dueAt`, `resolvedAt`, `resolution`, `referralNeeded` | Narrative and resolution | Organisation staff; unique reference |
| ConcernAction | Action taken against a concern | `note`, `authorId` | Notes | Organisation staff |
| Complaint | Formal complaint with stages, working-day deadlines, outcome and learning | `reference`, `clientId`, `raisedBy`, `complainantName`, `title`, `summary`, `category`, `severity`, `status`, `stage`, `ownerId`, `receivedAt`, `acknowledgedAt`, `dueAt`, `closedAt`, `outcome`, `learning` | Complainant details and narrative | Organisation staff; unique reference |
| PropertyComplianceRecord | Statutory compliance item for one property | `complianceType`, `status`, `lastCheckedAt`, `nextDueAt`, `certificateRef`, `contractor`, `outcome`, `notes` | Certificate reference and outcome | Organisation staff; interval rules live in `lib/compliance-domain.ts` |
| PolicyResource | Policy, procedure or resource in the staff register | `title`, `category`, `summary`, `version`, `documentId`, `externalUrl`, `status`, `ownerId`, `effectiveFrom`, `reviewDueAt`, `requiresRead` | Linked private document or external link | Organisation staff; review due date drives the governance view |

## Placement lifecycle and corrections

`Placement.status` is the single source of truth for where a person lives, and it is written only
through the transition rules in `lib/placement-lifecycle.ts`:

| Status | Meaning | Notes |
|---|---|---|
| `ACTIVE` | The person lives here now | An `ACTIVE` placement with an agreed future end date is presented as a temporary placement |
| `MOVED_OUT` | The stay ended and the person moved on | Keeps the historical record; can be reopened while the room is free |
| `CANCELLED` | The placement was cancelled before or after it started | Still history, and still kept |
| `ENTERED_IN_ERROR` | The record was created by mistake and corrected | Terminal: the record, its audit trail and any work recorded against it are kept, while it stops counting as a current placement |

Room availability is derived from `OccupancyRecord` rows rather than set by hand: an occupancy row
whose related placement is `ENTERED_IN_ERROR` never reserves a room. Removing an incorrect placement
(`lib/placement-lifecycle.ts` → `placementRemovalPlan`) deletes the placement and its own occupancy
rows only when nothing was worked against it; otherwise the record is marked `ENTERED_IN_ERROR`.
`AuditLog` rows `PLACEMENT_UPDATED`, `PLACEMENT_ENDED`, `PLACEMENT_REACTIVATED`,
`PLACEMENT_REMOVED_IN_ERROR` and `PLACEMENT_MARKED_ENTERED_IN_ERROR` record every such change, and the
last two carry the mandatory reason.

## Key relationships

**The service user is the hub.** `Client` is referenced by `Placement` and `OccupancyRecord` (where the
person lives), `SupportPlan` → `SupportGoal` → `SupportPlanReview` (what support is agreed), `CaseNote` →
`CaseNoteVersion` (what was delivered), `RiskAssessment` → `RiskFactor`, `PenPortrait`, `SafeWellCheck`,
`MoveChecklist` → `MoveChecklistItem`, `Incident` → `IncidentUpdate` and `IncidentAction`, `Appointment`,
`Concern` → `ConcernAction`, `Complaint`, `HousingBenefitClaim`, `Invoice`, `Task`, and `Document`
through the optional `Document.clientId`. One profile therefore reads as one story: `lib/client-profile.ts`
turns every dated record into timeline entries and `lib/su-timeline.ts` orders and groups them.

**Relationship graph.** `ClientRelationship` targets exactly one counterpart — another `Client`
(`relatedClientId`) or a `RelatedPerson` (`relatedPersonId`) — enforced by a database `CHECK` constraint,
while `ClientRelationship_clientId_relatedClientId_relationshipType_key` prevents duplicate links of the
same type between the same pair. End dates are soft so history is kept. Relationship and inverse labels
come from `lib/client-relationships.ts`, so "parent of" on one record reads as "child of" on the other
without storing two rows.

**Contact compliance.** `CaseNote` contact rows (`method`, `direction`, `durationMinutes`, `completed`,
`attempted`, `meaningful`, `nextContactDueAt`) are read against `Client.contactFrequencyDays` to show
whether an agreed contact pattern is being met, and `SafeWellCheck` does the same against
`Client.safeWellFrequencyDays`. Both frequencies are normalised by `lib/support-domain.ts`, which also
derives next-due dates and profile-gap prompts for the enriched profile.

**Operations chains.** A `SafeWellCheck` that finds an issue can raise a `Concern` and a
`MaintenanceTicket`; a `MaintenanceTicket` carries `MaintenanceUpdate` rows; an `Appointment` can point
at the same `clientId`, `propertyId` or `ticketId`; `PropertyComplianceRecord` belongs to a `Property`
and derives its status from `nextDueAt` per compliance type; `PolicyResource` may attach a private
`Document` or an external URL and drives the review-due view.

**Workflow tasks.** `Task` can reference a client, property, referral or incident, or use the generic
`relatedType`/`relatedId` pair. `automationKey` is unique per organisation so `lib/task-engine.ts` can
run automated task creation repeatedly without duplicating work, and `recurrenceRule` /
`recurrenceIntervalDays` roll a completed recurring task forward instead of replacing it. Status
transitions live in `lib/task-workflow.ts`.

**Documents.** `Document` is organisation-scoped, optionally tied to a `Client`, and carries the
uploader, MIME type, size, SHA-256, scan state, category, optional `description` and optional
`documentDate`, plus `DocumentVersion` rows. `ReferralDocument`, `PolicyResource.documentId` and the
service-user profile all point at the same private storage seam.

**Audit.** `AuditLog` references any record by `resourceType`/`resourceId` and stores redacted
before/after metadata only, so the operational tables above do not duplicate history themselves.

## Document access and record-level redactions

Document access is deliberately flat: every authenticated staff member in the organisation can view and
download every document, whatever its `restricted` flag, uploader or linked record. The full policy
statement is in `security-model.md`. Organisation tenant filters, private storage outside `public/`,
storage-key validation, SHA-256 verification and authenticated download routes all remain in force.

Record-level redactions are a different mechanism and are unchanged: `Client.restricted`,
`Incident.restricted`, restricted case notes and masked restricted relationship counterpart names
withhold narrative text in case-record and timeline views only. They never filter the document register,
a profile's document table, or the download route.



Foreign keys, uniqueness rules, indexes, status strings, and relation ownership are defined in Prisma.
Active room occupancy must also be checked by a transaction/domain rule because SQLite cannot express
every temporal overlap constraint as a simple unique index.

## Selectable services: one rule for the menu and the write path

A service dropdown must never offer an option the endpoint that receives the submission will reject,
and it must never widen organisation scope to make a menu look fuller. `lib/service-catalogue.ts` is the
single source of truth for that, and every selectable list is built from the same filter the endpoint
applies:

| Where | Rule | Used by |
|---|---|---|
| `referralServiceWhere(organisationId)` | organisation scope **and** `published: true` | `POST /api/crm/referrals`, `/crm/referrals/new` |
| `crmServiceWhere(organisationId)` | organisation scope only (drafts may be linked internally) | client, property and rota endpoints and their forms |
| `publicServiceWhere()` | `published: true` (the public site serves one organisation) | `POST /api/referrals`, `/referrals` |

`Service` has no `active` or `referralEnabled` column, so publication is the only availability flag the
write paths can enforce.

Selectable lists are read from the database and never fall back to fixtures. The public content helpers
(`getServices`, `getPublicProperties`, `getPublishedNews`) still fall back to the fictional lists in
`lib/data.ts` when a table has no rows, which is deliberate for marketing pages: a fresh installation
should still show representative public content. Those fallback entries use slug-shaped ids
(`domestic-abuse`), so they can never be offered by a form or accepted by an endpoint — the referral form
offered exactly those ids once, and every submission was refused with "Choose an available service."

When no service is eligible, the CRM form says so in plain words, points at where a service is published
(`/crm/content`) and disables its submit control, rather than presenting a menu that cannot be submitted.

