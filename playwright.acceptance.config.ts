import { defineConfig, devices } from '@playwright/test';

/**
 * Zero-service acceptance suite.
 *
 * This is deliberately NOT the development suite in playwright.config.ts. That suite runs against
 * `prisma/dev.db`, which `npm run db:seed` fills with six services — and six seeded services are
 * exactly what the failing installation did not have, so a green run there proves nothing about the
 * release blocker.
 *
 * These specs run against a disposable database built from migrations alone by
 * `scripts/acceptance/run.mjs`, and they assert `Service count === 0` before the first UI action.
 *
 * The server is always started externally by the runner, because the production run has to be
 * `node server.mjs --production` against a prebuilt `.next`, which a webServer command cannot
 * express portably without adding a dependency. BASE_URL is therefore mandatory here, matching the
 * way the main suite doubles as a production route audit.
 */
const externalBaseUrl = process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL;
if (!externalBaseUrl) {
  throw new Error('BASE_URL is required. Start the acceptance server with "node scripts/acceptance/run.mjs test --db=... --mode=..." rather than running Playwright directly.');
}

export default defineConfig({
  testDir: './tests/acceptance',
  // One stateful database, one serial narrative: the first service has to exist before the referral
  // that uses it, so parallel workers would race on the same rows.
  workers: 1,
  fullyParallel: false,
  // Production mode serves a prebuilt bundle, but the first request to each route still pays
  // database connection and page-module cost on a cold server. In dev mode the same request can pay
  // a full on-demand compile (a cold /crm/referrals/new has been measured at 26 s), and the populated
  // suite navigates eleven routes in one test, so the budget has to cover compilation rather than
  // only assertion time. A generous ceiling here does not hide defects: every test still fails fast on
  // a wrong status, a missing control or a refused request.
  timeout: 180_000,
  expect: { timeout: 25_000 },
  retries: 0,
  reporter: [['list']],
  use: { baseURL: externalBaseUrl, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
