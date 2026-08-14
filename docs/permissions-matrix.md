# Permissions matrix (archived)

This is historical planning material, not a runtime authorization matrix. The current assessment
build uses one access state: an authenticated organisation session can use every CRM module and API.
Legacy role, permission, service/property scope, and restricted-assignment records remain for database
compatibility and are not consulted by the active request path. Tenant filters, validation, audit, and
the public confidentiality boundary still apply.

| Historical module/action | Previously planned access |
|---|---|
| Dashboard, referrals, clients, placements | Role and service/property scoped |
| Incidents and safeguarding | Safeguarding-role and assignment scoped |
| Tasks, rota, billing, and documents | Operational-role scoped |
| Reports and CSV export | Report-permission scoped |
| Users, settings, and governance | Administrator/permission scoped |

The table above is retained only to explain the legacy schema and earlier design. Any future role-based
redesign must replace it with an approved implementation and tests before real resident data is handled.

All current mutations still validate domain inputs and write audits without storing claim evidence,
support-note content, passwords, tokens, or full document bodies.
