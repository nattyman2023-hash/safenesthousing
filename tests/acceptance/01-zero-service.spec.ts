import { test, expect, type Page } from '@playwright/test';
import { ADMIN_EMAIL, prisma, tableCount } from './db';
import { addServiceThroughUi, openServiceEditor, referralServiceOptions, signIn, waitForHydratedForm } from './ui';

/**
 * Zero-service acceptance.
 *
 * The production failure was not "a service page is missing". It was: an organisation with NO
 * configured Service records had no way to create one, so every service-dependent form became
 * unusable. Proving that fixed requires a database with zero services, and the seeded development
 * database has six — so this suite builds its own from migrations alone and asserts
 * `SELECT COUNT(*) FROM Service = 0` before the first UI action.
 *
 * Every record asserted on below is created by pressing a control in the CRM. Prisma appears only to
 * count rows and to prove what the UI persisted.
 */

const FIRST_SERVICE = 'Domestic abuse';
const SECOND_SERVICE = 'Young people support';
const DISPOSABLE_SERVICE = 'Acceptance disposable service';

let organisationId = '';
let firstServiceId = '';
let secondServiceId = '';
let firstServiceSnapshot: Record<string, unknown> = {};
let referralId = '';
let referralReference = '';
let clientAId = '';
let clientBId = '';
let clientBReference = '';

test.describe.serial('a zero-service installation recovers through the CRM alone', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => { page = await browser.newPage(); });
  test.afterAll(async () => { await page?.close(); await prisma.$disconnect(); });

  test('00 the disposable database holds zero services before any UI action', async () => {
    // The whole suite is invalid if a fixture inserted a service during setup, so this runs first and
    // reads the tables directly rather than through a Prisma model that could be filtered.
    expect(await tableCount('Service'), 'SELECT COUNT(*) FROM Service').toBe(0);
    expect(await tableCount('Client'), 'no service users may exist yet').toBe(0);
    expect(await tableCount('Referral')).toBe(0);
    expect(await tableCount('Placement')).toBe(0);
    expect(await tableCount('Property')).toBe(0);
    expect(await tableCount('Room')).toBe(0);
    expect(await tableCount('Task')).toBe(0);
    expect(await tableCount('Organisation'), 'exactly one real organisation').toBe(1);
    expect(await tableCount('User'), 'exactly one bootstrapped administrator').toBe(1);
  });

  test('01 the bootstrapped administrator can sign in', async () => {
    await signIn(page);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL }, select: { id: true, organisationId: true, name: true } });
    organisationId = admin.organisationId;
    await expect(page.getByText(admin.name).first()).toBeVisible();
  });

  test('02 Settings → Services shows a usable zero-state and a visible Add Service', async () => {
    await page.goto('/crm/settings/services');

    // The zero-state has to explain the consequence and offer the remedy in the same place.
    const emptyState = page.locator('#service-empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState.getByRole('heading', { name: 'No services configured' })).toBeVisible();
    await expect(emptyState).toContainText('at least one active Service before referrals can be created');
    await expect(emptyState.getByRole('link', { name: 'Add Service' })).toHaveAttribute('href', '#add-service');

    // Add Service is reachable from the page header, the zero-state and the form itself.
    await expect(page.locator('.crm-page-header').getByRole('link', { name: 'Add Service' })).toBeVisible();
    await expect(page.locator('#add-service').getByRole('button', { name: 'Add Service' })).toBeVisible();

    // Nothing is listed, and the content editor is not rendered for services that do not exist.
    await expect(page.locator('.crm-table tbody tr')).toHaveCount(0);
    await expect(page.getByText('No services yet. Use Add Service below.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Edit service content' })).toHaveCount(0);
    expect(await tableCount('Service'), 'opening the page must not create anything').toBe(0);
  });

  test('03 every database-backed CRM list survives having no rows', async () => {
    // The CRM must not become mysteriously unusable when there are no rows, and where a missing
    // entity can be created there must be a clear nearby path to create it.
    const pages: [string, RegExp, string | null][] = [
      ['/crm/dashboard', /Operations dashboard/, null],
      ['/crm/clients', /Clients/, 'Add client'],
      ['/crm/referrals', /Referrals/, null],
      ['/crm/referrals/new', /Record a referral/, null],
      ['/crm/placements', /Placements/, 'Create placement'],
      ['/crm/properties', /Properties/, 'Add property'],
      ['/crm/tasks', /Tasks/, 'New task'],
      ['/crm/rota', /Rota/, null],
      ['/crm/users', /Users|Staff|People/i, null],
      ['/crm/settings/services', /Services/, 'Add Service']
    ];
    for (const [path, heading, createControl] of pages) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} did not load`).toBeLessThan(400);
      await expect(page.locator('h1').first(), `${path} rendered no heading`).toBeVisible();
      await expect(page.locator('h1').first(), `${path} heading`).toContainText(heading);
      await expect(page.getByText(/Application error|Internal Server Error/i), `${path} showed a server error`).toHaveCount(0);
      // Where the missing entity can legitimately be created, the path to create it is right there.
      if (createControl) {
        await expect(page.locator('.crm-page-header').getByRole('link', { name: createControl }), `${path} offers no nearby path to create the missing record`).toBeVisible();
      }
    }

    // Selects that legitimately have nothing to offer must say so rather than invent options.
    await page.goto('/crm/clients');
    await waitForHydratedForm(page, '#cli-name');
    const clientServiceOptions = await page.locator('#cli-service option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean));
    expect(clientServiceOptions, 'the service-user form must not invent service options').toEqual([]);

    await page.goto('/crm/placements');
    await expect(page.getByText('No placements recorded')).toBeVisible();
    // With no clients and no properties the placement form cannot be submitted, and it says so by
    // disabling its control rather than looking broken or silently doing nothing.
    await waitForHydratedForm(page, '#placement-client');
    await expect(page.locator('form#new').getByRole('button', { name: 'Create placement' })).toBeDisabled();

    await page.goto('/crm/tasks');
    await waitForHydratedForm(page, '#task-title');
    await expect(page.locator('#task-title')).toBeEnabled();
  });

  test('04 internal referral intake offers nothing and points at the remedy', async () => {
    await page.goto('/crm/referrals/new');
    await waitForHydratedForm(page, '#serviceId');

    // The original failure was a menu offering options its own endpoint rejected. With zero services
    // the correct behaviour is an empty, disabled select and a plain-English explanation.
    const options = await page.locator('select[name="serviceId"] option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
    expect(options, 'only the placeholder may be present').toEqual(['']);
    await expect(page.locator('#serviceId')).toBeDisabled();
    await expect(page.locator('#no-services-notice')).toBeVisible();
    await expect(page.locator('#no-services-notice').getByRole('link', { name: 'Settings → Services' })).toHaveAttribute('href', '/crm/settings/services');
    await expect(page.locator('.form-notice')).toContainText('No service can accept a referral yet');

    // No fictional fixture id may be offered: those are exactly what the endpoint refuses.
    for (const fixtureId of ['domestic-abuse', 'supported-accommodation', 'homelessness-support', 'mental-health']) {
      await expect(page.locator(`select[name="serviceId"] option[value="${fixtureId}"]`)).toHaveCount(0);
    }
  });

  test('05 the first Service is created entirely through the CRM, and stored correctly', async () => {
    // The request is awaited as well as the UI message, so "success" cannot be a message on a
    // submission that never happened.
    const sent = page.waitForResponse((candidate) => candidate.url().endsWith('/api/crm/content/services') && candidate.request().method() === 'POST');
    await addServiceThroughUi(page, { title: FIRST_SERVICE });
    const response = await sent;
    expect(response.status(), 'the endpoint refused the first service').toBe(201);
    await expect(page.locator('#add-service .form-success')).toContainText('Service created and published');

    const created = await prisma.service.findFirst({ where: { organisationId, title: FIRST_SERVICE } });
    expect(created, 'the service the form reported as created was not stored').not.toBeNull();
    if (!created) throw new Error('not stored');
    firstServiceId = created.id;

    // Correct organisation: the id comes from the signed-in user, never from the request body.
    expect(created.organisationId).toBe(organisationId);
    expect(created.title).toBe(FIRST_SERVICE);
    // The slug field was left blank, so the domain derived it — staff never have to know URL rules.
    expect(created.slug).toBe('domestic-abuse');
    expect(created.published, 'the publish checkbox is ticked by default').toBe(true);
    expect(created.displayOrder).toBe(0);
    for (const column of ['summary', 'content', 'audience', 'referralRoutes', 'eligibility', 'supportModel'] as const) {
      expect(created[column], `${column} is a NOT NULL Service column`).toBeTruthy();
    }
    expect(await tableCount('Service'), 'exactly one service now exists').toBe(1);

    // A security-sensitive mutation, so it is audited.
    const audit = await prisma.auditLog.findFirst({ where: { resourceId: firstServiceId, action: 'SERVICE_CREATED' } });
    expect(audit, 'creating a service must be audited').not.toBeNull();

    // The zero-state is gone and the row is listed with its publication state.
    await page.goto('/crm/settings/services');
    await expect(page.locator('#service-empty-state')).toHaveCount(0);
    const row = page.locator('tr', { hasText: FIRST_SERVICE });
    await expect(row).toContainText('/services/domestic-abuse');
    // StatusBadge renders the stored status through nextStatusLabel(), so "PUBLISHED" reads "Published".
    await expect(row).toContainText('Published');
  });

  test('06 intake offers the new Service and a referral saves against it', async () => {
    // This is the original production failure, so it is asserted end to end.
    await page.goto('/crm/referrals/new');
    await waitForHydratedForm(page, '#serviceId');
    await expect(page.locator('#no-services-notice')).toHaveCount(0);
    await expect(page.locator('#serviceId')).toBeEnabled();

    const offered = await referralServiceOptions(page);
    expect(offered.map((option) => option.value), 'the menu must offer the real Service id, not a slug').toEqual([firstServiceId]);
    expect(offered.map((option) => option.label)).toEqual([FIRST_SERVICE]);

    await page.locator('#personName').fill('Acceptance referral person');
    await page.locator('select[name="serviceId"]').selectOption(firstServiceId);
    await page.locator('#referrerName').fill('Acceptance referrer');
    await page.locator('#referrerEmail').fill('acceptance.referrer@example.test');
    await page.locator('#currentLocation').fill('Staying with friends while a safe place is found.');
    await page.locator('#housingSituation').fill('Housing has broken down and a safe place is needed urgently.');
    await page.locator('#supportNeeds').fill('Tenancy support and a settled home.');

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
    // The decisive assertion: the referral points at the Service the UI created, by its real id.
    expect(stored.serviceId, 'referral.serviceId must equal the Service.id created through the CRM').toBe(firstServiceId);
    expect(stored.status).toBe('NEW');
    expect(await tableCount('Referral')).toBe(1);

    // Open the detail, return to the list, open it again — the original bug also broke navigation.
    const detail = await page.goto(`/crm/referrals/${referralId}`);
    expect(detail?.status()).toBe(200);
    await expect(page.getByText(referralReference).first()).toBeVisible();
    await expect(page.getByText(FIRST_SERVICE).first()).toBeVisible();

    await page.goto('/crm/referrals');
    const listRow = page.locator('tr', { hasText: referralReference });
    await expect(listRow).toHaveCount(1);
    await listRow.getByRole('link', { name: referralReference }).click();
    await expect(page).toHaveURL(new RegExp(`/crm/referrals/${referralId}`));
    await expect(page.getByText(referralReference).first()).toBeVisible();
  });


  test('07 editing one Service through the content form leaves the other unchanged', async () => {
    // Two services, so "the right row changed" is a real assertion rather than a tautology.
    await addServiceThroughUi(page, { title: SECOND_SERVICE, displayOrder: 5 });
    await expect(page.locator('#add-service .form-success')).toContainText('Service created');
    const second = await prisma.service.findFirstOrThrow({ where: { organisationId, title: SECOND_SERVICE } });
    secondServiceId = second.id;
    expect(secondServiceId, 'two distinct Service rows').not.toBe(firstServiceId);
    expect(second.slug).toBe('young-people-support');
    expect(second.displayOrder).toBe(5);
    expect(await tableCount('Service')).toBe(2);

    // Everything the edit form owns, on the service that must NOT change.
    const before = await prisma.service.findUniqueOrThrow({ where: { id: firstServiceId } });
    firstServiceSnapshot = { ...before } as unknown as Record<string, unknown>;

    await openServiceEditor(page, SECOND_SERVICE);
    const editedTitle = 'Young people support (renamed by the acceptance run)';
    await page.locator(`#service-title-${secondServiceId}`).fill(editedTitle);
    await page.locator(`#service-summary-${secondServiceId}`).fill('A corrected public summary for the second service only.');
    await page.locator(`#service-content-${secondServiceId}`).fill('A corrected description for the second service only.');
    await page.locator(`#service-order-${secondServiceId}`).fill('9');
    await page.locator(`#service-slug-${secondServiceId}`).fill('young-people-support-v2');

    const sent = page.waitForResponse((candidate) => candidate.url().endsWith(`/api/crm/content/services/${secondServiceId}`) && candidate.request().method() === 'PATCH');
    await page.locator(`form:has(#service-title-${secondServiceId})`).getByRole('button', { name: 'Save service' }).click();
    const response = await sent;
    expect(response.status()).toBe(200);
    await expect(page.locator(`form:has(#service-title-${secondServiceId}) .form-success`)).toContainText('Saved');

    // The SAME row changed — every field the form owns.
    const afterSecond = await prisma.service.findUniqueOrThrow({ where: { id: secondServiceId } });
    expect(afterSecond.title).toBe(editedTitle);
    expect(afterSecond.summary).toBe('A corrected public summary for the second service only.');
    expect(afterSecond.content).toBe('A corrected description for the second service only.');
    expect(afterSecond.displayOrder).toBe(9);
    expect(afterSecond.slug).toBe('young-people-support-v2');
    expect(afterSecond.organisationId).toBe(organisationId);
    // Publication was not touched by a content save: the form sends the checkbox state, and it was on.
    expect(afterSecond.published).toBe(true);

    // The OTHER row is byte-for-byte unchanged for every tested field.
    const afterFirst = await prisma.service.findUniqueOrThrow({ where: { id: firstServiceId } });
    for (const column of ['title', 'slug', 'summary', 'content', 'audience', 'referralRoutes', 'eligibility', 'supportModel', 'displayOrder', 'published', 'organisationId', 'createdAt'] as const) {
      expect(afterFirst[column], `${column} on the untouched service changed`).toEqual(firstServiceSnapshot[column]);
    }
    expect(afterFirst.title).toBe(FIRST_SERVICE);

    // The corrected slug is the public address now, and the listing shows it.
    await page.goto('/crm/settings/services');
    await expect(page.locator('tr', { hasText: editedTitle })).toContainText('/services/young-people-support-v2');
    await expect(page.locator('tr', { hasText: FIRST_SERVICE })).toContainText('/services/domestic-abuse');
  });


  test('08 unpublishing removes the Service from intake and republishing returns it', async () => {
    await page.goto('/crm/settings/services');
    const row = page.locator('tr', { hasText: FIRST_SERVICE });
    const unpublish = row.getByRole('button', { name: `Unpublish ${FIRST_SERVICE}` });
    await expect(unpublish).toBeEnabled();

    const sent = page.waitForResponse((candidate) => candidate.url().endsWith(`/api/crm/content/services/${firstServiceId}`) && candidate.request().method() === 'PATCH');
    await unpublish.click();
    expect((await sent).status()).toBe(200);
    await expect(row.locator('.form-success')).toContainText('Unpublished.');

    const unpublished = await prisma.service.findUniqueOrThrow({ where: { id: firstServiceId } });
    expect(unpublished.published).toBe(false);
    // Only `{ published }` was sent, so the content has to be untouched.
    expect(unpublished.title).toBe(firstServiceSnapshot.title);
    expect(unpublished.slug).toBe(firstServiceSnapshot.slug);
    expect(unpublished.content).toBe(firstServiceSnapshot.content);

    // Intake stops offering it — publication is the eligibility rule.
    expect((await referralServiceOptions(page)).map((option) => option.value)).toEqual([secondServiceId]);

    // Publication is audited separately from a wording correction.
    expect(await prisma.auditLog.count({ where: { resourceId: firstServiceId, action: 'SERVICE_UNPUBLISHED' } })).toBe(1);

    // The historical referral recorded against it still opens: unpublishing is not deletion.
    const detail = await page.goto(`/crm/referrals/${referralId}`);
    expect(detail?.status(), 'the historical referral must stay readable').toBe(200);
    await expect(page.getByText(referralReference).first()).toBeVisible();
    await expect(page.getByText(FIRST_SERVICE).first()).toBeVisible();
    expect((await prisma.referral.findUniqueOrThrow({ where: { id: referralId } })).serviceId).toBe(firstServiceId);

    await page.goto('/crm/settings/services');
    const republish = page.locator('tr', { hasText: FIRST_SERVICE }).getByRole('button', { name: `Publish ${FIRST_SERVICE}` });
    await expect(republish).toBeEnabled();
    const returned = page.waitForResponse((candidate) => candidate.url().endsWith(`/api/crm/content/services/${firstServiceId}`) && candidate.request().method() === 'PATCH');
    await republish.click();
    expect((await returned).status()).toBe(200);
    expect((await prisma.service.findUniqueOrThrow({ where: { id: firstServiceId } })).published).toBe(true);

    // It is offered to intake again.
    expect((await referralServiceOptions(page)).map((option) => option.value).sort()).toEqual([firstServiceId, secondServiceId].sort());
  });

  test('09 an unused Service can be deleted, and a referenced one cannot', async () => {
    // Unused: created and deleted entirely through the UI, with nothing pointing at it.
    await addServiceThroughUi(page, { title: DISPOSABLE_SERVICE });
    await expect(page.locator('#add-service .form-success')).toContainText('Service created');
    const disposable = await prisma.service.findFirstOrThrow({ where: { organisationId, title: DISPOSABLE_SERVICE } });
    expect(await tableCount('Service')).toBe(3);

    await page.goto('/crm/settings/services');
    const disposableRow = page.locator('tr', { hasText: DISPOSABLE_SERVICE });
    await expect(disposableRow.getByText('Deleting will be refused')).toHaveCount(0);
    await disposableRow.getByRole('button', { name: `Delete ${DISPOSABLE_SERVICE}` }).click();
    const removed = page.waitForResponse((candidate) => candidate.url().endsWith(`/api/crm/content/services/${disposable.id}`) && candidate.request().method() === 'DELETE');
    await disposableRow.getByRole('button', { name: `Confirm delete of ${DISPOSABLE_SERVICE}` }).click();
    expect((await removed).status()).toBe(200);

    // The proof of a delete is the row going, not a banner on an element that no longer exists.
    await expect(page.locator('tr', { hasText: DISPOSABLE_SERVICE })).toHaveCount(0);
    expect(await prisma.service.count({ where: { id: disposable.id } }), 'the correct service was deleted').toBe(0);
    expect(await prisma.service.count({ where: { id: { in: [firstServiceId, secondServiceId] } } }), 'both siblings remain').toBe(2);
    expect(await tableCount('Service')).toBe(2);
    expect(await prisma.auditLog.count({ where: { resourceId: disposable.id, action: 'SERVICE_DELETED' } }), 'deletion is audited').toBe(1);

    // Referenced: the referral recorded in test 06 still points at the first service.
    await page.goto('/crm/settings/services');
    const referenced = page.locator('tr', { hasText: FIRST_SERVICE });
    await expect(referenced).toContainText('In use by 1 referral');
    await expect(referenced).toContainText('Deleting will be refused — unpublish instead');
    await referenced.getByRole('button', { name: `Delete ${FIRST_SERVICE}` }).click();
    const refused = page.waitForResponse((candidate) => candidate.url().endsWith(`/api/crm/content/services/${firstServiceId}`) && candidate.request().method() === 'DELETE');
    await referenced.getByRole('button', { name: `Confirm delete of ${FIRST_SERVICE}` }).click();
    const refusal = await refused;
    expect(refusal.status(), 'deletion of a referenced service must be refused').toBe(409);
    const body = await refusal.json() as { error?: string };
    expect(body.error ?? '').toMatch(/still used by 1 referral/);
    expect(body.error ?? '', 'the refusal must name the reversible alternative').toMatch(/Unpublish it instead/);
    await expect(referenced.locator('.form-error')).toContainText('still used by 1 referral');

    // The record remains, its link remains, and unpublishing is still available.
    expect(await prisma.service.count({ where: { id: firstServiceId } })).toBe(1);
    expect(await prisma.referral.count({ where: { id: referralId, serviceId: firstServiceId } })).toBe(1);
    await expect(referenced.getByRole('button', { name: `Unpublish ${FIRST_SERVICE}` })).toBeEnabled();
  });


  test('10 a refused submission is reported in the form and changes nothing', async () => {
    await page.goto('/crm/settings/services');
    await waitForHydratedForm(page, '#service-new-title');
    const addButton = page.locator('#add-service').getByRole('button', { name: 'Add Service' });
    // The control enables normally once React owns the form — no silent, permanently dead button.
    await expect(addButton).toBeEnabled();

    await page.locator('#service-new-title').fill('Duplicate slug attempt');
    await page.locator('#service-new-slug').fill('domestic-abuse');
    await page.locator('#service-new-summary').fill('A submission that must be refused by the server.');
    await page.locator('#service-new-content').fill('A submission that must be refused by the server.');
    await page.locator('#service-new-audience').fill('Nobody — this is a refusal test.');
    await page.locator('#service-new-routes').fill('None.');
    await page.locator('#service-new-eligibility').fill('None.');
    await page.locator('#service-new-support').fill('None.');

    // 409: the slug already belongs to the first service, and the message names it.
    const clash = page.waitForResponse((candidate) => candidate.url().endsWith('/api/crm/content/services') && candidate.request().method() === 'POST');
    await addButton.click();
    expect((await clash).status()).toBe(409);
    await expect(page.locator('#add-service .form-error')).toContainText('Another service already uses the slug "domestic-abuse"');
    await expect(page.locator('#add-service .form-success')).toHaveCount(0);
    expect(await prisma.service.count({ where: { title: 'Duplicate slug attempt' } }), 'a refused submission must not create a row').toBe(0);
    expect(await tableCount('Service')).toBe(2);

    // 400: an invalid slug is refused with the rule stated, and still nothing is stored.
    await expect(addButton).toBeEnabled();
    await page.locator('#service-new-slug').fill('Not A Valid Slug');
    const invalid = page.waitForResponse((candidate) => candidate.url().endsWith('/api/crm/content/services') && candidate.request().method() === 'POST');
    await addButton.click();
    expect((await invalid).status()).toBe(400);
    await expect(page.locator('#add-service .form-error')).toContainText('lower-case letters, numbers and single hyphens');
    expect(await tableCount('Service'), 'no success message may accompany an unchanged database').toBe(2);

    // An incomplete form is stopped by the browser's own required-field validation, so the control
    // can never look as though it did nothing.
    await page.locator('#service-new-title').fill('');
    await addButton.click();
    await expect(page.locator('#service-new-title')).toHaveValue('');
    expect(await tableCount('Service')).toBe(2);
  });

  test('11 service users can be created and opened from the clean database', async () => {
    await page.goto('/crm/clients');
    await waitForHydratedForm(page, '#cli-name');

    // The service select now offers exactly the services that exist, by their real ids.
    const offered = await page.locator('#cli-service option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean));
    expect(offered.sort(), 'the service-user form offers the services created through the CRM').toEqual([firstServiceId, secondServiceId].sort());

    for (const label of ['A', 'B']) {
      await page.locator('#cli-name').fill(`Acceptance service user ${label}`);
      await page.locator('#cli-service').selectOption(firstServiceId);
      // The status control defaults to Waitlist. "Current" is chosen explicitly here so that the
      // archive lifecycle below starts from the active state the archive control is designed to
      // leave, and so the create form's own status control is exercised rather than assumed.
      await page.locator('#cli-status').selectOption('CURRENT');
      await page.getByRole('button', { name: 'Add client' }).click();
      await expect(page.locator('.form-success')).toContainText('added.');
    }

    const rows = await prisma.client.findMany({ where: { organisationId, displayName: { startsWith: 'Acceptance service user' } } });
    expect(rows, 'both service-user records were stored').toHaveLength(2);
    expect(rows.every((row) => row.serviceId === firstServiceId), 'each points at the Service created through the UI').toBe(true);
    expect(rows.every((row) => row.status === 'CURRENT')).toBe(true);
    expect(rows.every((row) => row.reference.startsWith('SN-C-'))).toBe(true);
    const userA = rows.find((row) => row.displayName.endsWith(' A'));
    const userB = rows.find((row) => row.displayName.endsWith(' B'));
    if (!userA || !userB) throw new Error('the service-user records were not stored');
    clientAId = userA.id;
    clientBId = userB.id;
    clientBReference = userB.reference;
    expect(await tableCount('Client')).toBe(2);

    // Open A's profile, go back to the list, click A's name, and the same profile opens.
    const detail = await page.goto(`/crm/clients/${clientAId}`);
    expect(detail?.status()).toBe(200);
    await expect(page.getByText('Acceptance service user A').first()).toBeVisible();
    await expect(page.getByText(FIRST_SERVICE).first()).toBeVisible();
    await page.goto('/crm/clients');
    await page.locator('tr', { hasText: 'Acceptance service user A' }).getByRole('link', { name: userA.reference }).click();
    await expect(page).toHaveURL(new RegExp(`/crm/clients/${clientAId}`));
    await expect(page.getByText(userA.reference).first()).toBeVisible();
  });


  test('11b the status lifecycle archives one record and leaves its sibling untouched', async () => {
    // Archiving is the implemented lifecycle for a service user. There is no client DELETE endpoint
    // and no "entered in error" client status, so this is a reversible status change, not deletion.
    const snapshotA = await prisma.client.findUniqueOrThrow({ where: { id: clientAId } });
    const storedB = await prisma.client.findUniqueOrThrow({ where: { id: clientBId } });

    await page.goto(`/crm/clients/${clientBId}`);
    const archive = page.getByRole('button', { name: 'Archive Acceptance service user B' });
    await expect(archive).toBeEnabled();
    await archive.click();
    // Two steps: the first press arms the control rather than acting on it. The armed control's
    // accessible name changes with its visible label, so a screen reader hears the confirmation too.
    const confirm = page.getByRole('button', { name: 'Confirm archive of Acceptance service user B' });
    await expect(confirm).toBeEnabled();
    const sent = page.waitForResponse((candidate) => candidate.url().endsWith(`/api/crm/clients/${clientBId}`) && candidate.request().method() === 'PATCH');
    await confirm.click();
    expect((await sent).status()).toBe(200);
    await expect(page.getByRole('status').filter({ hasText: 'Record archived.' })).toBeVisible();

    // The correct record changed, and only its status.
    const archivedB = await prisma.client.findUniqueOrThrow({ where: { id: clientBId } });
    expect(archivedB.status).toBe('ARCHIVED');
    expect(archivedB.displayName).toBe('Acceptance service user B');
    expect(archivedB.reference).toBe(clientBReference);
    expect(archivedB.serviceId).toBe(firstServiceId);
    expect(archivedB.createdAt).toEqual(storedB.createdAt);

    // The sibling is untouched, field for field.
    const afterA = await prisma.client.findUniqueOrThrow({ where: { id: clientAId } });
    for (const column of ['displayName', 'reference', 'status', 'serviceId', 'riskLevel', 'restricted', 'safeguardingFlag', 'createdAt'] as const) {
      expect(afterA[column], `${column} on the sibling changed`).toEqual(snapshotA[column]);
    }
    expect(afterA.status).toBe('CURRENT');

    // Archiving is NOT deletion: the row, its reference and its profile all remain readable.
    expect(await tableCount('Client'), 'no service-user record was deleted').toBe(2);
    const reopened = await page.goto(`/crm/clients/${clientBId}`);
    expect(reopened?.status(), 'an archived record must stay readable').toBe(200);
    await expect(page.getByText('Acceptance service user B').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore Acceptance service user B to current' })).toBeEnabled();
    expect(await prisma.auditLog.count({ where: { resourceId: clientBId, action: 'CLIENT_UPDATED' } }), 'the status change is audited').toBeGreaterThan(0);

    // The register is "All client records", so an archived record stays visible with its stage named
    // and can be filtered — it is neither hidden nor gone.
    await page.goto('/crm/clients');
    const rowB = page.locator('tr', { hasText: 'Acceptance service user B' });
    await expect(rowB).toHaveCount(1);
    await expect(rowB).toContainText('Archived');
    const statuses = await page.locator('select[aria-label="Client status"] option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
    expect(statuses, 'an archive filter exists').toContain('ARCHIVED');

    // Restoring returns the record to CURRENT, the status the schema treats as active.
    await page.goto(`/crm/clients/${clientBId}`);
    const restored = page.waitForResponse((candidate) => candidate.url().endsWith(`/api/crm/clients/${clientBId}`) && candidate.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Restore Acceptance service user B to current' }).click();
    expect((await restored).status()).toBe(200);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientBId } })).status).toBe('CURRENT');
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientAId } })).status, 'the sibling never moved').toBe('CURRENT');
  });

  test('12 signing out ends CRM access and signing in again restores it', async () => {
    await page.goto('/crm/settings/services');
    // The sign-out control is the real link to the logout route. That route answers with a redirect
    // to the configured public origin (APP_URL) — in a deployment that is this same host, but the
    // production acceptance run deliberately uses a non-routable origin, so the browser cannot follow
    // it. The redirect target is therefore asserted from the response, and the death of the session
    // is then proved against the server itself.
    const logout = page.waitForResponse((candidate) => candidate.url().includes('/api/auth/logout'));
    await page.getByRole('link', { name: 'Sign out' }).click();
    const response = await logout;
    expect(response.status(), 'signing out is a redirect to the sign-in page').toBe(307);
    expect(response.headers()['location'], 'the signed-out redirect targets the configured origin').toBe(`${process.env.APP_URL}/staff/login`);

    // A signed-out session cannot reach the CRM at all.
    await page.goto('/crm/settings/services');
    await expect(page).toHaveURL(/\/staff\/login/);

    await signIn(page);
    await page.goto('/crm/settings/services');
    await expect(page.locator('tr', { hasText: FIRST_SERVICE })).toBeVisible();
    // Everything the suite built through the UI is still exactly what is in the database.
    expect(await tableCount('Service')).toBe(2);
    expect(await tableCount('Referral')).toBe(1);
    expect(await tableCount('Client')).toBe(2);
    expect((await prisma.referral.findUniqueOrThrow({ where: { id: referralId } })).serviceId).toBe(firstServiceId);
  });
});



