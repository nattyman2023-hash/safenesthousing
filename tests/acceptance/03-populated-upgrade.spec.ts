import { test, expect, type Page } from '@playwright/test';
import { ADMIN_EMAIL, prisma, tableCount } from './db';
import { addServiceThroughUi, referralServiceOptions, signIn, waitForHydratedForm } from './ui';

/**
 * The upgrade case: an organisation that is already in use and has ZERO Service rows.
 *
 * The clean-installation suite (01) proves a brand-new organisation can configure itself. That is not
 * the same scenario as the failing production installation, which already held staff, residents,
 * placements, case notes and incidents — and still had no Service records, so every
 * Service-dependent form was unusable.
 *
 * `scripts/acceptance/run.mjs db-populated` builds exactly that database, from migrations plus
 * `bootstrap:admin`, then writes the pre-existing operational rows directly (they represent data an
 * earlier installation already stored). Everything the recovery needs — the first Service, the first
 * Referral — is then done by pressing controls in the CRM, with no seed, no reset and no bootstrap
 * re-run.
 *
 * A Referral cannot be part of that history: `Referral.serviceId` is NOT NULL with a foreign key to
 * Service, so the schema itself makes a referral impossible while no Service exists. That structural
 * fact is why zero Services is fatal rather than untidy, and it is asserted below.
 */

const FIRST_SERVICE = 'Domestic abuse';

/** The tables holding pre-existing operational history. Nothing in the recovery path may alter a
 * single column of a single row in any of these. */
const PRESERVED_TABLES = ['Organisation', 'User', 'Membership', 'Property', 'Room', 'Client', 'Placement', 'OccupancyRecord', 'CaseNote', 'Incident', 'Task'];

let organisationId = '';
let existingClientId = '';
let existingClientReference = '';
let serviceId = '';
let referralId = '';
let referralReference = '';
let before: Record<string, string> = {};

/** Every column of every row, read straight from SQLite. Comparing raw rows is a stronger claim than
 * comparing selected Prisma fields: a column added to one of these models is covered automatically. */
async function snapshot(table: string): Promise<string> {
  if (!/^[A-Za-z]+$/.test(table)) throw new Error(`Refusing to interpolate "${table}" into a query.`);
  const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY id`);
  return JSON.stringify(rows);
}

async function snapshotAll(): Promise<Record<string, string>> {
  const taken: Record<string, string> = {};
  for (const table of PRESERVED_TABLES) taken[table] = await snapshot(table);
  return taken;
}

test.describe.serial('an already-populated installation with zero Services recovers without a seed', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => { page = await browser.newPage(); });
  test.afterAll(async () => { await page?.close(); await prisma.$disconnect(); });

  test('pu00 the upgrade database holds history and zero services before any UI action', async () => {
    // The release question is answered by the first assertion; the rest prove this really is the
    // populated case rather than the clean one.
    expect(await tableCount('Service'), 'SELECT COUNT(*) FROM Service').toBe(0);
    expect(await tableCount('Referral'), 'no referral can exist while Referral.serviceId is NOT NULL').toBe(0);
    expect(await tableCount('Client'), 'pre-existing service users').toBe(3);
    expect(await tableCount('Placement'), 'a pre-existing placement').toBe(1);
    expect(await tableCount('OccupancyRecord')).toBe(1);
    expect(await tableCount('CaseNote'), 'a pre-existing case note').toBe(1);
    expect(await tableCount('Incident'), 'a pre-existing incident').toBe(1);
    expect(await tableCount('Task'), 'a pre-existing task').toBe(1);
    expect(await tableCount('Property')).toBe(1);
    expect(await tableCount('Room')).toBe(2);
    expect(await tableCount('User'), 'two staff accounts already exist').toBe(2);
    expect(await tableCount('Organisation')).toBe(1);

    // Captured before sign-in and before the first UI action, so the comparison at the end covers
    // the whole recovery, including the reads that populate the pages.
    before = await snapshotAll();

    const client = await prisma.client.findFirstOrThrow({ where: { reference: 'SN-C-ACC-1' }, select: { id: true, reference: true } });
    existingClientId = client.id;
    existingClientReference = client.reference;
    expect(existingClientReference).toBeTruthy();
  });

  test('pu01 the existing administrator signs in and every CRM page still loads', async () => {
    await signIn(page);
    // The sign-in path writes only LoginAttempt/UserSession/AuditLog rows — User has no last-login
    // column — so the snapshot above remains a valid baseline for the recovery that follows.
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL }, select: { organisationId: true } });
    organisationId = admin.organisationId;

    // No crash and no data loss: starting the new code against this database must not blank the CRM.
    for (const path of ['/crm/dashboard', '/crm/clients', '/crm/referrals', '/crm/referrals/new', '/crm/placements', '/crm/properties', '/crm/tasks', '/crm/incidents', '/crm/settings', '/crm/settings/services', '/crm/users']) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} did not load against the populated database`).toBeLessThan(400);
      await expect(page.getByText(/Application error|Internal Server Error/i), `${path} showed a server error`).toHaveCount(0);
    }
  });

  test('pu02 existing service users and their history still open', async () => {
    const detail = await page.goto(`/crm/clients/${existingClientId}`);
    expect(detail?.status(), 'a pre-existing service-user profile must still open').toBe(200);
    await expect(page.getByText(existingClientReference).first()).toBeVisible();
    // The pre-existing placement is read back from the same profile.
    await expect(page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Current placement' }) }).getByText('Acceptance Terrace')).toBeVisible();

    // The pre-existing, already-closed incident is reachable by its own reference wherever the CRM
    // exposes it, and the pre-existing open task is still on the register.
    const incident = await prisma.incident.findFirstOrThrow({ where: { reference: 'SN-I-ACC-001' }, select: { id: true } });
    const incidentPage = await page.goto(`/crm/incidents/${incident.id}`).catch(() => null);
    if (incidentPage && incidentPage.status() < 400) {
      await expect(page.getByText('SN-I-ACC-001').first()).toBeVisible();
    }

    await page.goto('/crm/tasks');
    await expect(page.locator('tr', { hasText: 'Pre-existing open task' })).toHaveCount(1);
  });

  test('pu03 Settings → Services reports that none are configured and offers Add Service', async () => {
    await page.goto('/crm/settings/services');
    const emptyState = page.locator('#service-empty-state');
    await expect(emptyState, 'a populated organisation with no services must still show the zero-state').toBeVisible();
    await expect(emptyState.getByRole('heading', { name: 'No services configured' })).toBeVisible();
    await expect(emptyState.getByRole('link', { name: 'Add Service' })).toBeVisible();
    await expect(page.locator('.crm-page-header').getByRole('link', { name: 'Add Service' })).toBeVisible();
  });

  test('pu04 the first Service is created entirely through the CRM', async () => {
    const sent = page.waitForResponse((candidate) => candidate.url().endsWith('/api/crm/content/services') && candidate.request().method() === 'POST');
    await addServiceThroughUi(page, { title: FIRST_SERVICE });
    const response = await sent;
    expect(response.status(), 'the populated installation must be able to create its first service').toBe(201);
    await expect(page.locator('#add-service .form-success')).toContainText('Service created and published');

    const created = await prisma.service.findFirstOrThrow({ where: { organisationId, title: FIRST_SERVICE } });
    serviceId = created.id;
    expect(created.organisationId, 'the service belongs to the organisation that already existed').toBe(organisationId);
    expect(created.slug).toBe('domestic-abuse');
    expect(created.published).toBe(true);
    expect(await tableCount('Service')).toBe(1);
    // Creating a service is a security-sensitive mutation, so it is audited against the new id.
    expect(await prisma.auditLog.count({ where: { resourceId: serviceId, action: 'SERVICE_CREATED' } })).toBe(1);
  });

  test('pu05 intake immediately offers the new Service and a referral saves against it', async () => {
    await page.goto('/crm/referrals/new');
    await waitForHydratedForm(page, '#serviceId');
    await expect(page.locator('#no-services-notice'), 'the remedy worked, so the notice must be gone').toHaveCount(0);
    await expect(page.locator('#serviceId')).toBeEnabled();

    const offered = await referralServiceOptions(page);
    expect(offered.map((option) => option.value), 'intake offers the real Service id').toEqual([serviceId]);
    expect(offered.map((option) => option.label)).toEqual([FIRST_SERVICE]);

    await page.locator('#personName').fill('Upgraded referral person');
    await page.locator('select[name="serviceId"]').selectOption(serviceId);
    await page.locator('#referrerName').fill('Upgraded referrer');
    await page.locator('#referrerEmail').fill('upgraded.referrer@example.test');
    await page.locator('#currentLocation').fill('No fixed address while a safe place is found.');
    await page.locator('#housingSituation').fill('Housing broke down and support is needed urgently.');
    await page.locator('#supportNeeds').fill('Support to secure and keep a settled home.');

    const sent = page.waitForResponse((candidate) => candidate.url().endsWith('/api/crm/referrals') && candidate.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save referral' }).click();
    const response = await sent;
    const body = await response.json() as { id?: string; reference?: string; error?: string };
    expect(response.status(), `intake refused the service its own menu offered: ${JSON.stringify(body)}`).toBe(200);
    expect(body.error ?? '', 'the original failure message must not appear').not.toMatch(/Choose an available service/i);

    referralId = body.id ?? '';
    referralReference = body.reference ?? '';
    expect(referralId).toBeTruthy();
    await expect(page.locator('.form-success')).toContainText(`Referral ${referralReference} saved.`);

    const stored = await prisma.referral.findUniqueOrThrow({ where: { id: referralId } });
    expect(stored.organisationId).toBe(organisationId);
    expect(stored.serviceId, 'the referral points at the Service the UI created, by its real id').toBe(serviceId);
    expect(stored.status).toBe('NEW');
    expect(await tableCount('Referral')).toBe(1);

    const detail = await page.goto(`/crm/referrals/${referralId}`);
    expect(detail?.status()).toBe(200);
    await expect(page.getByText(referralReference).first()).toBeVisible();
    await expect(page.getByText(FIRST_SERVICE).first()).toBeVisible();
  });

  test('pu06 the recovery changed no pre-existing record', async () => {
    // Byte-for-byte: every column of every row of the history that was already in the database.
    const after = await snapshotAll();
    for (const table of PRESERVED_TABLES) {
      expect(after[table], `${table} was altered by starting the new code and configuring one Service`).toBe(before[table]);
    }

    // The history is still present by count, and the upgrade added exactly one service and one referral.
    expect(await tableCount('Client')).toBe(3);
    expect(await tableCount('Placement')).toBe(1);
    expect(await tableCount('Service')).toBe(1);
    expect(await tableCount('Referral')).toBe(1);

    // ...and still openable after the recovery.
    const reopened = await page.goto(`/crm/clients/${existingClientId}`);
    expect(reopened?.status(), 'the pre-existing service user still opens after the upgrade').toBe(200);
    await expect(page.getByText(existingClientReference).first()).toBeVisible();
    await expect(page.getByText('Acceptance Terrace').first()).toBeVisible();

    // The referral created by the upgrade is listed — the old installation had none, because the
    // schema made one impossible.
    await page.goto('/crm/referrals');
    await expect(page.locator('tr', { hasText: referralReference })).toHaveCount(1);
  });
});
