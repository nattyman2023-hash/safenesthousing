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

test('staff login exposes the password reset entry point', async ({ page }) => {
  await page.goto('/staff/login');
  const resetLink = page.getByRole('link', { name: 'Forgot password?' });
  await expect(resetLink).toHaveAttribute('href', '/staff/forgot-password');
  await resetLink.click();
  await expect(page).toHaveURL(/\/staff\/forgot-password$/);
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByLabel('Work email')).toBeVisible();
});
