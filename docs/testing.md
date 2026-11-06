# Testing

`npm run test` covers referral transitions, room availability, temporal occupancy overlap, overdue
tasks, integer-money invoice totals and balances, CSV escaping/formula protection, and public/protected
form validation. Security tests cover bounded throttling, forwarded-client parsing, and production
configuration readiness.

`tests/dependency-alignment.test.ts` pins React, React DOM and their type packages to one 19.2 release
and rejects duplicate React copies, which is what caused the cold-cache `/_global-error` build crash.
`npm run verify:build` deletes `.next` and runs the production build so a warm cache cannot hide that
class of failure again. Malware-scanning tests cover the fail-closed upload contract (disabled provider,
missing configuration, timeout, invalid or oversized verdict, infection, hash/size/type checks) and the
download gate, which serves only an explicitly `CLEAN` status while scanning is required and audits the
refusal. Public-content tests pin the removal of invented metrics and named property/news examples.

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
