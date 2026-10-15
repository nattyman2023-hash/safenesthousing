# Testing

`npm run test` covers referral transitions, room availability, temporal occupancy overlap, overdue
tasks, integer-money invoice totals and balances, CSV escaping/formula protection, and public/protected
form validation. Security tests cover bounded throttling, forwarded-client parsing, and production
configuration readiness.

The Playwright suite covers public navigation, logged-out CRM protection, staff login, referral and task
workflows, incident updates/actions, rota creation, private document upload, authenticated CRM
navigation, document access for two different staff accounts (including files flagged restricted and
files uploaded by another user), and the pre-hydration submit guard. Every client form keeps its submit
control disabled until React owns it, so a spec that interacts with a server-rendered form waits for
hydration through `tests/e2e/hydration.ts` (`waitForHydratedForm`) instead of a fixed delay. Extend the
suite with fictional seeded data when a new workflow or deployment adapter is added.

Before production, run the same database engine and storage/email adapters used in deployment. Run
`npm run check:production-config` with the deployment environment and confirm `/health` returns HTTP
200. Verify the HTTP rate-limit adapter sends only hashed keys and fails closed when unavailable; verify
email and malware scanning follow the configured production policy; verify local and S3-compatible
document writes, reads, deletes, private-bucket settings, integrity hashes, tenant isolation, and
public confidentiality projections.
