import { expect, type Page } from '@playwright/test';

export const ADMIN_EMAIL = 'admin@safenesthousing.co.uk';
export const ADMIN_PASSWORD = 'ChangeMe!123';

export async function enterCredentials(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/staff/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
}

/** Confirms the single authenticated state lands on the dashboard. */
export async function assertSignedIn(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/crm\/dashboard/);
}
