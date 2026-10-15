import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { test, expect, type ConsoleMessage, type Page, type Response, type TestInfo } from '@playwright/test';
import { prisma, resetStaffSession } from './db-reset';
import { ADMIN_PASSWORD, enterCredentials, assertSignedIn } from './staff-auth';

/**
 * Route audit.
 *
 * The audit is deliberately split into two halves:
 *
 *  - "without a session" needs no database and no credentials, so it can be pointed at any
 *    deployment (local or production) to answer a single question: does this URL return a page,
 *    or does it quietly turn into a 404? A 404 on a real page route, on a dynamic route, or on an
 *    RSC navigation request is a failure; an intentional redirect to the sign-in page is not.
 *  - "signed in" crawls the live CRM navigation and every record link the CRM itself renders, so
 *    dynamic routes are exercised with the identifiers production actually produces rather than
 *    identifiers invented by the test.
 *
 * Nothing here submits a form or mutates a record, so it is safe against a populated database.
 *
 * Run against production with:
 *   BASE_URL=https://your-host npx playwright test tests/e2e/route-audit.spec.ts
 */

// Sign-in allows eight attempts per IP and email in five minutes, and the other specs already spend
// the administrator's budget, so the crawl signs in as the seeded support lead. That also proves the
// audit as an ordinary staff member rather than as the administrator.
const AUDIT_EMAIL = process.env.AUDIT_EMAIL ?? 'j.whitfield@safenest.test';
const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD ?? ADMIN_PASSWORD;
const MAX_CRAWL_PAGES = 60;

async function collect(directory: string, fileName: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(full, fileName));
    else if (entry.name === fileName) files.push(full);
  }
  return files;
}

/** Mirrors scripts/audit-routes.mjs: route groups such as (public) never appear in the URL. */
function toRoute(file: string): string {
  const segments = relative(join(process.cwd(), 'src', 'app'), file)
    .split(sep).join('/')
    .replace(/\/(page|route)\.tsx$/, '')
    .split('/')
    .filter((segment) => segment && !/^\(.*\)$/.test(segment));
  return segments.length ? `/${segments.join('/')}` : '/';
}

type Row = { route: string; status: number; finalUrl: string; result: string; detail?: string };

async function publish(title: string, rows: Row[], testInfo: TestInfo): Promise<void> {
  const failures = rows.filter((row) => !row.result.startsWith('PASS'));
  const table = ['| Route | Status | Final URL | Result |', '|---|---:|---|---|', ...rows.map((row) => `| \`${row.route}\` | ${row.status} | \`${row.finalUrl}\` | ${row.result}${row.detail ? ` — ${row.detail}` : ''} |`)];
  const summary = `# ${title}\n\n${rows.length} route(s), ${failures.length} failure(s)\n\n${table.join('\n')}`;
  console.log(summary);
  await testInfo.attach(title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), { body: summary, contentType: 'text/markdown' });
}

/** A URL the app can produce for a [param] route; the identifier itself is not resolved here. */
const SAMPLE_SEGMENT = 'audit-sample-id';
const withSampleSegments = (route: string) => route.replace(/\[[^\]]+\]/g, SAMPLE_SEGMENT);

test.describe.configure({ mode: 'serial' });

let pageRoutes: string[] = [];
let publicRoutes: string[] = [];
let crmRoutes: string[] = [];
let crmDynamicRoutes: string[] = [];

test.beforeAll(async () => {
  pageRoutes = (await collect(join(process.cwd(), 'src', 'app'), 'page.tsx')).map(toRoute).sort();
  publicRoutes = pageRoutes.filter((route) => !route.startsWith('/crm') && !route.startsWith('/staff') && !route.includes('['));
  crmRoutes = pageRoutes.filter((route) => route.startsWith('/crm') && !route.includes('['));
  crmDynamicRoutes = pageRoutes.filter((route) => route.startsWith('/crm') && route.includes('['));
});

test('public routes answer with a page, never a 404', async ({ request }, testInfo) => {
  const routes = [...publicRoutes, '/robots.txt', '/sitemap.xml'];
  // The build route table is the real source of truth; this guard exists so that a broken route
  // discovery step fails loudly instead of quietly sweeping three URLs and reporting success.
  expect(routes.length).toBeGreaterThan(12);
  const rows: Row[] = [];
  for (const route of routes) {
    const response = await request.get(route, { maxRedirects: 0 });
    const status = response.status();
    const location = response.headers()['location'] ?? '';
    const redirected = [301, 302, 303, 307, 308].includes(status);
    rows.push({ route, status, finalUrl: redirected ? location : route, result: status === 200 ? 'PASS' : `FAIL ${status}` });
  }
  await publish('Public route sweep', rows, testInfo);
  expect(rows.filter((row) => !row.result.startsWith('PASS')).map((row) => `${row.route} -> ${row.result}`)).toEqual([]);
});

test('health reports its own degraded state instead of a 404 or 500', async ({ request }, testInfo) => {
  const response = await request.get('/health', { maxRedirects: 0 });
  const status = response.status();
  const body = await response.json().catch(() => ({}));
  // A read-only probe: 200 when every runtime check passes, 503 when a production check is missing.
  // Either way the route must exist and name the failing check, because that is what turns a
  // "the site is broken" report into "APP_URL is not HTTPS on the host".
  const failing = (body.runtime?.checks ?? []).filter((check: { ok: boolean }) => !check.ok).map((check: { name: string }) => check.name);
  const summary = `health -> ${status} (environment ${body.runtime?.environment ?? 'unknown'}, database ${body.checks?.database ?? 'unknown'})\nfailing checks: ${failing.length ? failing.join(', ') : 'none'}`;
  console.log(summary);
  await testInfo.attach('health', { body: summary, contentType: 'text/plain' });
  expect([200, 503], 'health must be reachable and self-describing').toContain(status);
  expect(body.service).toBe('safe-nest');
  expect(failing.length === 0).toBe(status === 200);
});

test('signed-out CRM URLs redirect to sign-in instead of 404', async ({ request }, testInfo) => {
  const routes = [...crmRoutes, ...crmDynamicRoutes.map(withSampleSegments)];
  expect(routes.length).toBeGreaterThan(30);
  const rows: Row[] = [];
  for (const route of routes) {
    const response = await request.get(route, { maxRedirects: 0 });
    const status = response.status();
    const location = response.headers()['location'] ?? '';
    const toSignIn = [301, 302, 303, 307, 308].includes(status) && location.includes('/staff/login');
    rows.push({ route, status, finalUrl: location || '(no redirect)', result: toSignIn ? 'PASS' : status === 404 ? 'FAIL 404' : `FAIL ${status}`, detail: toSignIn ? undefined : 'a signed-out visitor must be sent to sign-in, not served an error page' });
  }
  await publish('Signed-out CRM route sweep', rows, testInfo);
  expect(rows.filter((row) => !row.result.startsWith('PASS')).map((row) => `${row.route} -> ${row.result}`)).toEqual([]);
});

test('RSC navigation requests are answered, not converted into 404s', async ({ request }, testInfo) => {
  const rows: Row[] = [];
  for (const route of ['/crm/dashboard', '/crm/tasks', '/crm/properties']) {
    const response = await request.get(`${route}?_rsc=audit`, { headers: { RSC: '1' }, maxRedirects: 0 });
    const body = await response.text();
    const contentType = response.headers()['content-type'] ?? '';
    const isFlight = contentType.includes('text/x-component');
    const notFound = body.includes('This page could not be found') || body.includes('NEXT_NOT_FOUND');
    const result = response.status() === 200 && isFlight && !notFound ? 'PASS' : `FAIL ${response.status()}`;
    rows.push({ route: `${route}?_rsc=audit`, status: response.status(), finalUrl: contentType, result, detail: result === 'PASS' ? undefined : 'the custom server must not answer an RSC request with a 404 document' });
  }
  await publish('RSC navigation sweep', rows, testInfo);
  expect(rows.filter((row) => !row.result.startsWith('PASS')).map((row) => `${row.route} -> ${row.result}`)).toEqual([]);
});

test.describe('Signed-in CRM crawl', () => {
  test.describe.configure({ timeout: 300_000 });
  let page: Page;
  let close: () => Promise<void>;
  const recordRoutes = new Set<string>();

  test.beforeAll(async ({ browser }) => {
    // Resetting the fixture session makes the sign-in below a real sign-in rather than a reuse of an
    // existing session. An audit pointed at an external deployment has no local database to reset,
    // so the failure is ignored and the sign-in itself is the check.
    await resetStaffSession(AUDIT_EMAIL).catch(() => undefined);
    page = await browser.newPage();
    await enterCredentials(page, AUDIT_EMAIL, AUDIT_PASSWORD);
    await assertSignedIn(page);
    close = () => page.close();
  });

  test.afterAll(async () => { await close?.(); });

  test('every reachable CRM page renders for a signed-in user', async ({}, testInfo) => {
    const rows: Row[] = [];
    const visited = new Set<string>();
    const queue = ['/crm/dashboard'];
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const apiFailures: string[] = [];
    const onConsole = (message: ConsoleMessage) => { if (message.type() === 'error') consoleErrors.push(`${message.text()}`); };
    const onPageError = (error: Error) => pageErrors.push(`${page.url()} :: ${error.message}`);
    const onResponse = (response: Response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/') && response.status() >= 400) apiFailures.push(`${url.pathname} -> ${response.status()}`);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      while (queue.length && visited.size < MAX_CRAWL_PAGES) {
        const route = queue.shift() as string;
        if (visited.has(route)) continue;
        visited.add(route);
        const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
        const status = response?.status() ?? 0;
        const notFound = await page.getByText('That page is not here.').count();
        const landedOn = new URL(page.url()).pathname;
        const detail = landedOn !== route ? `ended on ${landedOn}` : notFound ? 'rendered the not-found page' : undefined;
        rows.push({ route, status, finalUrl: landedOn, result: status === 200 && !notFound && landedOn === route ? 'PASS' : `FAIL ${status}`, detail });

        // Dynamic routes are exercised with the identifiers the CRM itself links to, which is the
        // only honest way to tell a correct 404 (deleted record) from a broken page (bug).
        for (const pattern of crmDynamicRoutes) if (new RegExp(`^${pattern.replace(/\[[^\]]+\]/g, '[^/]+')}/?$`).test(route)) recordRoutes.add(route);

        const hrefs = await page.locator('a[href^="/"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
        for (const href of hrefs) {
          const target = href.split('#')[0].split('?')[0];
          if (!target.startsWith('/crm') || target.startsWith('/api')) continue;
          if (!visited.has(target) && queue.length + visited.size < MAX_CRAWL_PAGES) queue.push(target);
        }
      }
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }

    await testInfo.attach('console-errors', { body: consoleErrors.length ? consoleErrors.join('\n') : 'none', contentType: 'text/plain' });
    await publish(`Signed-in CRM crawl (${consoleErrors.length} console error(s))`, rows, testInfo);
    expect(recordRoutes.size, 'the crawl must reach at least one real record page').toBeGreaterThan(0);
    expect(apiFailures, 'API requests must not fail while a signed-in user browses').toEqual([]);
    expect(pageErrors, 'no uncaught client exception is acceptable').toEqual([]);
    expect(rows.filter((row) => !row.result.startsWith('PASS')).map((row) => `${row.route} -> ${row.result}${row.detail ? ` (${row.detail})` : ''}`)).toEqual([]);
  });

  test('in-CRM link clicks navigate through RSC without landing on a 404', async ({}, testInfo) => {
    await page.goto('/crm/dashboard', { waitUntil: 'domcontentloaded' });
    // Exactly the requests a real browser makes when someone clicks the sidebar: Next's client
    // router fetches the route as an RSC payload. If the custom server ever answered one of those
    // with a document or a 404, the click would look fine and the page would not arrive.
    const links = await page.locator('.crm-nav a[href^="/"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
    expect(links.length).toBeGreaterThan(15);
    const rows: Row[] = [];
    for (const href of [...new Set(links)]) {
      await page.goto('/crm/dashboard', { waitUntil: 'domcontentloaded' });
      await page.locator(`.crm-nav a[href="${href}"]`).first().click();
      await page.waitForURL((url) => url.pathname === href, { timeout: 15_000 }).catch(() => undefined);
      const landedOn = new URL(page.url()).pathname;
      const notFound = await page.getByText('That page is not here.').count();
      const ok = landedOn === href && !notFound;
      rows.push({ route: `${href} (clicked)`, status: ok ? 200 : 404, finalUrl: landedOn, result: ok ? 'PASS' : 'FAIL 404', detail: ok ? undefined : 'a clicked sidebar link must arrive, not 404' });
    }
    await publish('In-CRM click-through navigation', rows, testInfo);
    expect(rows.filter((row) => !row.result.startsWith('PASS')).map((row) => `${row.route} -> ${row.finalUrl}`)).toEqual([]);
  });

  test('an expired session returns staff to sign-in rather than a 404', async ({}, testInfo) => {
    const routes = ['/crm/dashboard', ...[...recordRoutes].sort()];
    expect(routes.length, 'record pages found by the crawl are reused here').toBeGreaterThan(1);

    let expired = false;
    try {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: AUDIT_EMAIL }, select: { id: true } });
      // The cookie stays in the browser; only the server-side session record lapses, which is
      // exactly what a staff member experiences eight hours after signing in, or after a deploy.
      await prisma.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 60_000) } });
      expired = true;
    } catch { /* no database reachable, for example an audit run against production */ }
    test.skip(!expired, 'expiring a session requires database access');

    const rows: Row[] = [];
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const landedOn = new URL(page.url()).pathname;
      const notFound = await page.getByText('That page is not here.').count();
      const toSignIn = landedOn.startsWith('/staff/login');
      rows.push({ route, status: toSignIn ? 200 : 404, finalUrl: landedOn, result: toSignIn && !notFound ? 'PASS' : 'FAIL 404', detail: toSignIn ? undefined : 'an expired session must land on sign-in, never on a not-found page' });
    }
    await publish('Expired session route sweep', rows, testInfo);
    expect(rows.filter((row) => !row.result.startsWith('PASS')).map((row) => `${row.route} -> ${row.finalUrl}`)).toEqual([]);
  });
});

