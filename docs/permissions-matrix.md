# Permissions matrix

This is the initial access design. Service and property scopes further limit rows after the role check. Restricted incidents, domestic-abuse records, confidential addresses, and restricted notes require explicit need-to-know assignment.

| Module/action | Super admin | Org admin | Service manager | Safeguarding lead | Support lead | Support worker | Property officer | Finance officer | Content editor | Auditor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dashboard | Full | Full | Scoped | Scoped | Scoped | Scoped | Scoped | Finance view | Content view | Read |
| Referrals read/write | Full | Full | Scoped | Read | Scoped | Assigned | No | No | No | Approved read |
| Clients/support plans/case notes | Full | Full | Scoped | Restricted read | Scoped | Assigned | No | No | No | Approved read |
| Properties/rooms/occupancy | Full | Full | Scoped | Read | Scoped | Read | Full | No | No | Approved read |
| Placements/move-in/out | Full | Full | Scoped | No | Scoped | Read | Full | No | No | Approved read |
| Incidents read/write | Full | Full | Read | Full/close | Scoped | Assigned | Property incidents | No | No | Approved read |
| Close safeguarding incident | Full | Policy-dependent | No | Full | No | No | No | No | No | No |
| Tasks/rota | Full | Full | Scoped | Assigned | Scoped | Assigned | Property shifts | No | No | Read |
| Billing/Housing Benefit | Full | Full | Read exceptions | No | No | No | No | Full | No | Approved read |
| Public content | Full | Full | Read | No | No | No | No | No | Full | Read |
| Documents | Full | Full | Scoped | Restricted | Scoped | Assigned | Property docs | Finance docs | No | Approved read |
| Reports/CSV export | Full | Full | Scoped | Safeguarding scope | Scoped | No | Property scope | Finance scope | Content scope | Approved |
| Users/roles/settings | Full | Full | No | No | No | No | No | No | No | No |
| Audit log | Full | Full | Read | Read | Read own scope | No | No | No | No | Full read |

Every server-side protected read and write must check the session, role, organisation, service/property scope, and restricted-record assignment. The matrix is an implementation guide and requires organisational approval before operational use.

Finance reads use `finance.read`. Housing Benefit updates, invoice creation/status changes, and payment recording use `finance.write`; financial audit metadata records status and amount changes without storing claim evidence or support-note content. Placement reads/writes use `placements.read` and `placements.write`; user invitations and access changes use `users.manage`. Referral assignment uses the existing `referrals.write` permission, organisation membership, active referral-read access, and compatible service scope; each change creates an assignment history record and audit event. Public settings, service content, and news publishing use `content.write` and record changed keys/fields without copying full content into audit metadata.
