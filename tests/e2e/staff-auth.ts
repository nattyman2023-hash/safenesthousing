import { expect, type Page } from '@playwright/test';

export const ADMIN_EMAIL = 'admin@safenesthousing.co.uk';
export const ADMIN_PASSWORD = 'ChangeMe!123';

export async function enterCredentials(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/staff/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
}

/** Confirms the signed-in user lands on the dashboard. MFA has been removed from the active flow,
 *  so there is no second factor. Reuse the same `page` for subsequent actions rather than logging in
 *  again — the login endpoint is rate-limited (8 attempts / 5 minutes per account) and shared across
 *  the whole e2e run. */
export async function completeMfaEnrollment(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/crm\/dashboard/);
}
