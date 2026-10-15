import { test, expect, type Page } from '@playwright/test';
import { prisma, resetStaffSession } from './db-reset';
import { ADMIN_EMAIL, enterCredentials, assertSignedIn } from './staff-auth';
import { waitForHydratedForm, waitForReactOwnership } from './hydration';

/**
 * Placement navigation and lifecycle.
 *
 * Two failures are covered here, both of which reached a real user:
 *
 *  - every placement link was a 404, because the /crm/placements/[id] route did not exist at all;
 *  - there was no way to correct a placement created by mistake.
 *
 * Every record this file touches is a disposable fixture created here and deleted afterwards, so the
 * suite never edits or removes seeded data. The identifiers are namespaced and the cleanup runs even
 * when a test fails.
 */

const TAG = 'e2e-placement-lifecycle';
const today = new Date();
const daysAgo = (days: number) => new Date(today.getTime() - days * 86_400_000);
const day = (value: Date) => value.toISOString().slice(0, 10);

type Fixture = {
  clientId: string;
  reference: string;
  placementId: string;
  roomId: string;
  propertyId: string;
};

let organisationId = '';
const fixtures: Fixture[] = [];

async function createFixture(suffix: string, options: { status?: string; roomLabel: string; startDate: Date; endDate?: Date | null; checklists?: number } = { roomLabel: 'Room 1', startDate: daysAgo(30) }): Promise<Fixture> {
  const status = options.status ?? 'ACTIVE';
  const endDate = options.endDate === undefined ? (status === 'ACTIVE' ? null : daysAgo(1)) : options.endDate;
  const property = await prisma.property.upsert({
    where: { organisationId_slug: { organisationId, slug: `${TAG}-${suffix}` } },
    update: {},
    create: { organisationId, publicName: `${TAG} property ${suffix}`, slug: `${TAG}-${suffix}`, neighbourhood: 'E2E', serviceType: 'Supported accommodation', publicSummary: 'Disposable fixture property.', eligibility: 'Test fixture only.', capacity: 2, publicVacancyState: '2 rooms available', confidential: false }
  });
  const room = await prisma.room.upsert({
    where: { propertyId_label: { propertyId: property.id, label: options.roomLabel } },
    update: { status: status === 'ACTIVE' ? 'OCCUPIED' : 'AVAILABLE' },
    create: { propertyId: property.id, label: options.roomLabel, status: status === 'ACTIVE' ? 'OCCUPIED' : 'AVAILABLE' }
  });
  const client = await prisma.client.upsert({
    where: { reference: `SN-C-${TAG}-${suffix}` },
    update: {},
    create: { organisationId, reference: `SN-C-${TAG}-${suffix}`, displayName: `${TAG} resident ${suffix}`, status: 'CURRENT', contactFrequencyDays: 7, safeWellFrequencyDays: 30 }
  });
  const placement = await prisma.placement.create({
    data: { clientId: client.id, propertyId: property.id, roomId: room.id, status, startDate: options.startDate, endDate, tenancyRef: `${TAG}-${suffix}` }
  });
  await prisma.occupancyRecord.create({
    data: { propertyId: property.id, roomId: room.id, clientId: client.id, placementId: placement.id, startDate: options.startDate, endDate: status === 'ACTIVE' ? null : endDate }
  });
  for (let index = 0; index < (options.checklists ?? 0); index += 1) {
    await prisma.moveChecklist.create({
      data: { clientId: client.id, placementId: placement.id, checklistType: 'MOVE_IN', status: 'COMPLETED', completedAt: options.startDate, propertyId: property.id, notes: `${TAG} worked move ${index + 1}` }
    });
  }
  const fixture: Fixture = { clientId: client.id, reference: client.reference, placementId: placement.id, roomId: room.id, propertyId: property.id };
  fixtures.push(fixture);
  return fixture;
}

async function cleanupFixtures() {
  for (const fixture of fixtures) {
    await prisma.occupancyRecord.deleteMany({ where: { placementId: fixture.placementId } });
    await prisma.moveChecklist.deleteMany({ where: { placementId: fixture.placementId } });
    await prisma.placement.deleteMany({ where: { id: fixture.placementId } });
    await prisma.room.deleteMany({ where: { id: fixture.roomId } });
    await prisma.property.deleteMany({ where: { id: fixture.propertyId } });
  }
  // Only this file's own clients, found by their namespaced reference, are removed.
  await prisma.client.deleteMany({ where: { reference: { startsWith: `SN-C-${TAG}-` } } });
}

test.describe.serial('Placement navigation and lifecycle', () => {
  let page: Page;
  let live: Fixture;
  let ended: Fixture;
  let toEnd: Fixture;
  let toRemove: Fixture;
  let toCorrect: Fixture;

  test.beforeAll(async ({ browser }) => {
    const organisation = await prisma.organisation.findFirstOrThrow({ select: { id: true } });
    organisationId = organisation.id;
    live = await createFixture('live', { roomLabel: 'Room L', startDate: daysAgo(40) });
    ended = await createFixture('history', { status: 'MOVED_OUT', roomLabel: 'Room H', startDate: daysAgo(400), endDate: daysAgo(120) });
    // One client carries both placements, so the profile has a current card and a history row.
    await prisma.placement.update({ where: { id: ended.placementId }, data: { clientId: live.clientId } });
    await prisma.occupancyRecord.updateMany({ where: { placementId: ended.placementId }, data: { clientId: live.clientId } });
    toEnd = await createFixture('to-end', { roomLabel: 'Room E', startDate: daysAgo(20) });
    toRemove = await createFixture('to-remove', { roomLabel: 'Room R', startDate: daysAgo(5) });
    toCorrect = await createFixture('to-correct', { roomLabel: 'Room C', startDate: daysAgo(3), checklists: 1 });

    await resetStaffSession(ADMIN_EMAIL);
    page = await browser.newPage();
    await enterCredentials(page);
    await assertSignedIn(page);
  });

  test.afterAll(async () => {
    await page?.close();
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test('the placement register loads', async () => {
    const response = await page.goto('/crm/placements');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Placements', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Placement register' })).toBeVisible();
  });

  test('a real placement in the register opens its detail page', async () => {
    await page.goto('/crm/placements');
    // The room label is unique to this fixture; the two fixture placements share a service user, so
    // scoping by the reference alone would match the history row as well.
    const row = page.locator('tbody tr', { hasText: 'Room L' });
    await expect(row).toHaveCount(1);
    // The register names the stage in words, so "current" is readable without relying on colour.
    await expect(row.getByText('Current', { exact: true })).toBeVisible();
    await row.getByRole('link', { name: live.reference }).click();
    await expect(page).toHaveURL(new RegExp(`/crm/placements/${live.placementId}$`));
    await expect(page.getByRole('heading', { name: /Placement summary/ })).toBeVisible();
    await expect(page.getByText(live.reference).first()).toBeVisible();
    await expect(page.getByText('Current placement').first()).toBeVisible();
  });

  test('a placement that does not exist is a genuine 404', async () => {
    const response = await page.goto('/crm/placements/not-a-real-placement');
    expect(response?.status()).toBe(404);
    await expect(page.getByText('That page is not here.')).toBeVisible();
  });

  test('the service user profile links to the current placement and to the history', async () => {
    await page.goto(`/crm/clients/${live.clientId}`);
    const currentPanel = page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Current placement' }) });
    await currentPanel.getByRole('link', { name: /Room L/ }).click();
    await expect(page).toHaveURL(new RegExp(`/crm/placements/${live.placementId}$`));

    await page.goto(`/crm/clients/${live.clientId}`);
    const historyPanel = page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Placement history' }) });
    await expect(historyPanel.getByText('Ended placement')).toBeVisible();
    await historyPanel.getByRole('link', { name: /Room H/ }).click();
    await expect(page).toHaveURL(new RegExp(`/crm/placements/${ended.placementId}$`));
  });

  test('a signed-out visit to a placement is sent to sign-in, never to a 404', async ({ browser }) => {
    const context = await browser.newContext();
    const visitor = await context.newPage();
    const response = await visitor.goto(`/crm/placements/${live.placementId}`);
    expect(new URL(visitor.url()).pathname).toBe('/staff/login');
    expect(response?.status()).toBe(200);
    await context.close();
  });

  test('ending a placement keeps the history and frees the room', async () => {
    await page.goto(`/crm/placements/${toEnd.placementId}`);
    await waitForHydratedForm(page, '#placement-end');
    await page.locator('details#end > summary').click();
    await page.getByLabel('Outcome').selectOption('MOVED_OUT');
    await page.getByLabel('End date').fill(day(daysAgo(2)));
    await page.getByLabel('Move-out reason').fill('E2E: resident moved on to an independent tenancy.');
    await page.locator('details#end form').getByRole('button', { name: 'End placement' }).click();
    await expect(page.getByText('Placement ended. It stays in the placement history and the room is released.')).toBeVisible();

    const stored = await prisma.placement.findUniqueOrThrow({ where: { id: toEnd.placementId } });
    expect(stored.status).toBe('MOVED_OUT');
    expect(stored.endDate).not.toBeNull();
    expect(stored.endedReason).toContain('E2E');
    const occupancy = await prisma.occupancyRecord.findFirstOrThrow({ where: { placementId: toEnd.placementId } });
    expect(occupancy.endDate).not.toBeNull();
    expect((await prisma.room.findUniqueOrThrow({ where: { id: toEnd.roomId } })).status).toBe('AVAILABLE');
    const audit = await prisma.auditLog.findFirst({ where: { resourceId: toEnd.placementId, action: 'PLACEMENT_ENDED' } });
    expect(audit).not.toBeNull();

    // The service user's profile now shows the ended stay as history, and nothing as current.
    await page.goto(`/crm/clients/${toEnd.clientId}`);
    const currentPanel = page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Current placement' }) });
    await expect(currentPanel.getByText('No current placement.')).toBeVisible();
    const historyPanel = page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Placement history' }) });
    await expect(historyPanel.getByText('Ended placement')).toBeVisible();
  });

  test('removing an incorrect placement is confirmed, audited and leaves nothing dangling', async () => {
    await page.goto(`/crm/placements/${toRemove.placementId}`);
    await waitForReactOwnership(page, '#remove > summary');
    await page.locator('#remove > summary').click();
    await page.locator('details#remove .inline-control').getByRole('button', { name: 'Remove incorrect placement' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // A one-click delete is not acceptable: the confirmation is required and the reason is mandatory.
    const confirm = dialog.getByRole('button', { name: 'Remove incorrect placement' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Reason').fill('E2E: duplicate placement created in error.');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByText('Incorrect placement removed. Nothing else was deleted and the room has been released.')).toBeVisible();

    expect(await prisma.placement.findUnique({ where: { id: toRemove.placementId } })).toBeNull();
    expect(await prisma.occupancyRecord.count({ where: { placementId: toRemove.placementId } })).toBe(0);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: toRemove.roomId } })).status).toBe('AVAILABLE');
    const audit = await prisma.auditLog.findFirst({ where: { resourceId: toRemove.placementId, action: 'PLACEMENT_REMOVED_IN_ERROR' } });
    expect(audit).not.toBeNull();
    expect(audit?.afterJson ?? '').toContain('duplicate placement created in error');

    // It is gone from the register, and the service user no longer has a current placement.
    await page.goto('/crm/placements');
    await expect(page.locator('tbody tr', { hasText: toRemove.reference })).toHaveCount(0);
    await page.goto(`/crm/clients/${toRemove.clientId}`);
    await expect(page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Current placement' }) }).getByText('No current placement.')).toBeVisible();
  });

  test('a placement with a worked move is protected: it is marked entered in error instead', async () => {
    await page.goto(`/crm/placements/${toCorrect.placementId}`);
    await waitForReactOwnership(page, '#remove > summary');
    await page.locator('#remove > summary').click();
    await page.locator('details#remove .inline-control').getByRole('button', { name: 'Remove incorrect placement' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason').fill('E2E: recorded against the wrong room.');
    await dialog.getByRole('button', { name: 'Remove incorrect placement' }).click();

    // The server refuses the delete and offers the non-destructive correction instead.
    await expect(dialog.getByRole('heading', { name: 'Mark placement as entered in error?' })).toBeVisible();
    await expect(dialog.getByText(/move checklist was worked against this placement/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Mark as entered in error' }).click();
    await expect(page.getByText(/Marked as entered in error/)).toBeVisible();

    const stored = await prisma.placement.findUniqueOrThrow({ where: { id: toCorrect.placementId } });
    expect(stored.status).toBe('ENTERED_IN_ERROR');
    expect(stored.endedReason).toContain('E2E');
    // The move checklist that made the record history is still there, and the room is free.
    expect(await prisma.moveChecklist.count({ where: { placementId: toCorrect.placementId } })).toBe(1);
    expect(await prisma.occupancyRecord.count({ where: { placementId: toCorrect.placementId } })).toBe(1);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: toCorrect.roomId } })).status).toBe('AVAILABLE');
    const audit = await prisma.auditLog.findFirst({ where: { resourceId: toCorrect.placementId, action: 'PLACEMENT_MARKED_ENTERED_IN_ERROR' } });
    expect(audit).not.toBeNull();

    // The register names the stage in words rather than hiding it, and the profile keeps the history.
    await page.goto('/crm/placements');
    const row = page.locator('tbody tr', { hasText: toCorrect.reference });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('Entered in error').first()).toBeVisible();
    await page.goto(`/crm/clients/${toCorrect.clientId}`);
    await expect(page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Current placement' }) }).getByText('No current placement.')).toBeVisible();
    await expect(page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Placement history' }) }).getByText('Entered in error')).toBeVisible();
  });
});

