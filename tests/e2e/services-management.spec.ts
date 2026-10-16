import { test, expect, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './db-reset';
import { ADMIN_EMAIL } from './staff-auth';
import { waitForHydratedForm } from './hydration';

/**
 * Service management through the interface.
 *
 * An installation created the supported way (`npm run bootstrap:admin`) has zero Service rows, and
 * with zero rows both referral forms have nothing to offer and nothing they can accept. This spec
 * performs the whole remedy the way a staff member does — Settings → Services, fill in the form,
 * publish, unpublish, delete — and proves each step in the database, because a page that loads is
 * not evidence that intake works again.
 *
 * Fixtures are namespaced with TAG and removed at the end, so the seeded services the rest of the
 * suite depends on are never touched.
 */

const TAG = 'e2e-service';
const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const serviceTitle = `${TAG} ${stamp}`;
/** The slug the endpoint derives from `serviceTitle` when the form leaves the slug field blank. */
const derivedSlug = `${TAG}-${stamp}`;

/** The hash the app stores for a session token (hashToken in src/lib/auth.ts). Inlined because the
 * e2e project cannot import a server module that pulls in next/headers at module scope. */
const hashSessionToken = (value: string) => createHash('sha256').update(value).digest('hex');

let organisationId = '';
let serviceId = '';
let sessionToken = '';

/** Removes only this run's fixtures, in foreign-key order, so seeded services survive. */
async function deleteServiceFixtures() {
  await prisma.property.deleteMany({ where: { organisationId, slug: { startsWith: `${TAG}-` } } });
  await prisma.service.deleteMany({ where: { organisationId, slug: { startsWith: `${TAG}-` } } });
}

test.describe.serial('service management through the interface', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL }, select: { id: true, organisationId: true } });
    organisationId = admin.organisationId;
    await deleteServiceFixtures();
    // Sign-in is rate limited to 8 attempts per 5 minutes per IP and email (src/app/api/auth/login/
    // route.ts), and every spec in this suite signs in as the same administrator from 127.0.0.1, so a
    // full run has no headroom to spare. This spec therefore prepares its session directly, the way it
    // prepares its other fixtures, rather than spending an attempt the sign-in specs need. The row is a
    // real server-side session with a hashed token, exactly as createSession() writes one; signing in
    // through the form is covered by smoke.spec.ts and staff-workflows.spec.ts.
    sessionToken = randomBytes(32).toString('hex');
    await prisma.userSession.create({ data: { userId: admin.id, tokenHash: hashSessionToken(sessionToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    page = await browser.newPage();
    await page.goto('/staff/login');
    const origin = new URL(page.url());
    await page.context().addCookies([{ name: 'safe_nest_session', value: sessionToken, domain: origin.hostname, path: '/', httpOnly: true, sameSite: 'Lax', secure: origin.protocol === 'https:' }]);
    await page.goto('/crm/settings/services');
    await expect(page).toHaveURL(/\/crm\/settings\/services/);
  });

  test.afterAll(async () => {
    await page?.close();
    await deleteServiceFixtures();
    if (sessionToken) await prisma.userSession.deleteMany({ where: { tokenHash: hashSessionToken(sessionToken) } });
    await prisma.$disconnect();
  });

  test('a service created by staff is stored and immediately usable by referral intake', async () => {
    await page.goto('/crm/settings/services');
    await waitForHydratedForm(page, '#service-new-title');
    await page.locator('#service-new-title').fill(serviceTitle);
    await page.locator('#service-new-summary').fill('Disposable fixture service created by the workflow audit.');
    await page.locator('#service-new-content').fill('A disposable service proving staff can restore referral intake without a seed script.');
    await page.locator('#service-new-audience').fill('People who need this fixture service.');
    await page.locator('#service-new-routes').fill('Referrals arrive through the duty team.');
    await page.locator('#service-new-eligibility').fill('No eligibility considerations apply to this fixture.');
    await page.locator('#service-new-support').fill('Key work and housing options advice.');
    await page.getByRole('button', { name: 'Add Service' }).click();
    await expect(page.locator('#add-service .form-success')).toContainText('Service created');

    // The slug field was left blank, so the endpoint derived it: staff never have to know URL rules.
    const created = await prisma.service.findFirst({ where: { organisationId, title: serviceTitle }, select: { id: true, slug: true, published: true } });
    expect(created).not.toBeNull();
    if (!created) throw new Error('The service the form reported as created was not stored.');
    serviceId = created.id;
    expect(created.slug).toBe(derivedSlug);
    expect(created.published).toBe(true);

    // Publication is what makes a service selectable, so intake now offers it.
    await page.goto('/crm/referrals/new');
    await waitForHydratedForm(page, '#serviceId');
    await expect(page.locator('#serviceId')).toContainText(serviceTitle);
    await expect(page.locator('#no-services-notice')).toHaveCount(0);
  });

  test('publishing and unpublishing changes publication only, never the service content', async () => {
    await page.goto('/crm/settings/services');
    const row = page.locator('tr', { hasText: serviceTitle });
    const unpublish = row.getByRole('button', { name: `Unpublish ${serviceTitle}` });
    // The control is server-rendered disabled until hydration, so waiting for it to become enabled is
    // waiting for the same thing a person waits for.
    await expect(unpublish).toBeEnabled();
    await unpublish.click();
    await expect(row.locator('.form-success')).toContainText('Unpublished.');

    const unpublished = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
    expect(unpublished.published).toBe(false);
    // Only `{ published }` was sent, so the content the previous test stored has to be untouched.
    expect(unpublished.summary).toBe('Disposable fixture service created by the workflow audit.');
    expect(unpublished.supportModel).toBe('Key work and housing options advice.');

    // Unpublished means intake no longer offers it, which is the whole point of the toggle.
    await page.goto('/crm/referrals/new');
    await waitForHydratedForm(page, '#serviceId');
    await expect(page.locator('#serviceId')).not.toContainText(serviceTitle);

    await page.goto('/crm/settings/services');
    const republish = page.locator('tr', { hasText: serviceTitle }).getByRole('button', { name: `Publish ${serviceTitle}` });
    await expect(republish).toBeEnabled();
    await republish.click();
    await expect(page.locator('tr', { hasText: serviceTitle }).locator('.form-success')).toContainText('Published.');
    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })).published).toBe(true);
  });

  test('deletion is refused while another record uses the service, and allowed once none does', async () => {
    // A property pointing at the service is enough to make deletion unsafe: its public page describes
    // itself by that service, so deleting the row would leave the property describing nothing. Prisma
    // creates it because it is a fixture, not a workflow — nothing in the product links a property as a
    // side effect of managing a service.
    const property = await prisma.property.create({
      data: { organisationId, serviceId, publicName: `${TAG} property ${stamp}`, slug: `${TAG}-property-${stamp}`, neighbourhood: 'E2E', serviceType: 'Supported accommodation', publicSummary: 'Disposable fixture property for the service audit.', eligibility: 'Test fixture only.', capacity: 1, publicVacancyState: 'No rooms available', confidential: false }
    });

    await page.goto('/crm/settings/services');
    const row = page.locator('tr', { hasText: serviceTitle });
    await expect(row).toContainText('Deleting will be refused');
    await row.getByRole('button', { name: `Delete ${serviceTitle}` }).click();
    await row.getByRole('button', { name: `Confirm delete of ${serviceTitle}` }).click();
    await expect(row.locator('.form-error')).toContainText('still used by');

    // The refusal is real rather than cosmetic: the service and the property link both survive.
    expect(await prisma.service.count({ where: { id: serviceId } })).toBe(1);
    expect(await prisma.property.count({ where: { id: property.id, serviceId } })).toBe(1);

    // Unlink the fixture and the same control deletes the service, because nothing depends on it now.
    await prisma.property.update({ where: { id: property.id }, data: { serviceId: null } });
    await page.goto('/crm/settings/services');
    const cleared = page.locator('tr', { hasText: serviceTitle });
    await cleared.getByRole('button', { name: `Delete ${serviceTitle}` }).click();
    await cleared.getByRole('button', { name: `Confirm delete of ${serviceTitle}` }).click();
    // A successful delete removes the row, so the proof is the row going rather than a success banner
    // on an element that no longer exists.
    await expect(page.locator('tr', { hasText: serviceTitle })).toHaveCount(0);
    expect(await prisma.service.count({ where: { id: serviceId } })).toBe(0);
  });
});