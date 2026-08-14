import { defineConfig, devices } from '@playwright/test';
// workers: 1 — every spec shares one stateful dev database (real auth sessions, seeded fixtures);
// running spec files concurrently races on that shared state.
// reuseExistingServer:false so the suite always starts its own server — if port 3000 is already
// taken, this fails loudly (EADDRINUSE) rather than silently reusing the wrong config.
export default defineConfig({ testDir: './tests/e2e', workers: 1, use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' }, projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }], webServer: { command: 'npm run dev', url: 'http://localhost:3000/health', reuseExistingServer: false, timeout: 120_000 } });
