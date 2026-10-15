import { expect, type Page } from '@playwright/test';
import { waitForHydratedForm } from './hydration';

export const ADMIN_EMAIL = 'admin@safenesthousing.co.uk';
export const ADMIN_PASSWORD = 'ChangeMe!123';

export async function enterCredentials(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/staff/login');
  // Sign-in is a React client form: its submit control stays disabled until
  // hydration, so wait for the form to be interactive rather than for a network
  // lull that says nothing about React ownership.
  await waitForHydratedForm(page, '#password');
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
}

/** Confirms the single authenticated state lands on the dashboard. */
export async function assertSignedIn(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/crm\/dashboard/);
}
