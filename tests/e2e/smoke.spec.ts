import { test, expect } from '@playwright/test';

test('public visitor can move through the referral path', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A safe place to land/i })).toBeVisible();
  await page.getByRole('link', { name: /Make a referral/i }).first().click();
  await expect(page).toHaveURL(/\/referrals$/);
  await expect(page.getByRole('heading', { name: /next step together/i })).toBeVisible();
});

test('logged-out visitors are sent to staff login for the CRM', async ({ page }) => {
  await page.goto('/crm/dashboard');
  await expect(page).toHaveURL(/\/staff\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('logged-out CRM RSC navigation redirects without an auth server error', async ({ request }) => {
  const response = await request.get('/crm/properties?_rsc=test', { headers: { RSC: '1' } });
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain('NEXT_REDIRECT;replace;/staff/login;307;');
  expect(body).not.toContain('AUTH_REQUIRED');
});

test('staff login exposes the password reset entry point', async ({ page }) => {
  await page.goto('/staff/login');
  const resetLink = page.getByRole('link', { name: 'Forgot password?' });
  await expect(resetLink).toHaveAttribute('href', '/staff/forgot-password');
  await resetLink.click();
  await expect(page).toHaveURL(/\/staff\/forgot-password$/);
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByLabel('Work email')).toBeVisible();
});

test('staff login keeps normal HTML separate from explicit RSC responses', async ({ request }) => {
  const normal = await request.get('/staff/login');
  expect(normal.status()).toBe(200);
  expect(normal.headers()['content-type']).toContain('text/html');
  expect(normal.headers()['cache-control']).toContain('no-cache');
  expect(normal.headers()['cache-control']).not.toContain('s-maxage');
  expect(normal.headers()['vary']).toContain('rsc');
  expect(await normal.text()).toMatch(/^<!DOCTYPE html>/);

  const rsc = await request.get('/staff/login?_rsc=test', { headers: { RSC: '1' } });
  expect(rsc.status()).toBe(200);
  expect(rsc.headers()['content-type']).toContain('text/x-component');
  expect(rsc.headers()['vary']).toContain('rsc');
  expect(await rsc.text()).toMatch(/^\d+:/);

  const queryOnly = await request.get('/staff/login?_rsc=test');
  expect(queryOnly.headers()['content-type']).toContain('text/html');
});
