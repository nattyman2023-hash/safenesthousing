import { test, expect, type Page } from '@playwright/test';
import { prisma, resetStaffSession } from './db-reset';
import { ADMIN_EMAIL, enterCredentials, assertSignedIn } from './staff-auth';
import { waitForHydratedForm } from './hydration';

/**
 * The referral and task steps below used to act on seeded records: the status step walked
 * SN-2607-001 one stage further on every run, so the seeded referral eventually reached a closed
 * status with no permitted transition left and the "Save status change" button stayed disabled
 * forever. Each writable step now creates its own disposable fixture and removes it afterwards,
 * so repeated runs cannot consume the development data.
 */
const TAG = 'playwright-workflow';
const taskTitlePrefix = 'Playwright coverage task';

let organisationId = '';
let serviceId = '';
let referralId = '';
let referralReference = '';

/** Removes this file's disposable records, including anything an interrupted run left behind. */
async function cleanupFixtures() {
  const fixtures = await prisma.referral.findMany({ where: { personName: { startsWith: TAG } }, select: { id: true } });
  const ids = fixtures.map((row) => row.id);
  await prisma.referralStatusHistory.deleteMany({ where: { referralId: { in: ids } } });
  await prisma.referralAssignment.deleteMany({ where: { referralId: { in: ids } } });
  await prisma.referralNote.deleteMany({ where: { referralId: { in: ids } } });
  await prisma.referralRisk.deleteMany({ where: { referralId: { in: ids } } });
  await prisma.referralDocument.deleteMany({ where: { referralId: { in: ids } } });
  await prisma.referral.deleteMany({ where: { id: { in: ids } } });
  await prisma.task.deleteMany({ where: { title: { startsWith: taskTitlePrefix } } });
}

test.describe.serial('Staff sign-in and CRM operations', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL }, select: { organisationId: true } });
    organisationId = admin.organisationId;
    const service = await prisma.service.findFirstOrThrow({ where: { organisationId, published: true }, select: { id: true } });
    serviceId = service.id;
    await cleanupFixtures();

    const referral = await prisma.referral.create({
      data: {
        organisationId,
        serviceId,
        reference: `SN-${TAG.toUpperCase()}-${Date.now().toString().slice(-6)}`,
        status: 'NEW',
        personName: `${TAG} person`,
        referrerName: `${TAG} referrer`,
        referrerOrganisation: 'Automated coverage',
        referrerEmail: 'workflow-fixture@example.test',
        currentLocation: 'Temporary accommodation while a safe place is found.',
        housingSituation: 'Housing has broken down and a safe place is needed.',
        supportNeeds: 'Tenancy support and a stable home.',
        consentGiven: true,
        privacyAcknowledged: true
      }
    });
    referralId = referral.id;
    referralReference = referral.reference;

    await resetStaffSession(ADMIN_EMAIL);
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test('staff can sign in without a second-factor challenge', async () => {
    await enterCredentials(page);
    await assertSignedIn(page);
    await expect(page.getByRole('heading', { name: 'Operations dashboard' })).toBeVisible();
  });

  test('session survives navigation between CRM pages', async () => {
    await page.goto('/crm/dashboard');
    await page.getByRole('link', { name: 'Properties' }).click();
    await expect(page).toHaveURL(/\/crm\/properties/);
    await expect(page.getByRole('heading', { name: 'Properties & occupancy' })).toBeVisible();
  });

  test('referrals: list, open a record, and record an audited status change', async () => {
    await page.goto('/crm/referrals');
    const referralLink = page.getByRole('link', { name: referralReference });
    await expect(referralLink).toBeVisible();
    await referralLink.click();
    await expect(page).toHaveURL(new RegExp(`/crm/referrals/${referralId}$`));
    await expect(page.getByRole('heading', { name: `${TAG} person` })).toBeVisible();
    // The status form is a client component: its submit control is disabled until hydration.
    await waitForHydratedForm(page, '#reason');
    await page.getByLabel('Reason for change').fill('Automated coverage: disposable fixture status progression.');
    await page.getByRole('button', { name: /Save status change/ }).click();
    await expect(page.getByText('Status change saved and audited.')).toBeVisible();

    // The write reached the record, left an auditable history row, and did not touch seeded data.
    const stored = await prisma.referral.findUniqueOrThrow({ where: { id: referralId } });
    expect(stored.status).not.toBe('NEW');
    const history = await prisma.referralStatusHistory.findFirst({ where: { referralId, reason: 'Automated coverage: disposable fixture status progression.' } });
    expect(history?.next).toBe(stored.status);
    const audited = await prisma.auditLog.findFirst({ where: { resourceId: referralId, action: 'REFERRAL_STATUS_CHANGED' } });
    expect(audited).not.toBeNull();
  });

  test('tasks: create a task and progress it', async () => {
    await page.goto('/crm/tasks');
    // One hydration commit covers the whole client root, so waiting on the create form also
    // covers the row status controls; without it a change could be lost before hydration.
    await waitForHydratedForm(page, '#new');
    const taskTitle = `${taskTitlePrefix} ${Date.now()}`;
    await page.getByLabel('Task', { exact: true }).fill(taskTitle);
    await page.getByRole('button', { name: 'Create task' }).click();
    await expect(page.getByText('Task created.')).toBeVisible();
    await expect(page.getByRole('cell', { name: taskTitle })).toBeVisible();

    const ownRow = page.locator('tr', { hasText: taskTitle });
    await ownRow.getByLabel('Task status').selectOption('IN_PROGRESS');
    await expect(ownRow.getByLabel('Task status')).toHaveValue('IN_PROGRESS');
    // The select writes through the API, so assert the stored record changed and not just the DOM.
    await expect
      .poll(async () => (await prisma.task.findFirst({ where: { title: taskTitle } }))?.status)
      .toBe('IN_PROGRESS');
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
