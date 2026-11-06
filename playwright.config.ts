import { defineConfig, devices } from '@playwright/test';
// workers: 1 — every spec shares one stateful dev database (real auth sessions, seeded fixtures);
// running spec files concurrently races on that shared state.
// reuseExistingServer:false so the suite always starts its own server — if port 3000 is already
// taken, this fails loudly (EADDRINUSE) rather than silently reusing the wrong config.
// BASE_URL points the suite at an already-running deployment (for example the production host) and
// suppresses the local web server, so the same specs double as a production route audit.
const externalBaseUrl = process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL;
// E2E_PORT lets the suite run while another local app holds port 3000.
const localPort = process.env.E2E_PORT ?? '3000';
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  // The suite always boots its own dev server, so the first request to each route pays Next.js
  // compilation. A short expect timeout turns that cold start into a flake in whichever test
  // navigates first — and in a serial suite that is the setup test every other test depends on.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: externalBaseUrl ?? `http://localhost:${localPort}`, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalBaseUrl ? undefined : { command: 'npm run dev', url: `http://localhost:${localPort}/health`, env: { PORT: localPort }, reuseExistingServer: false, timeout: 120_000 }
});
