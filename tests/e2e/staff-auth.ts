import { expect, type Page } from '@playwright/test';
import { computeTotp } from './totp';

export const ADMIN_EMAIL = 'admin@safenest.test';
export const ADMIN_PASSWORD = 'ChangeMe!123';

export async function enterCredentials(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/staff/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
}

/** Logs in once and enrols MFA. Call this a single time per authenticated session — reuse the
 * same `page` for subsequent actions rather than logging in again, since the login endpoint is
 * rate-limited (8 attempts / 5 minutes per account) and shared across the whole e2e run. */
export async function completeMfaEnrollment(page: Page) {
  await expect(page).toHaveURL(/\/staff\/mfa\?setup=1/);
  const secretLocator = page.locator('[role="status"] strong').first();
  await expect(secretLocator).toBeVisible();
  const secret = (await secretLocator.textContent())?.trim();
  if (!secret) throw new Error('MFA setup did not return a secret to enrol.');
  await page.getByLabel(/Authenticator or recovery code/i).fill(computeTotp(secret));
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Safe Nest' }).click();
  await expect(page).toHaveURL(/\/crm\/dashboard/);
  return secret;
}
