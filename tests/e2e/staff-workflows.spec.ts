import { test, expect, type Page } from '@playwright/test';
import { prisma, resetStaffMfa } from './db-reset';
import { ADMIN_EMAIL, enterCredentials, completeMfaEnrollment } from './staff-auth';

test.describe.serial('Staff sign-in and CRM operations', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    await resetStaffMfa(ADMIN_EMAIL);
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
    await prisma.$disconnect();
  });

  test('staff can sign in and enrol multi-factor authentication', async () => {
    await enterCredentials(page);
    await completeMfaEnrollment(page);
    await expect(page.getByRole('heading', { name: 'Good morning, team' })).toBeVisible();
  });

  test('referrals: list, open a record, and record an audited status change', async () => {
    await page.goto('/crm/referrals');
    const referralLink = page.getByRole('link', { name: 'SN-2607-001' });
    await expect(referralLink).toBeVisible();
    await referralLink.click();
    await expect(page).toHaveURL(/\/crm\/referrals\//);
    await expect(page.getByRole('heading', { name: 'A. Morgan' })).toBeVisible();
    await page.getByLabel('Reason for change').fill('Playwright staff-workflow coverage: automated status progression.');
    await page.getByRole('button', { name: /Save status change/ }).click();
    await expect(page.getByText('Status change saved and audited.')).toBeVisible();
  });

  test('tasks: create a task and progress an existing one', async () => {
    await page.goto('/crm/tasks');
    const taskTitle = `Playwright coverage task ${Date.now()}`;
    await page.getByLabel('Task', { exact: true }).fill(taskTitle);
    await page.getByRole('button', { name: 'Create task' }).click();
    await expect(page.getByText('Task created.')).toBeVisible();
    await expect(page.getByRole('cell', { name: taskTitle })).toBeVisible();

    const seededRow = page.locator('tr', { hasText: 'Call back Northside referral' });
    await seededRow.getByLabel('Task status').selectOption('IN_PROGRESS');
    await expect(seededRow.getByLabel('Task status')).toHaveValue('IN_PROGRESS');
  });

  test('clients: restricted records are marked and open correctly', async () => {
    await page.goto('/crm/clients');
    await expect(page.getByRole('link', { name: 'SN-C-001' })).toBeVisible();
    const restrictedRow = page.locator('tr', { hasText: 'Sofia Taylor' });
    await expect(restrictedRow.locator('[aria-label="Restricted record"]')).toBeVisible();
    await page.getByRole('link', { name: 'SN-C-001' }).click();
    await expect(page).toHaveURL(/\/crm\/clients\//);
  });

  test('staff can sign out and lose CRM access', async () => {
    await page.getByRole('link', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/staff\/login/);
    await page.goto('/crm/dashboard');
    await expect(page).toHaveURL(/\/staff\/login/);
  });
});
