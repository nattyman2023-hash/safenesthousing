import { defineConfig, devices } from '@playwright/test';
// workers: 1 — every spec shares one stateful dev database (real auth sessions, seeded fixtures);
// running spec files concurrently races on that shared state.
// reuseExistingServer:false so the suite always starts its own server — if port 3000 is already
// taken, this fails loudly (EADDRINUSE) rather than silently reusing the wrong config.
// BASE_URL points the suite at an already-running deployment (for example the production host) and
// suppresses the local web server, so the same specs double as a production route audit.
const externalBaseUrl = process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { baseURL: externalBaseUrl ?? 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalBaseUrl ? undefined : { command: 'npm run dev', url: 'http://localhost:3000/health', reuseExistingServer: false, timeout: 120_000 }
});
