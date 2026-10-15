import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { resetStaffSession } from './db-reset';
import { ADMIN_EMAIL, ADMIN_PASSWORD, enterCredentials, assertSignedIn } from './staff-auth';
import { waitForReactOwnership } from './hydration';

/**
 * Responsive acceptance for the CRM shell.
 *
 * The shell used to hide the whole navigation below 740px, which left a phone user able to see one
 * page and nothing else - no modules and no way to sign out. These checks state the behaviour that
 * has to hold at each width: the page fits the screen, tables scroll inside their own card rather
 * than dragging the page sideways, and on a phone the drawer exposes every module and sign-out.
 */
const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'laptop-1280x800', width: 1280, height: 800 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'mobile-390x844', width: 390, height: 844 }
];

/** Elements outside a deliberate scroll container that stick out past the viewport. */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth + 1;
    const offenders: string[] = [];
    for (const node of Array.from(document.querySelectorAll('.crm-main *'))) {
      if (node.closest('.table-scroll')) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (rect.right > limit) {
        const name = `${node.tagName.toLowerCase()}${node.className ? `.${String(node.className).split(' ')[0]}` : ''} (right edge ${Math.round(rect.right)} of ${limit - 1})`;
        if (!offenders.includes(name)) offenders.push(name);
      }
      if (offenders.length >= 5) break;
    }
    return offenders;
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('CRM responsive acceptance', () => {
  test.describe.configure({ timeout: 300_000 });
  let page: Page;
  let close: () => Promise<void>;
  let clientPath = '';

  test.beforeAll(async ({ browser }) => {
    await resetStaffSession(ADMIN_EMAIL).catch(() => undefined);
    page = await browser.newPage();
    await enterCredentials(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await assertSignedIn(page);
    await page.goto('/crm/clients', { waitUntil: 'domcontentloaded' });
    clientPath = (await page.locator('a[href^="/crm/clients/"]').first().getAttribute('href')) ?? '';
    close = () => page.close();
  });

  test.afterAll(async () => { await close?.(); });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: pages fit the screen without sideways overflow`, async ({}, testInfo: TestInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const routes = ['/crm/dashboard', '/crm/clients', clientPath, '/crm/calendar', '/crm/tasks', '/crm/reports', '/crm/settings'].filter(Boolean);
      const rows: string[] = [];
      const failures: string[] = [];
      for (const route of routes) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('h1').first()).toBeVisible();
        const offenders = await overflowingElements(page);
        rows.push(`| \`${route}\` | ${offenders.length ? 'FAIL' : 'PASS'} | ${offenders.join('; ') || '-'} |`);
        if (offenders.length) failures.push(`${route}: ${offenders.join('; ')}`);
      }
      await testInfo.attach('overflow', { body: rows.join('\n'), contentType: 'text/plain' });
      expect(failures).toEqual([]);
    });
  }

  test('mobile: the drawer exposes every module and sign-out', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/crm/dashboard', { waitUntil: 'domcontentloaded' });

    const toggle = page.getByRole('button', { name: 'Open navigation' });
    const sidebar = page.locator('#crm-sidebar');
    await expect(toggle).toBeVisible();
    await waitForReactOwnership(page, '.crm-menu-toggle');
    // Closed means closed: not merely moved off-screen, because an off-screen drawer is still a
    // keyboard-reachable drawer.
    expect(await sidebar.evaluate((node) => getComputedStyle(node).visibility)).toBe('hidden');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await sidebar.evaluate((node) => getComputedStyle(node).visibility)).toBe('visible');

    const modules = sidebar.locator('.crm-nav a[href^="/crm"]');
    expect(await modules.count(), 'every module stays reachable on a phone').toBeGreaterThanOrEqual(23);
    await expect(sidebar.getByRole('link', { name: 'Sign out' })).toBeVisible();

    // Choosing a module navigates and closes the drawer, so the destination is actually visible.
    await sidebar.locator('.crm-nav a[href="/crm/tasks"]').click();
    await expect(page).toHaveURL(/\/crm\/tasks$/);
    await expect.poll(() => sidebar.evaluate((node) => getComputedStyle(node).visibility)).toBe('hidden');

    await waitForReactOwnership(page, '.crm-menu-toggle');
    await toggle.click();
    await expect(sidebar).toHaveClass(/is-open/);
    await page.keyboard.press('Escape');
    await expect(sidebar).not.toHaveClass(/is-open/);
  });

  test('desktop: the sidebar stays open with labelled sections and an accurate breadcrumb', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/crm/dashboard', { waitUntil: 'domcontentloaded' });

    const sidebar = page.locator('#crm-sidebar');
    await expect(sidebar).toBeVisible();
    expect(await sidebar.evaluate((node) => getComputedStyle(node).visibility)).toBe('visible');
    await expect(page.locator('.crm-menu-toggle')).toBeHidden();
    expect(await page.locator('.crm-nav .nav-label').allTextContents()).toEqual(['Overview', 'People and care', 'Safety and quality', 'Property and operations', 'Governance']);
    await expect(page.locator('.crm-breadcrumb')).toContainText('Dashboard');
  });

  test('the sidebar marks the current module, including nested record pages', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto('/crm/referrals/new', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.crm-nav a[href="/crm/referrals"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.crm-breadcrumb')).toContainText('Referrals');

    if (clientPath) {
      await page.goto(clientPath, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.crm-nav a[href="/crm/clients"]')).toHaveAttribute('aria-current', 'page');
    }

    await page.goto('/crm/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.crm-nav a[href="/crm/dashboard"]')).toHaveAttribute('aria-current', 'page');
  });
});
