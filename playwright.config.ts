import { defineConfig, devices } from '@playwright/test';
// workers: 1 — every spec shares one stateful dev database (real auth sessions, MFA enrollment,
// seeded fixtures); running spec files concurrently races on that shared state.
// webServer.env forces DISABLE_MFA_FOR_DEV off and reuseExistingServer:false so the suite always
// exercises the real MFA flow, even if a developer has the bypass on in .env for manual browsing —
// if port 3000 is already taken by such a server, this fails loudly (EADDRINUSE) rather than
// silently reusing the wrong config.
export default defineConfig({ testDir: './tests/e2e', workers: 1, use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' }, projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }], webServer: { command: 'npm run dev', url: 'http://localhost:3000/health', reuseExistingServer: false, env: { DISABLE_MFA_FOR_DEV: 'false' }, timeout: 120_000 } });
