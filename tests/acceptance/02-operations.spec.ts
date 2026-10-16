import { test, expect, type Page } from '@playwright/test';
import { prisma, tableCount } from './db';
import { signIn, waitForHydratedForm } from './ui';

/**
 * Operational records on the same clean database.
 *
 * The zero-service suite proves intake can be restored. This one proves the rest of the CRM is
 * operable from the same empty installation: a property, a room, a service user, a placement and a
 * task, each created by pressing a control and each verified in the database, with the detail pages
 * opened afterwards because a list row is not evidence that navigation works.
 *
 * Nothing here is seeded. The property, room, service user, placement and task all come into
 * existence through the interface.
 */

const TAG = 'Acceptance';

let organisationId = '';
let propertyId = '';
let roomId = '';
let clientId = '';
let clientReference = '';
let placementId = '';
let taskId = '';

test.describe.serial('operational records can be created on the clean database', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => { page = await browser.newPage(); });
  test.afterAll(async () => { await page?.close(); await prisma.$disconnect(); });

  test('op01 sign in', async () => {
    await signIn(page);
    const admin = await prisma.user.findFirstOrThrow({ where: { active: true }, select: { organisationId: true } });
    organisationId = admin.organisationId;
  });

  test('op02 a property and a room are created through the UI', async () => {
    expect(await tableCount('Property'), 'the clean database starts with no properties').toBe(0);
    await page.goto('/crm/properties');
    await waitForHydratedForm(page, '#prop-name');

    await page.locator('#prop-name').fill(`${TAG} Terrace`);
    await page.locator('#prop-neighbourhood').fill('Northside');
    await page.locator('#prop-type').fill('Supported accommodation');
    await page.locator('#prop-capacity').fill('2');
    await page.locator('#prop-vacancy').fill('2 rooms available');
    await page.locator('#prop-summary').fill('A property created by the acceptance run to prove housing operations work from an empty installation.');
    await page.locator('#prop-eligibility').fill('People who need supported accommodation.');

    const sent = page.waitForResponse((candidate) => candidate.url().endsWith('/api/crm/properties') && candidate.request().method() === 'POST');
    await page.getByRole('button', { name: 'Add property' }).click();
    expect((await sent).status()).toBe(200);
    await expect(page.locator('form#new .form-success')).toContainText('Property added to the portfolio.');

    const property = await prisma.property.findFirstOrThrow({ where: { organisationId, publicName: `${TAG} Terrace` } });
    propertyId = property.id;
    expect(property.capacity).toBe(2);
    expect(await tableCount('Property')).toBe(1);

    // A room, from the property's own page.
    await page.goto(`/crm/properties/${propertyId}`);
    await waitForHydratedForm(page, '#room-label');
    await page.locator('#room-label').fill('Room 1');
    await page.locator('#room-status').selectOption('AVAILABLE');
    const roomSent = page.waitForResponse((candidate) => candidate.url().endsWith('/api/crm/rooms') && candidate.request().method() === 'POST');
    await page.getByRole('button', { name: 'Add room' }).click();
    expect((await roomSent).status()).toBe(200);
    await expect(page.locator('form#room .form-success')).toContainText('Room added.');

    const room = await prisma.room.findFirstOrThrow({ where: { propertyId, label: 'Room 1' } });
    roomId = room.id;
    expect(room.status).toBe('AVAILABLE');
    expect(await tableCount('Room')).toBe(1);
  });

  test('op03 a service user is created through the UI', async () => {
    await page.goto('/crm/clients');
    await waitForHydratedForm(page, '#cli-name');
    await page.locator('#cli-name').fill(`${TAG} placement resident`);
    // The create form's own status control defaults to Waitlist; a placement needs an active record.
    await page.locator('#cli-status').selectOption('CURRENT');
    await page.getByRole('button', { name: 'Add client' }).click();
    await expect(page.locator('.form-success')).toContainText('added.');

    const client = await prisma.client.findFirstOrThrow({ where: { organisationId, displayName: `${TAG} placement resident` } });
    clientId = client.id;
    clientReference = client.reference;
    expect(client.status).toBe('CURRENT');

    const detail = await page.goto(`/crm/clients/${clientId}`);
    expect(detail?.status()).toBe(200);
    await expect(page.getByText(clientReference).first()).toBeVisible();
  });

  test('op04 a placement is created through the UI and its detail page opens', async () => {
    expect(await tableCount('Placement'), 'the clean database starts with no placements').toBe(0);
    await page.goto('/crm/placements');
    await waitForHydratedForm(page, '#placement-client');

    // With a client, a property and an available room in place, the control is live again — the same
    // form was asserted disabled in the zero-service suite when none of them existed.
    const create = page.locator('form#new').getByRole('button', { name: 'Create placement' });
    await expect(create).toBeEnabled();
    await page.locator('#placement-client').selectOption(clientId);
    await page.locator('#placement-property').selectOption(propertyId);
    await page.locator('#placement-room').selectOption(roomId);
    await page.locator('#placement-start').fill(new Date().toISOString().slice(0, 10));
    await page.locator('#placement-tenancy').fill(`${TAG}-TENANCY-1`);

    const sent = page.waitForResponse((candidate) => candidate.url().endsWith('/api/crm/placements') && candidate.request().method() === 'POST');
    await create.click();
    const response = await sent;
    const body = await response.json() as { error?: string };
    expect(response.status(), `the placement was refused: ${JSON.stringify(body)}`).toBe(200);
    await expect(page.locator('form#new .form-success')).toContainText('Placement created and room marked occupied.');

    const placement = await prisma.placement.findFirstOrThrow({ where: { tenancyRef: `${TAG}-TENANCY-1` } });
    placementId = placement.id;
    expect(placement.clientId).toBe(clientId);
    expect(placement.propertyId).toBe(propertyId);
    expect(placement.roomId).toBe(roomId);
    expect(placement.status).toBe('ACTIVE');
    expect((await prisma.room.findUniqueOrThrow({ where: { id: roomId } })).status, 'the room is occupied by the placement').toBe('OCCUPIED');
    expect(await tableCount('Placement')).toBe(1);

    // The register lists it and the detail page opens — both were 404s before the route existed.
    await page.goto('/crm/placements');
    const row = page.locator('tbody tr', { hasText: clientReference });
    await expect(row).toHaveCount(1);
    const detail = await page.goto(`/crm/placements/${placementId}`);
    expect(detail?.status(), 'the placement detail route must exist').toBe(200);
    await expect(page.getByText(clientReference).first()).toBeVisible();
    await expect(page.getByText(`${TAG} Terrace`).first()).toBeVisible();

    // The service user's profile reads the same placement back.
    await page.goto(`/crm/clients/${clientId}`);
    await expect(page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Current placement' }) }).getByText(`${TAG} Terrace`)).toBeVisible();
  });

  test('op05 a task is created through the UI and opens', async () => {
    expect(await tableCount('Task'), 'the clean database starts with no tasks').toBe(0);
    await page.goto('/crm/tasks');
    await waitForHydratedForm(page, '#task-title');
    await page.locator('#task-title').fill(`${TAG} follow-up call`);
    await page.locator('#task-description').fill('Created by the acceptance run against an empty installation.');
    await page.locator('#task-priority').selectOption('HIGH');
    await page.locator('#task-due').fill(new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10));

    const sent = page.waitForResponse((candidate) => candidate.url().endsWith('/api/crm/tasks') && candidate.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create task' }).click();
    expect((await sent).status()).toBe(200);
    await expect(page.locator('form#new .form-success')).toContainText('Task created.');

    const task = await prisma.task.findFirstOrThrow({ where: { organisationId, title: `${TAG} follow-up call` } });
    taskId = task.id;
    expect(task.priority).toBe('HIGH');
    expect(task.status).toBe('OPEN');
    expect(await tableCount('Task')).toBe(1);

    await page.goto('/crm/tasks');
    await expect(page.locator('tr', { hasText: `${TAG} follow-up call` })).toHaveCount(1);
    const detail = await page.goto(`/crm/tasks/${taskId}`);
    expect(detail?.status(), 'the task detail route must exist').toBe(200);
    await expect(page.getByText(`${TAG} follow-up call`).first()).toBeVisible();
  });
});

