import { test, expect, type Page } from '@playwright/test';
import { prisma, resetStaffMfa } from './db-reset';
import { ADMIN_EMAIL, enterCredentials, completeMfaEnrollment } from './staff-auth';

test.describe.serial('Incidents, rota, and document storage', () => {
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
    await expect(page).toHaveURL(/\/crm\/dashboard/);
  });

  test('incidents: add an update and a follow-up action to a restricted incident', async () => {
    await page.goto('/crm/incidents');
    const incidentLink = page.getByRole('link', { name: 'INC-2607-018' });
    await expect(incidentLink).toBeVisible();
    await incidentLink.click();
    await expect(page).toHaveURL(/\/crm\/incidents\//);

    const updateText = `Playwright coverage update ${Date.now()}`;
    await page.getByLabel('Update').fill(updateText);
    await page.getByRole('button', { name: 'Save update' }).click();
    await expect(page.getByText('Incident update saved.')).toBeVisible();
    await expect(page.getByText(updateText)).toBeVisible();

    const actionText = `Playwright coverage action ${Date.now()}`;
    await page.getByLabel('Action', { exact: true }).fill(actionText);
    await page.getByRole('button', { name: 'Add action' }).click();
    await expect(page.getByText('Follow-up action added.')).toBeVisible();
    await expect(page.getByText(actionText)).toBeVisible();
  });

  test('rota: create a shift with no property, service, or assignee selected', async () => {
    await page.goto('/crm/rota');
    const shiftType = `Playwright coverage shift ${Date.now()}`;
    await page.getByLabel('Shift type').fill(shiftType);
    await page.getByLabel('Starts').fill('2026-08-01T09:00');
    await page.getByLabel('Ends').fill('2026-08-01T17:00');
    // Property, service, and assignee are deliberately left at their "No property" / "No service" /
    // "Unfilled" defaults — this previously sent empty-string foreign keys straight to Prisma and 500'd.
    await page.getByRole('button', { name: 'Create shift' }).click();
    await expect(page.getByText('Shift created.')).toBeVisible();
    await expect(page.getByRole('cell', { name: shiftType })).toBeVisible();
  });

  test('documents: upload a private document', async () => {
    await page.goto('/crm/documents');
    const fileName = `playwright-coverage-${Date.now()}.txt`;
    await page.setInputFiles('#document-file', {
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from('Playwright e2e coverage upload — fictional test content, no real record.', 'utf-8')
    });
    await page.getByLabel('Category', { exact: true }).fill('Compliance');
    await page.getByRole('button', { name: 'Upload document' }).click();
    await expect(page.getByText(`${fileName} uploaded.`)).toBeVisible();
    await expect(page.getByRole('cell', { name: fileName, exact: true })).toBeVisible();
  });
});
