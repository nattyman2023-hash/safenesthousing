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
