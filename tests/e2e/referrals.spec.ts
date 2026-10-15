import { test, expect, type Page } from '@playwright/test';
import { prisma, resetStaffSession } from './db-reset';
import { ADMIN_EMAIL, enterCredentials, assertSignedIn } from './staff-auth';
import { waitForHydratedForm } from './hydration';

/**
 * Internal referral intake.
 *
 * The failure covered here reached a real user. `/crm/referrals/new` was fed by the public
 * `getServices()` helper, which ignores organisation scope and falls back to the fictional
 * fixture list when the service table has no published rows. The menu therefore offered
 * "Domestic abuse" with the fixture id `domestic-abuse`, while `POST /api/crm/referrals`
 * requires an organisation-scoped, published `Service` row and rejected it with
 * "Choose an available service." — the form offered options its own endpoint refused.
 *
 * The primary assertion is therefore structural, not cosmetic: every option the form shows
 * must be a real service row belonging to the signed-in user's organisation, and every
 * option must be accepted when submitted. Records created here are disposable fixtures,
 * tracked and deleted afterwards; seeded data is never edited or removed.
 */

const TAG = 'e2e-referral-intake';
const FOREIGN_ORGANISATION_ID = `${TAG}-foreign-org`;
const FOREIGN_SERVICE_ID = `${FOREIGN_ORGANISATION_ID}-service`;
const DRAFT_SERVICE_ID = `${TAG}-draft-service`;
const PERSON_NAME = `${TAG} person`;
const REFERRER_EMAIL = 'referral-fixture@example.test';

let organisationId = '';
const createdReferralIds: string[] = [];
/** Services temporarily unpublished by the fresh-install test, always restored. */
const unpublishedServiceIds: string[] = [];

async function restorePublication() {
  if (!unpublishedServiceIds.length) return;
  await prisma.service.updateMany({ where: { id: { in: unpublishedServiceIds } }, data: { published: true } });
  unpublishedServiceIds.length = 0;
}

type ReferralPayload = {
  personName: string;
  serviceId: string;
  referrerName: string;
  referrerEmail: string;
  currentLocation: string;
  housingSituation: string;
  supportNeeds: string;
};

function newPayload(serviceId: string): ReferralPayload {
  return {
    personName: PERSON_NAME,
    serviceId,
    referrerName: `${TAG} referrer`,
    referrerEmail: REFERRER_EMAIL,
    currentLocation: 'Temporary accommodation while a safe place is found.',
    housingSituation: 'Housing has broken down and a safe place is needed urgently.',
    supportNeeds: 'Tenancy support and a stable home.'
  };
}

/** Every model that points at a referral, removed before the referral itself. */
async function deleteReferrals(ids: string[]) {
  if (!ids.length) return;
  await prisma.referralStatusHistory.deleteMany({ where: { referralId: { in: ids } } });
  await prisma.referralAssignment.deleteMany({ where: { referralId: { in: ids } } });
  await prisma.referralNote.deleteMany({ where: { referralId: { in: ids } } });
  await prisma.referralRisk.deleteMany({ where: { referralId: { in: ids } } });
  await prisma.referralDocument.deleteMany({ where: { referralId: { in: ids } } });
  await prisma.client.updateMany({ where: { referralId: { in: ids } }, data: { referralId: null } });
  await prisma.referral.deleteMany({ where: { id: { in: ids } } });
}

/** Removes this file's fixtures, including anything an interrupted run left behind. */
async function cleanupFixtures() {
  // Publication is restored first: the fresh-install test pauses the seeded services, and a
  // failure there must never leave the development database with no published service.
  await restorePublication();
  const leftovers = await prisma.referral.findMany({ where: { personName: { startsWith: TAG } }, select: { id: true } });
  await deleteReferrals([...createdReferralIds, ...leftovers.map((row) => row.id)]);
  createdReferralIds.length = 0;
  await prisma.service.deleteMany({ where: { id: { in: [DRAFT_SERVICE_ID, FOREIGN_SERVICE_ID] } } });
  await prisma.organisation.deleteMany({ where: { id: FOREIGN_ORGANISATION_ID } });
}

/** The service ids the form is actually offering, read from the rendered page. */
async function offeredServiceIds(page: Page): Promise<string[]> {
  return page.locator('select[name="serviceId"] option').evaluateAll((nodes) =>
    nodes
      .map((node) => (node as HTMLOptionElement).value)
      .filter((value) => value !== '')
  );
}

async function signIn(page: Page) {
  await page.goto('/staff/login');
  await waitForHydratedForm(page, '#password');
  await enterCredentials(page);
  await assertSignedIn(page);
}


test.describe.serial('Internal referral intake', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // The signed-in administrator's own organisation, not "the first organisation in the
    // database": a fixture created in somebody else's organisation would be invisible to the
    // very pages under test.
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL }, select: { organisationId: true } });
    organisationId = admin.organisationId;
    await cleanupFixtures();
    await resetStaffSession(ADMIN_EMAIL);
    page = await browser.newPage();
    await signIn(page);
  });

  test.afterAll(async () => {
    await page?.close();
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test('every service the form offers is a real, eligible service in this organisation', async () => {
    const response = await page.goto('/crm/referrals/new');
    expect(response?.status()).toBe(200);
    await waitForHydratedForm(page, '#serviceId');

    const offered = await offeredServiceIds(page);
    // The original failure offered six fictional options against an empty service table; a menu
    // that cannot be submitted is worse than an honest empty state.
    expect(offered.length, 'the referral form offered no service to choose from').toBeGreaterThan(0);

    const rows = await prisma.service.findMany({ where: { id: { in: offered } }, select: { id: true, organisationId: true, published: true } });
    // A fixture id such as `domestic-abuse` has no row, so this is the assertion that would have
    // caught the original defect directly.
    expect(rows.map((row) => row.id).sort()).toEqual([...offered].sort());
    expect(rows.every((row) => row.organisationId === organisationId)).toBe(true);
    expect(rows.every((row) => row.published)).toBe(true);
  });

  test('records a referral against an offered service, and the record is real', async () => {
    await page.goto('/crm/referrals/new');
    await waitForHydratedForm(page, '#serviceId');
    const [serviceId] = await offeredServiceIds(page);
    expect(serviceId, 'no service was offered to submit against').toBeTruthy();

    await page.getByLabel('Person or permitted identifier').fill(PERSON_NAME);
    await page.locator('select[name="serviceId"]').selectOption(serviceId);
    await page.getByLabel('Referrer name').fill(`${TAG} referrer`);
    await page.getByLabel('Referrer email').fill(REFERRER_EMAIL);
    await page.getByLabel('Current location or housing situation').fill('Temporary accommodation while a safe place is found.');
    await page.getByLabel('What is happening now?').fill('Housing has broken down and a safe place is needed urgently.');
    await page.getByLabel('Support needs').fill('Tenancy support and a stable home.');

    const [submission] = await Promise.all([
      page.waitForResponse((candidate) => candidate.url().includes('/api/crm/referrals') && candidate.request().method() === 'POST'),
      page.getByRole('button', { name: 'Save referral' }).click()
    ]);
    const body = (await submission.json()) as { id: string; reference: string };
    createdReferralIds.push(body.id);

    // The exact failure the user reported was a validation error after choosing a service.
    expect(submission.status(), `the endpoint rejected an option the form itself offered: ${JSON.stringify(body)}`).toBe(200);
    await expect(page.locator('.form-success')).toContainText(`Referral ${body.reference} saved.`);
    await expect(page.locator('.form-error')).toHaveCount(0);

    const stored = await prisma.referral.findUniqueOrThrow({ where: { id: body.id }, include: { service: true } });
    expect(stored.organisationId).toBe(organisationId);
    expect(stored.serviceId).toBe(serviceId);
    expect(stored.reference).toBe(body.reference);
    expect(stored.status).toBe('NEW');
    expect(stored.personName).toBe(PERSON_NAME);
    expect(stored.referrerEmail).toBe(REFERRER_EMAIL);
    expect(stored.service.organisationId).toBe(organisationId);
    expect(stored.service.published).toBe(true);
    // Intake writes its own audit trail: the status history and the initial risk record.
    expect(await prisma.referralStatusHistory.count({ where: { referralId: body.id } })).toBe(1);
    expect(await prisma.referralRisk.count({ where: { referralId: body.id } })).toBe(1);

    const detail = await page.goto(`/crm/referrals/${body.id}`);
    expect(detail?.status()).toBe(200);
    await expect(page.getByText(body.reference).first()).toBeVisible();
    await expect(page.getByText(PERSON_NAME).first()).toBeVisible();
  });


  test('a missing service is refused by the browser and by the endpoint', async () => {
    await page.goto('/crm/referrals/new');
    await waitForHydratedForm(page, '#serviceId');
    await page.getByLabel('Person or permitted identifier').fill(PERSON_NAME);
    await page.getByLabel('Referrer name').fill(`${TAG} referrer`);
    await page.getByLabel('Referrer email').fill(REFERRER_EMAIL);
    await page.getByLabel('Current location or housing situation').fill('Temporary accommodation while a safe place is found.');
    await page.getByLabel('What is happening now?').fill('Housing has broken down and a safe place is needed urgently.');
    await page.getByLabel('Support needs').fill('Tenancy support and a stable home.');

    let submissions = 0;
    const countSubmission = (request: { url: () => string; method: () => string }) => { if (request.url().includes('/api/crm/referrals') && request.method() === 'POST') submissions += 1; };
    page.on('request', countSubmission);
    await page.getByRole('button', { name: 'Save referral' }).click();
    await page.waitForTimeout(750);
    page.off('request', countSubmission);

    expect(submissions, 'an empty service selection was submitted').toBe(0);
    expect(await page.locator('#serviceId').evaluate((element: HTMLSelectElement) => element.checkValidity())).toBe(false);
    await expect(page.locator('.form-success')).toHaveCount(0);

    // The server does not rely on the browser: an empty id is refused on its own terms.
    const response = await page.request.post('/api/crm/referrals', { data: newPayload('') });
    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error ?? '').not.toBe('');
  });

  test('an unpublished service is never offered and never accepted', async () => {
    await prisma.service.create({
      data: {
        id: DRAFT_SERVICE_ID,
        organisationId,
        title: `${TAG} draft service`,
        slug: `${TAG}-draft-service`,
        summary: 'Disposable fixture service that is not published.',
        content: 'Disposable fixture content.',
        audience: 'Test fixture only.',
        referralRoutes: 'Test fixture only.',
        eligibility: 'Test fixture only.',
        supportModel: 'Test fixture only.',
        published: false
      }
    });

    await page.goto('/crm/referrals/new');
    await waitForHydratedForm(page, '#serviceId');
    const offered = await offeredServiceIds(page);
    expect(offered).not.toContain(DRAFT_SERVICE_ID);
    expect(await page.getByText(`${TAG} draft service`).count()).toBe(0);

    const response = await page.request.post('/api/crm/referrals', { data: newPayload(DRAFT_SERVICE_ID) });
    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error ?? '').toContain('not published');
  });

  test('a service from another organisation, or a fiction fixture id, is refused', async () => {
    await prisma.organisation.upsert({ where: { id: FOREIGN_ORGANISATION_ID }, update: {}, create: { id: FOREIGN_ORGANISATION_ID, name: 'E2E foreign organisation', slug: FOREIGN_ORGANISATION_ID } });
    await prisma.service.create({
      data: {
        id: FOREIGN_SERVICE_ID,
        organisationId: FOREIGN_ORGANISATION_ID,
        title: `${TAG} foreign service`,
        slug: `${TAG}-foreign-service`,
        summary: 'Disposable fixture service in another organisation.',
        content: 'Disposable fixture content.',
        audience: 'Test fixture only.',
        referralRoutes: 'Test fixture only.',
        eligibility: 'Test fixture only.',
        supportModel: 'Test fixture only.',
        published: true
      }
    });

    await page.goto('/crm/referrals/new');
    await waitForHydratedForm(page, '#serviceId');
    const offered = await offeredServiceIds(page);
    // Organisation isolation is never weakened to make a menu work.
    expect(offered).not.toContain(FOREIGN_SERVICE_ID);

    const foreign = await page.request.post('/api/crm/referrals', { data: newPayload(FOREIGN_SERVICE_ID) });
    expect(foreign.status()).toBe(400);
    expect(((await foreign.json()) as { error?: string }).error ?? '').toContain('not available in your organisation');

    // The exact id the broken menu used to submit.
    const fiction = await page.request.post('/api/crm/referrals', { data: newPayload('domestic-abuse') });
    expect(fiction.status()).toBe(400);

    // And the same payload with a service the form actually offered is accepted.
    expect(offered.length).toBeGreaterThan(0);
    const accepted = await page.request.post('/api/crm/referrals', { data: newPayload(offered[0]) });
    expect(accepted.status()).toBe(200);
    const created = (await accepted.json()) as { id: string; reference: string };
    createdReferralIds.push(created.id);
    const stored = await prisma.referral.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.serviceId).toBe(offered[0]);
    expect(stored.organisationId).toBe(organisationId);
  });

  test('with no published service the form offers nothing rather than fiction', async () => {
    // This is the state the reported failure came from: an installation whose service table has no
    // published row. The old fallback list then offered `domestic-abuse` and five other fictional
    // ids, every one of which POST /api/crm/referrals refused.
    const published = await prisma.service.findMany({ where: { organisationId, published: true }, select: { id: true } });
    expect(published.length).toBeGreaterThan(0);
    published.forEach((row) => unpublishedServiceIds.push(row.id));
    await prisma.service.updateMany({ where: { id: { in: unpublishedServiceIds } }, data: { published: false } });
    try {
      await page.goto('/crm/referrals/new');
      await waitForHydratedForm(page, '#serviceId');
      const offered = await offeredServiceIds(page);
      expect(offered, 'the form offered a service that cannot be submitted').toEqual([]);
      // The honest empty state replaces a menu that could only fail.
      await expect(page.locator('.form-notice')).toContainText('No service can accept a referral yet');
      await expect(page.getByRole('button', { name: 'Save referral' })).toBeDisabled();

      // The endpoint keeps refusing the ids the fiction list used, so the fix is not cosmetic.
      const fiction = await page.request.post('/api/crm/referrals', { data: newPayload('domestic-abuse') });
      expect(fiction.status()).toBe(400);
    } finally {
      await restorePublication();
    }

    // And the menu returns as soon as the services do.
    await page.goto('/crm/referrals/new');
    await waitForHydratedForm(page, '#serviceId');
    expect((await offeredServiceIds(page)).length).toBe(published.length);
  });
});
