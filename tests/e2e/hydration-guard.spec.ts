import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './staff-auth';
import { waitForHydratedForm } from './hydration';

// A password that must never leave the request body: if any of these tests fail, the value
// could be sitting in browser history, a reverse-proxy log, or a monitoring dashboard.
const PROBE_PASSWORD = 'Playwright-probe-never-in-url';

test.describe('Pre-hydration submit guard', () => {
  test('the served sign-in form is inert before hydration: disabled submit control, POST fallback', async ({ request }) => {
    const response = await request.get('/staff/login');
    expect(response.status()).toBe(200);
    const html = await response.text();
    // The submit control is disabled in the server-rendered markup, so a click in the window
    // before React owns the form cannot submit anything at all.
    expect(html).toMatch(/<button class="button button-primary"[^>]*disabled[^>]*>/);
    // And if a submit did happen anyway (script failure, JavaScript unavailable), the form can
    // only POST. A GET would append the credentials to the URL.
    expect(html).toMatch(/<form method="post">/);
    expect(html).not.toMatch(/<form[^>]*method="get"/);
    // The password field itself is unchanged — it is only ever read by React's fetch call.
    expect(html).toContain('name="password"');
  });

  test('a native POST to the sign-in page re-renders the form instead of echoing credentials', async ({ request }) => {
    const response = await request.post('/staff/login', { form: { email: ADMIN_EMAIL, password: PROBE_PASSWORD } });
    expect(response.status()).toBeLessThan(500);
    // No session is created and nothing sensitive is echoed back.
    expect(response.headers()['set-cookie'] ?? '').not.toContain('safe_nest_session');
    expect(await response.text()).not.toContain(PROBE_PASSWORD);
  });

  test.describe('with JavaScript unavailable (the widest pre-hydration window)', () => {
    test.use({ javaScriptEnabled: false });

    test('attempting to submit cannot put credentials in the URL', async ({ page, baseURL }) => {
      const requested: string[] = [];
      page.on('request', (request) => requested.push(request.url()));

      await page.goto('/staff/login');
      const form = page.locator('form:has(#password)');
      await expect(form).toHaveAttribute('method', 'post');
      // Attribute-level check: the server-rendered markup already disables the control.
      await expect(page.locator('form button.button-primary')).toHaveAttribute('disabled', '');

      await page.locator('#email').fill(ADMIN_EMAIL);
      await page.locator('#password').fill(PROBE_PASSWORD);
      await page.locator('#password').press('Enter'); // implicit submission attempt
      await page.locator('form button.button-primary').click({ force: true }); // direct activation attempt
      // A short settle gives any native navigation the chance to happen before asserting the negative.
      await page.waitForTimeout(750);

      expect(page.url()).not.toContain('password');
      expect(page.url()).not.toContain('email');
      expect(page.url().startsWith(baseURL ?? '')).toBe(true);
      expect(requested.filter((url) => url.includes('password=') || url.includes('email='))).toEqual([]);
    });
  });

  test('sign-in still works normally once the client form has hydrated', async ({ page }) => {
    await page.goto('/staff/login');
    await waitForHydratedForm(page, '#password');

    const submit = page.getByRole('button', { name: 'Sign in securely' });
    await expect(submit).toBeEnabled();
    await page.getByLabel('Work email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await submit.click();

    await expect(page).toHaveURL(/\/crm\/dashboard/);
    expect(page.url()).not.toContain('password');
    // The credential only ever reaches the session cookie, which is HTTP-only.
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === 'safe_nest_session' && cookie.httpOnly)).toBe(true);
  });
});
