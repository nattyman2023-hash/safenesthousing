import { test, expect, type Page } from '@playwright/test';
import { prisma, resetStaffSession } from './db-reset';
import { ADMIN_EMAIL, enterCredentials, assertSignedIn } from './staff-auth';
import { waitForHydratedForm } from './hydration';
// The complaint deadline stored in the database has to be the one the domain computes, so the
// assertion imports the rule itself rather than restating it. A relative path because the e2e
// project does not resolve the app's "@/" alias.
import { complaintTimescales } from '../../src/lib/complaints-domain';

/**
 * CRM workflow audit.
 *
 * Every operation here is performed the way a staff member performs it: the page is opened in a
 * browser, the fields are filled in, the control is pressed, and only then is the stored result
 * checked in the database. Prisma is used for three things only — preparing a disposable fixture,
 * proving what a workflow actually persisted, and cleaning that fixture up again — because a route
 * that loads is not evidence that the workflow works.
 *
 * Fixtures are namespaced with TAG and resolved from the signed-in administrator's own
 * organisation (never from "the first organisation in the database"), so nothing depends on seeded
 * records, on record ordering, or on which database the suite runs against. Cleanup removes only
 * rows carrying this run's stamp.
 */

const TAG = 'e2e-workflow';
const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const prefix = `${TAG} ${stamp}`;
const name = (label: string) => `${prefix} ${label}`;

const dayOffset = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const localDateTime = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** `dayOffset` is UTC-derived, which suits a `date` input. A `datetime-local` value is read by the
 * browser as local wall-clock time, so the calendar assertions need the local calendar day instead —
 * otherwise a run in the hour after midnight files an entry under the wrong day. */
const localDay = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const atTime = (days: number, hoursMinutes: string) => `${localDay(days)}T${hoursMinutes}`;
const instantAt = (days: number, hoursMinutes: string) => new Date(atTime(days, hoursMinutes));
const dayLabel = (days: number) => instantAt(days, '12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const weekdayLabel = (days: number) => instantAt(days, '12:00').toLocaleDateString('en-GB', { weekday: 'short' });

/** Offsets to this week's Monday and Sunday: the calendar page renders a Monday-to-Sunday strip, so
 * an appointment has to fall inside it to be checked against the day grid. Evening times keep the
 * fixtures away from the seeded daytime appointment and away from each other. */
const mondayOffset = -((new Date().getDay() + 6) % 7);
const sundayOffset = mondayOffset + 6;

let organisationId = '';
let adminUserId = '';
let supportLeadId = '';
let clientAId = '';
let clientBId = '';
let propertyId = '';
let roomOneId = '';
let roomTwoId = '';

/** A second organisation, so "not in my organisation" can be proven rather than assumed. */
const FOREIGN_ORGANISATION_ID = `${TAG}-foreign-org`;

const created = {
  clients: [] as string[],
  referrals: [] as string[],
  placements: [] as string[],
  tasks: [] as string[],
  incidents: [] as string[],
  concerns: [] as string[],
  complaints: [] as string[],
  appointments: [] as string[],
  documents: [] as string[],
  properties: [] as string[],
  policies: [] as string[],
  invoices: [] as string[]
};

/** A disposable property with two free rooms, shared by the concern, repair, appointment and
 * placement workflows. Prisma creates it because it is a fixture, not a workflow: nothing in the
 * product builds a property as a side effect of raising a concern. */
async function ensurePropertyFixture() {
  if (propertyId) return;
  const property = await prisma.property.upsert({
    where: { organisationId_slug: { organisationId, slug: `${TAG}-${stamp}` } },
    update: {},
    create: {
      organisationId,
      publicName: name('property'),
      slug: `${TAG}-${stamp}`,
      neighbourhood: 'E2E',
      serviceType: 'Supported accommodation',
      publicSummary: 'Disposable fixture property for the workflow audit.',
      eligibility: 'Test fixture only.',
      capacity: 2,
      publicVacancyState: '2 rooms available',
      confidential: false
    }
  });
  const roomOne = await prisma.room.upsert({ where: { propertyId_label: { propertyId: property.id, label: 'Fixture Room 1' } }, update: {}, create: { propertyId: property.id, label: 'Fixture Room 1', status: 'AVAILABLE' } });
  const roomTwo = await prisma.room.upsert({ where: { propertyId_label: { propertyId: property.id, label: 'Fixture Room 2' } }, update: {}, create: { propertyId: property.id, label: 'Fixture Room 2', status: 'AVAILABLE' } });
  propertyId = property.id;
  roomOneId = roomOne.id;
  roomTwoId = roomTwo.id;
  created.properties.push(propertyId);
}

type ForeignFixtures = {
  clientId: string;
  clientName: string;
  concernId: string;
  concernTitle: string;
  complaintId: string;
  complaintTitle: string;
  ticketId: string;
  ticketTitle: string;
  ticketReference: string;
  appointmentId: string;
  appointmentTitle: string;
  invoiceId: string;
  invoiceReference: string;
};

/** Removes the foreign fixtures in foreign-key order so the organisation itself can go too. */
async function deleteForeignFixtures() {
  const clientIds = await idList(prisma.client.findMany({ where: { organisationId: FOREIGN_ORGANISATION_ID }, select: { id: true } }));
  await prisma.housingBenefitClaim.deleteMany({ where: { clientId: { in: clientIds } } });
  const invoiceIds = await idList(prisma.invoice.findMany({ where: { organisationId: FOREIGN_ORGANISATION_ID }, select: { id: true } }));
  await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  const ticketIds = await idList(prisma.maintenanceTicket.findMany({ where: { organisationId: FOREIGN_ORGANISATION_ID }, select: { id: true } }));
  await prisma.maintenanceUpdate.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.maintenanceTicket.deleteMany({ where: { id: { in: ticketIds } } });
  const concernIds = await idList(prisma.concern.findMany({ where: { organisationId: FOREIGN_ORGANISATION_ID }, select: { id: true } }));
  await prisma.concernAction.deleteMany({ where: { concernId: { in: concernIds } } });
  await prisma.concern.deleteMany({ where: { id: { in: concernIds } } });
  await prisma.complaint.deleteMany({ where: { organisationId: FOREIGN_ORGANISATION_ID } });
  await prisma.appointment.deleteMany({ where: { organisationId: FOREIGN_ORGANISATION_ID } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
  await prisma.auditLog.deleteMany({ where: { organisationId: FOREIGN_ORGANISATION_ID } });
  await prisma.organisation.deleteMany({ where: { id: FOREIGN_ORGANISATION_ID } });
}

/** One record per operational module, all belonging to somebody else. Written straight to the
 * database on purpose: the question is what this organisation's pages and endpoints do with a record
 * they do not own, and no UI here could create one. */
async function createForeignFixtures(): Promise<ForeignFixtures> {
  await deleteForeignFixtures();
  await prisma.organisation.create({ data: { id: FOREIGN_ORGANISATION_ID, name: 'E2E foreign organisation', slug: FOREIGN_ORGANISATION_ID } });
  const client = await prisma.client.create({ data: { organisationId: FOREIGN_ORGANISATION_ID, reference: `SN-C-${TAG}-foreign`, displayName: `${TAG} foreign resident`, status: 'CURRENT' } });
  const concern = await prisma.concern.create({ data: { organisationId: FOREIGN_ORGANISATION_ID, reference: 'CN-0000-001', clientId: client.id, title: `${TAG} foreign concern`, summary: 'A concern that belongs to another organisation.', category: 'WELFARE', severity: 'HIGH', status: 'OPEN' } });
  const complaint = await prisma.complaint.create({ data: { organisationId: FOREIGN_ORGANISATION_ID, reference: 'CMP-0000-001', clientId: client.id, title: `${TAG} foreign complaint`, summary: 'A complaint that belongs to another organisation.', status: 'LOGGED', stage: 'STAGE_1' } });
  const ticket = await prisma.maintenanceTicket.create({ data: { organisationId: FOREIGN_ORGANISATION_ID, reference: 'MT-0000-0001', title: `${TAG} foreign repair`, category: 'GENERAL', trade: 'GENERAL', priority: 'MEDIUM', status: 'REPORTED' } });
  const appointment = await prisma.appointment.create({ data: { organisationId: FOREIGN_ORGANISATION_ID, clientId: client.id, title: `${TAG} foreign appointment`, category: 'SUPPORT', startsAt: instantAt(sundayOffset, '21:45'), status: 'SCHEDULED' } });
  const invoice = await prisma.invoice.create({ data: { organisationId: FOREIGN_ORGANISATION_ID, reference: `${TAG}-foreign-invoice`, status: 'DRAFT', totalMinor: 5000, items: { create: [{ description: 'Foreign line item', quantity: 1, unitMinor: 5000 }] } } });
  await prisma.housingBenefitClaim.create({ data: { clientId: client.id, status: 'IN_PAYMENT', paymentStatus: 'IN_PAYMENT', weeklyRentMinor: 12345, serviceChargeMinor: 0 } });
  return {
    clientId: client.id,
    clientName: client.displayName,
    concernId: concern.id,
    concernTitle: concern.title,
    complaintId: complaint.id,
    complaintTitle: complaint.title,
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    ticketReference: ticket.reference,
    appointmentId: appointment.id,
    appointmentTitle: appointment.title,
    invoiceId: invoice.id,
    invoiceReference: invoice.reference
  };
}

async function signIn(page: Page) {
  await page.goto('/staff/login');
  await waitForHydratedForm(page, '#password');
  await enterCredentials(page);
  await assertSignedIn(page);
}

const idList = async (rows: Promise<{ id: string }[]>) => (await rows).map((row) => row.id);

/** Removes this file's fixtures in foreign-key order. Never touches seeded or demo records. */
async function deleteWorkflowFixtures() {
  await deleteForeignFixtures();
  const clientIds = [...new Set([...created.clients, ...await idList(prisma.client.findMany({ where: { organisationId, displayName: { startsWith: prefix } }, select: { id: true } }))])];
  const referralIds = [...new Set([...created.referrals, ...await idList(prisma.referral.findMany({ where: { organisationId, personName: { startsWith: prefix } }, select: { id: true } }))])];

  const documentIds = await idList(prisma.document.findMany({ where: { organisationId, OR: [{ displayName: { startsWith: prefix } }, { clientId: { in: clientIds } }] }, select: { id: true } }));
  await prisma.referralDocument.deleteMany({ where: { documentId: { in: documentIds } } });
  await prisma.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } });
  await prisma.document.deleteMany({ where: { id: { in: documentIds } } });

  const caseNoteIds = await idList(prisma.caseNote.findMany({ where: { clientId: { in: clientIds } }, select: { id: true } }));
  await prisma.caseNoteVersion.deleteMany({ where: { caseNoteId: { in: caseNoteIds } } });
  await prisma.caseNote.deleteMany({ where: { id: { in: caseNoteIds } } });

  const planIds = await idList(prisma.supportPlan.findMany({ where: { clientId: { in: clientIds } }, select: { id: true } }));
  await prisma.supportGoal.deleteMany({ where: { supportPlanId: { in: planIds } } });
  await prisma.supportPlanReview.deleteMany({ where: { supportPlanId: { in: planIds } } });
  await prisma.supportPlan.deleteMany({ where: { id: { in: planIds } } });

  await prisma.clientRelationship.deleteMany({ where: { OR: [{ clientId: { in: clientIds } }, { relatedClientId: { in: clientIds } }] } });
  await prisma.relatedPerson.deleteMany({ where: { organisationId, fullName: { startsWith: prefix } } });

  const incidentIds = [...new Set([...created.incidents, ...await idList(prisma.incident.findMany({ where: { organisationId, description: { contains: prefix } }, select: { id: true } }))])];
  await prisma.incidentUpdate.deleteMany({ where: { incidentId: { in: incidentIds } } });
  await prisma.incidentAction.deleteMany({ where: { incidentId: { in: incidentIds } } });
  await prisma.incident.deleteMany({ where: { id: { in: incidentIds } } });

  const maintenanceIds = await idList(prisma.maintenanceTicket.findMany({ where: { organisationId, title: { startsWith: prefix } }, select: { id: true } }));
  await prisma.maintenanceUpdate.deleteMany({ where: { ticketId: { in: maintenanceIds } } });
  await prisma.maintenanceTicket.deleteMany({ where: { id: { in: maintenanceIds } } });

  const concernIds = await idList(prisma.concern.findMany({ where: { organisationId, title: { startsWith: prefix } }, select: { id: true } }));
  await prisma.concernAction.deleteMany({ where: { concernId: { in: concernIds } } });
  await prisma.concern.deleteMany({ where: { id: { in: concernIds } } });
  await prisma.complaint.deleteMany({ where: { organisationId, title: { startsWith: prefix } } });
  await prisma.appointment.deleteMany({ where: { organisationId, title: { startsWith: prefix } } });
  await prisma.task.deleteMany({ where: { organisationId, title: { startsWith: prefix } } });

  await prisma.housingBenefitClaim.deleteMany({ where: { clientId: { in: clientIds } } });
  const invoiceIds = [...new Set([...created.invoices, ...await idList(prisma.invoice.findMany({ where: { organisationId, OR: [{ reference: { contains: stamp } }, { clientId: { in: clientIds } }] }, select: { id: true } }))])];
  await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });

  const placementIds = [...new Set([...created.placements, ...await idList(prisma.placement.findMany({ where: { clientId: { in: clientIds } }, select: { id: true } }))])];
  await prisma.occupancyRecord.deleteMany({ where: { placementId: { in: placementIds } } });
  await prisma.moveChecklist.deleteMany({ where: { placementId: { in: placementIds } } });
  await prisma.placement.deleteMany({ where: { id: { in: placementIds } } });

  const propertyIds = [...new Set([...created.properties, ...await idList(prisma.property.findMany({ where: { organisationId, publicName: { startsWith: prefix } }, select: { id: true } }))])];
  await prisma.propertyComplianceRecord.deleteMany({ where: { propertyId: { in: propertyIds } } });
  // The placement fixture occupies a room in this property, and the occupancy row points at the room
  // as well as at the placement, so it has to go before the rooms do.
  const fixtureRoomIds = await idList(prisma.room.findMany({ where: { propertyId: { in: propertyIds } }, select: { id: true } }));
  await prisma.occupancyRecord.deleteMany({ where: { roomId: { in: fixtureRoomIds } } });
  await prisma.room.deleteMany({ where: { propertyId: { in: propertyIds } } });
  await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });

  await prisma.referralStatusHistory.deleteMany({ where: { referralId: { in: referralIds } } });
  await prisma.referralAssignment.deleteMany({ where: { referralId: { in: referralIds } } });
  await prisma.referralRisk.deleteMany({ where: { referralId: { in: referralIds } } });
  await prisma.referralNote.deleteMany({ where: { referralId: { in: referralIds } } });
  await prisma.client.updateMany({ where: { referralId: { in: referralIds } }, data: { referralId: null } });
  await prisma.referral.deleteMany({ where: { id: { in: referralIds } } });

  await prisma.policyResource.deleteMany({ where: { organisationId, title: { startsWith: prefix } } });
  await prisma.rotaShift.deleteMany({ where: { organisationId, handover: { contains: prefix } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });

  for (const key of Object.keys(created) as (keyof typeof created)[]) created[key].length = 0;
  propertyId = '';
  roomOneId = '';
  roomTwoId = '';
}

test.describe.serial('CRM workflows through the interface', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL }, select: { id: true, organisationId: true } });
    organisationId = admin.organisationId;
    adminUserId = admin.id;
    const lead = await prisma.user.findFirstOrThrow({ where: { organisationId, email: { not: ADMIN_EMAIL }, active: true }, select: { id: true } });
    supportLeadId = lead.id;
    await deleteWorkflowFixtures();
    await resetStaffSession(ADMIN_EMAIL);
    page = await browser.newPage();
    await signIn(page);
  });

  test.afterAll(async () => {
    await page?.close();
    await deleteWorkflowFixtures();
    await prisma.$disconnect();
  });

  test('service user: created twice through the form, and both records are real', async () => {
    await page.goto('/crm/clients');
    await waitForHydratedForm(page, '#cli-name');

    for (const [label, status] of [['service user A', 'CURRENT'], ['service user B', 'CURRENT']] as const) {
      await page.locator('#cli-name').fill(name(label));
      await page.locator('#cli-status').selectOption(status);
      await page.getByRole('button', { name: 'Add client' }).click();
      await expect(page.locator('.form-success')).toContainText('added.');
    }

    const rows = await prisma.client.findMany({ where: { organisationId, displayName: { startsWith: prefix } }, select: { id: true, displayName: true, status: true, reference: true, riskLevel: true } });
    expect(rows.map((row) => row.displayName).sort()).toEqual([name('service user A'), name('service user B')].sort());
    expect(rows.every((row) => row.status === 'CURRENT')).toBe(true);
    expect(rows.every((row) => row.reference.startsWith('SN-C-'))).toBe(true);
    clientAId = rows.find((row) => row.displayName === name('service user A'))?.id ?? '';
    clientBId = rows.find((row) => row.displayName === name('service user B'))?.id ?? '';
    created.clients.push(clientAId, clientBId);
  });

  test('relationships: service user to service user, external contact, edit, and unlink', async () => {
    expect(clientAId && clientBId, 'the service user fixtures were not created').toBeTruthy();
    await page.goto(`/crm/clients/${clientAId}`);
    await waitForHydratedForm(page, '#relationship-client');

    const types = await page.locator('#relationship-type option').evaluateAll((nodes) => nodes
      .map((node) => (node as HTMLOptionElement).value)
      .filter((value) => value !== ''));
    expect(types.length, 'no relationship types are offered').toBeGreaterThan(1);
    const [clientType, personType] = types;

    // An empty submission cannot be saved. The required fields are refused by the browser itself,
    // so the control can never appear to do nothing — the convention the rest of the CRM follows.
    await expect(page.locator('#relationship-client')).toHaveAttribute('required', '');
    await expect(page.locator('#relationship-type')).toHaveAttribute('required', '');
    await page.getByRole('button', { name: 'Save relationship' }).click();
    await expect(page.locator('#relationship-client')).toHaveValue('');
    expect(await prisma.clientRelationship.count({ where: { clientId: clientAId } })).toBe(0);

    // Service user to service user: entered once, readable from both profiles.
    await page.locator('#relationship-client').selectOption(clientBId);
    await page.locator('#relationship-type').selectOption(clientType);
    await page.getByRole('button', { name: 'Save relationship' }).click();
    await expect(page.locator('form:has(#relationship-client) .form-success')).toContainText('Relationship recorded. It now shows on both profiles.');

    const link = await prisma.clientRelationship.findFirstOrThrow({ where: { clientId: clientAId, relatedClientId: clientBId } });
    expect(link.relationshipType).toBe(clientType);
    expect(link.inverseRelationshipType, 'the inverse label is what makes the link readable from the other profile').toBeTruthy();
    await page.goto(`/crm/clients/${clientBId}`);
    await expect(page.getByText(name('service user A')).first()).toBeVisible();

    // External related person: details are held on the related-person record, not the client.
    await page.goto(`/crm/clients/${clientAId}`);
    await waitForHydratedForm(page, '#relationship');
    await page.getByRole('button', { name: 'External contact' }).click();
    await page.locator('#relationship-name').fill(name('external contact'));
    await page.locator('#relationship-type').selectOption(personType);
    await page.locator('#relationship-phone').fill('0113 496 0000');
    await page.locator('#relationship-email').fill('external-fixture@example.test');
    await page.getByRole('button', { name: 'Save relationship' }).click();
    await expect(page.locator('form:has(#relationship-name) .form-success')).toContainText('External contact linked to this profile.');

    const person = await prisma.relatedPerson.findFirstOrThrow({ where: { organisationId, fullName: name('external contact') } });
    const personLink = await prisma.clientRelationship.findFirstOrThrow({ where: { clientId: clientAId, relatedPersonId: person.id } });
    expect(person.phone).toBe('0113 496 0000');

    // Edit through the profile control, then unlink: the person records must survive.
    // Targeted by relationship id — a profile can hold several relationships and every editor
    // offers the same type list, so the id is what tells them apart. The summary must also name the
    // person, or the control is ambiguous for the person using it too.
    const editor = page.locator(`details.relationship-editor[data-relationship-id="${personLink.id}"]`);
    await expect(editor.locator('summary')).toContainText(name('external contact'));
    await editor.locator('summary').click();
    await editor.locator('input[name="notes"]').fill(name('edited relationship note'));
    await editor.locator('input[name="isNextOfKin"]').check();
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(editor.locator('.form-success')).toContainText('updated. The change shows on both profiles.');
    const edited = await prisma.clientRelationship.findUniqueOrThrow({ where: { id: personLink.id } });
    expect(edited.notes).toBe(name('edited relationship note'));
    expect(edited.isNextOfKin).toBe(true);

    await editor.getByRole('button', { name: 'Unlink relationship' }).click();
    await editor.getByRole('button', { name: 'Yes, unlink' }).click();
    await expect(editor.locator('.form-success')).toContainText('No other record was changed.');
    expect(await prisma.clientRelationship.count({ where: { id: personLink.id } })).toBe(0);
    expect(await prisma.client.findUnique({ where: { id: clientAId } }), 'unlinking must not delete either service user').not.toBeNull();
    expect(await prisma.client.findUnique({ where: { id: clientBId } })).not.toBeNull();
    expect(await prisma.relatedPerson.count({ where: { id: person.id } }), 'the related person is kept so the same contact can be linked again').toBe(1);
  });

  test('referral: created through the form, assigned, and moved on', async () => {
    await page.goto('/crm/referrals/new');
    await waitForHydratedForm(page, '#serviceId');
    const offered = await page.locator('select[name="serviceId"] option').evaluateAll((nodes) => nodes
      .map((node) => (node as HTMLOptionElement).value)
      .filter((value) => value !== ''));
    expect(offered.length, 'the referral form offered no service to choose from').toBeGreaterThan(0);
    const serviceId = offered[0];

    await page.getByLabel('Person or permitted identifier').fill(name('referral person'));
    await page.locator('select[name="serviceId"]').selectOption(serviceId);
    await page.getByLabel('Referrer name').fill(name('referrer'));
    await page.getByLabel('Referrer email').fill('workflow-fixture@example.test');
    await page.getByLabel('Current location or housing situation').fill('Staying with friends while a safe place is found.');
    await page.getByLabel('What is happening now?').fill('Housing has broken down and a safe place is needed urgently.');
    await page.getByLabel('Support needs').fill('Tenancy support and a settled home.');

    const [response] = await Promise.all([
      page.waitForResponse((candidate) => candidate.url().includes('/api/crm/referrals') && candidate.request().method() === 'POST'),
      page.getByRole('button', { name: 'Save referral' }).click()
    ]);
    const body = (await response.json()) as { id: string; reference: string; error?: string };
    created.referrals.push(body.id);
    expect(response.status(), `the endpoint refused an option the form itself offered: ${JSON.stringify(body)}`).toBe(200);
    await expect(page.locator('.form-success')).toContainText(`Referral ${body.reference} saved.`);
    await expect(page.locator('.form-error')).toHaveCount(0);

    const stored = await prisma.referral.findUniqueOrThrow({ where: { id: body.id } });
    expect(stored.organisationId).toBe(organisationId);
    expect(stored.serviceId).toBe(serviceId);
    expect(stored.status).toBe('NEW');
    expect(stored.personName).toBe(name('referral person'));

    const detail = await page.goto(`/crm/referrals/${body.id}`);
    expect(detail?.status()).toBe(200);
    await expect(page.getByText(body.reference).first()).toBeVisible();

    // Assign from the detail page control rather than by calling the endpoint directly.
    await waitForHydratedForm(page, '#assignedToId');
    await page.locator('select[name="assignedToId"]').selectOption(supportLeadId);
    await page.getByRole('button', { name: /Assign referral|Reassign referral/ }).click();
    await expect(page.locator('form:has(#assignedToId) .form-success')).toContainText('Assignment saved');
    expect(await prisma.referralAssignment.count({ where: { referralId: body.id, userId: supportLeadId } })).toBe(1);

    // Status: the select offers exactly the transitions the domain allows.
    await waitForHydratedForm(page, '#reason');
    const nextStatus = await page.locator('select[name="status"]').inputValue();
    expect(nextStatus).not.toBe('NEW');
    await page.locator('#reason').fill(name('moved on during the workflow audit'));
    await page.getByRole('button', { name: 'Save status change' }).click();
    await expect(page.locator('form:has(#reason) .form-success')).toContainText('Status change saved and audited.');
    const moved = await prisma.referral.findUniqueOrThrow({ where: { id: body.id } });
    expect(moved.status).toBe(nextStatus);
    expect(await prisma.referralStatusHistory.count({ where: { referralId: body.id } })).toBe(2);
  });

  test('task: created, edited, re-prioritised, progressed, and completed', async () => {
    await page.goto('/crm/tasks');
    await expect(page.locator('#task-title')).toBeEnabled();
    // The browser itself refuses an empty task, so the button cannot appear to do nothing.
    await expect(page.locator('#task-title')).toHaveAttribute('required', '');

    await page.locator('#task-title').fill(name('task'));
    await page.locator('#task-description').fill(name('task description'));
    await page.locator('#task-priority').selectOption('LOW');
    await page.locator('#task-due').fill(dayOffset(5));
    await page.locator('#task-assignee').selectOption(supportLeadId);
    await page.getByRole('button', { name: 'Create task' }).click();
    await expect(page.locator('form:has(#task-title) .form-success')).toContainText('Task created.');

    const task = await prisma.task.findFirstOrThrow({ where: { organisationId, title: name('task') } });
    created.tasks.push(task.id);
    expect(task.status).toBe('OPEN');
    expect(task.priority).toBe('LOW');
    expect(task.assignedToId).toBe(supportLeadId);

    // Progress from the queue exactly as staff do: the row control, not the endpoint.
    const row = page.locator('tr').filter({ hasText: name('task') }).first();
    const queueStatus = row.getByLabel('Task status');
    await expect(queueStatus).toBeEnabled();
    await queueStatus.selectOption('IN_PROGRESS');
    await expect.poll(async () => (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status, { timeout: 30000 }).toBe('IN_PROGRESS');

    // Edit priority, due date and assignee from the task page.
    await page.goto(`/crm/tasks/${task.id}`);
    await expect(page.locator('#task-priority')).toBeEnabled();
    await page.locator('#task-title').fill(name('task renamed'));
    await page.locator('#task-priority').selectOption('URGENT');
    await page.locator('#task-due').fill(dayOffset(2));
    await page.locator('#task-assignee').selectOption(adminUserId);
    await page.getByRole('button', { name: 'Save task' }).click();
    await expect(page.locator('.form-success')).toContainText('Task saved.');
    const edited = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(edited.title).toBe(name('task renamed'));
    expect(edited.priority).toBe('URGENT');
    expect(edited.assignedToId).toBe(adminUserId);

    // Complete from the queue and confirm the queue agrees with the database.
    await page.goto('/crm/tasks');
    const doneRow = page.locator('tr').filter({ hasText: name('task renamed') }).first();
    await expect(doneRow.getByLabel('Task status')).toBeEnabled();
    await doneRow.getByLabel('Task status').selectOption('DONE');
    await expect.poll(async () => (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status, { timeout: 30000 }).toBe('DONE');
    // Tasks are deliberately never destroyed — the queue must not offer a control that implies otherwise.
    await expect(doneRow.getByRole('button', { name: /delete|remove/i })).toHaveCount(0);
  });

  test('contacts and case notes: only a logged contact moves the planned-contact date', async () => {
    await page.goto(`/crm/clients/${clientAId}`);
    await expect(page.locator('#note')).toBeEnabled();
    const form = page.locator('form:has(#note)');
    const methods = await page.locator('#method option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
    const caseNoteMethod = methods.find((value) => value === 'OTHER') ?? methods[0];
    const contactMethod = methods.find((value) => value !== 'OTHER' && value !== '') ?? 'PHONE';
    expect(contactMethod, 'the form offers no way of recording an actual contact').not.toBe('OTHER');

    const saveNote = async (label: string, method: string, attempted: boolean) => {
      await page.locator('#contactType').fill(name(label));
      await page.locator('#category').fill(name('category'));
      await page.locator('#occurredAt').fill(localDateTime(-1));
      await page.locator('#method').selectOption(method);
      await page.locator('#note').fill(name(label));
      await page.locator('#durationMinutes').fill('30');
      const attemptedBox = page.locator('input[name="attempted"]');
      if (attempted) await attemptedBox.check(); else await attemptedBox.uncheck();
      await page.getByRole('button', { name: 'Save case note' }).click();
      await expect(form.locator('.form-success')).toBeVisible();
      return prisma.caseNote.findFirstOrThrow({ where: { clientId: clientAId, note: name(label) } });
    };

    // A structured case note is case-work narrative: it must not become a planned contact.
    const structured = await saveNote('structured case note', caseNoteMethod, false);
    expect(structured.method).toBe('OTHER');
    expect(structured.nextContactDueAt, 'a case note quietly became a planned contact').toBeNull();
    await expect(form.locator('.form-success')).toContainText('Saved as a case note.');

    // A real contact starts the planned-contact clock.
    const contact = await saveNote('planned contact', contactMethod, false);
    expect(contact.method).toBe(contactMethod);
    expect(contact.completed).toBe(true);
    expect(contact.nextContactDueAt, 'a genuine contact did not set the next planned contact').not.toBeNull();
    await expect(form.locator('.form-success')).toContainText('Saved and counted as support contact.');

    // A failed attempt is still a contact-log entry, but it must not satisfy the planned contact.
    const attempt = await saveNote('attempted contact', contactMethod, true);
    expect(attempt.attempted).toBe(true);
    expect(attempt.nextContactDueAt, 'a failed attempt was counted as delivered support').toBeNull();

    const stored = await prisma.caseNote.findMany({ where: { clientId: clientAId }, select: { nextContactDueAt: true } });
    expect(stored.filter((note) => note.nextContactDueAt !== null).length, 'exactly one note should carry a next-due date').toBe(1);
  });

  test('support plan: goal creates the plan, review is recorded, and an overdue review says so', async () => {
    await page.goto(`/crm/clients/${clientAId}`);
    await expect(page.locator('#goal-category')).toBeEnabled();
    expect(await prisma.supportPlan.count({ where: { clientId: clientAId } }), 'the fixture should start with no plan').toBe(0);

    await page.locator('#goal-category').fill(name('goal category'));
    await page.locator('#goal-owner').fill(name('goal owner'));
    await page.locator('#goal-outcome').fill(name('goal outcome'));
    await page.locator('#goal-actions').fill(name('goal action steps'));
    await page.locator('#goal-target').fill(dayOffset(21));
    await page.getByRole('button', { name: 'Add goal' }).click();
    await expect(page.locator('form:has(#goal-category) .form-success')).toContainText('Goal added to the support plan.');

    const plan = await prisma.supportPlan.findFirstOrThrow({ where: { clientId: clientAId }, include: { goals: true } });
    expect(plan.status).toBe('ACTIVE');
    expect(plan.goals).toHaveLength(1);
    expect(plan.goals[0]?.desiredOutcome).toBe(name('goal outcome'));

    // The review form only exists once there is a plan to review; it should now be usable.
    await expect(page.locator('#plan-review-date')).toBeEnabled();
    await page.locator('#plan-review-date').fill(dayOffset(-10));
    await page.locator('#plan-review-notes').fill(name('review notes'));
    await page.getByRole('button', { name: 'Save review' }).click();
    await expect(page.locator('form:has(#plan-review-date) .form-success')).toContainText('Support-plan review saved.');

    const reviewed = await prisma.supportPlan.findUniqueOrThrow({ where: { id: plan.id }, include: { reviews: true } });
    expect(reviewed.reviews).toHaveLength(1);
    expect(reviewed.reviewDate?.toISOString().slice(0, 10)).toBe(dayOffset(-10));

    // A past review date must be readable as overdue without relying on colour alone.
    await page.reload();
    await expect(page.getByText(/Review overdue/i).first()).toBeVisible();
  });
  test('incident: restricted by default, restriction can be lifted, then updated, actioned, and closed', async () => {
    expect(clientAId, 'the service user fixture was not created').toBeTruthy();
    await page.goto('/crm/incidents');
    await waitForHydratedForm(page, '#inc-category');
    const form = page.locator('form:has(#inc-category)');

    // Restricted is the safe default: an incident narrative is safeguarding material until staff say otherwise.
    const restrictedBox = form.locator('input[name="restricted"][type="checkbox"]');
    await expect(restrictedBox).toBeChecked();

    await form.locator('#inc-client').selectOption(clientAId);
    await form.locator('#inc-category').fill(name('restricted incident'));
    await form.locator('#inc-severity').selectOption('High');
    await form.locator('#inc-at').fill(localDateTime(-1));
    await form.locator('#inc-location').fill(name('incident location'));
    await form.locator('#inc-description').fill(name('restricted incident description'));
    await page.getByRole('button', { name: 'Record incident' }).click();
    await expect(form.locator('.form-success')).toContainText('recorded.');

    const restricted = await prisma.incident.findFirstOrThrow({ where: { organisationId, category: name('restricted incident') } });
    created.incidents.push(restricted.id);
    expect(restricted.restricted, 'an incident saved with the box ticked must stay restricted').toBe(true);
    expect(restricted.status).toBe('OPEN');
    expect(restricted.severity).toBe('High');
    expect(restricted.clientId).toBe(clientAId);
    expect(restricted.reference).toMatch(/^INC-\d{4}-\d{3}$/);

    // The register must never say who a restricted incident is about, even to signed-in staff lists.
    const restrictedRow = page.locator('tr').filter({ hasText: restricted.reference }).first();
    await expect(restrictedRow).toContainText('Restricted record');
    await expect(restrictedRow).not.toContainText(name('service user A'));


    // The "Restricted record" box must be able to say no. FormData omits an unticked checkbox
    // entirely, so the form pairs it with a hidden input; without that pairing the box looked
    // editable while every save silently fell back to the server's restricted default.
    await restrictedBox.uncheck();
    await form.locator('#inc-client').selectOption(clientAId);
    await form.locator('#inc-category').fill(name('open incident'));
    await form.locator('#inc-severity').selectOption('Low');
    await form.locator('#inc-at').fill(localDateTime(-1));
    await form.locator('#inc-description').fill(name('open incident description'));
    await page.getByRole('button', { name: 'Record incident' }).click();
    await expect(form.locator('.form-success')).toContainText('recorded.');

    const open = await prisma.incident.findFirstOrThrow({ where: { organisationId, category: name('open incident') } });
    created.incidents.push(open.id);
    expect(open.restricted, 'unticking "Restricted record" was ignored and the incident was restricted anyway').toBe(false);
    await expect(page.locator('tr').filter({ hasText: open.reference }).first()).toContainText(name('service user A'));

    await page.goto(`/crm/incidents/${open.id}`);
    await expect(page.locator('#status')).toBeEnabled();
    await expect(page.locator('.restricted-note')).toHaveCount(0);

    // Each follow-up panel must report its own outcome, as a confirmation, where staff are looking.
    await page.locator('#incident-update').fill(name('incident update'));
    await page.getByRole('button', { name: 'Save update' }).click();
    await expect(page.locator('form:has(#incident-update) .form-success')).toContainText('Incident update saved.');

    await page.locator('#incident-action').fill(name('incident action'));
    await page.locator('#incident-owner').fill(name('action owner'));
    await page.locator('#incident-due').fill(dayOffset(7));
    await page.getByRole('button', { name: 'Add action' }).click();
    await expect(page.locator('form:has(#incident-action) .form-success')).toContainText('Follow-up action added.');

    const updates = await prisma.incidentUpdate.findMany({ where: { incidentId: open.id } });
    expect(updates.map((item) => item.update)).toEqual([name('incident update')]);
    const action = await prisma.incidentAction.findFirstOrThrow({ where: { incidentId: open.id } });
    expect(action.action).toBe(name('incident action'));
    expect(action.owner).toBe(name('action owner'));
    expect(action.completedAt).toBeNull();

    // Completing an action is a row control rather than a form, so it must visibly strike through.
    await page.getByRole('button', { name: 'Complete action' }).click();
    await expect.poll(async () => (await prisma.incidentAction.findUniqueOrThrow({ where: { id: action.id } })).completedAt, { timeout: 30000 }).not.toBeNull();
    await expect(page.getByRole('button', { name: 'Reopen action' })).toBeVisible();

    // Saving a review must refresh the page: without it the badge keeps the old status and staff
    // cannot tell whether the closure was actually recorded.
    await page.locator('#severity').selectOption('Critical');
    await page.locator('#status').selectOption('CLOSED');
    await page.locator('#reviewDate').fill(dayOffset(30));
    await page.locator('#closureDecision').fill(name('closure decision'));
    await page.getByRole('button', { name: 'Save review' }).click();
    await expect(page.locator('form:has(#status) .form-success')).toContainText('closed saved.');

    const closed = await prisma.incident.findUniqueOrThrow({ where: { id: open.id } });
    expect(closed.status).toBe('CLOSED');
    expect(closed.severity).toBe('Critical');
    expect(closed.closureDecision).toBe(name('closure decision'));
    expect(closed.reviewDate?.toISOString().slice(0, 10)).toBe(dayOffset(30));
    await expect(page.locator('.panel-header').filter({ hasText: 'Incident status' }).locator('.crm-badge')).toContainText('Closed');
  });

  test('concerns: raised twice, progressed, resolved and closed — and only the record that was edited changed', async () => {
    expect(clientAId, 'the service user fixture was not created').toBeTruthy();
    await ensurePropertyFixture();
    await page.goto('/crm/concerns');
    await waitForHydratedForm(page, '#cn-title');
    const form = page.locator('form:has(#cn-title)');

    // The convention across the CRM: a required field is refused by the browser itself, so the
    // control can never look as though it did nothing. There is no React-side duplicate of it.
    await expect(page.locator('#cn-title')).toHaveAttribute('required', '');
    await expect(page.locator('#cn-summary')).toHaveAttribute('required', '');
    await form.getByRole('button', { name: 'Raise concern' }).click();
    await expect(form.locator('.form-success')).toHaveCount(0);
    expect(await prisma.concern.count({ where: { organisationId, title: { startsWith: prefix } } }), 'a blocked submission still wrote a row').toBe(0);

    // Safeguarding at high severity is referable by the domain itself, without anyone ticking the box.
    await page.locator('#cn-title').fill(name('concern A'));
    await page.locator('#cn-category').selectOption('SAFEGUARDING');
    await page.locator('#cn-severity').selectOption('HIGH');
    await page.locator('#cn-client').selectOption(clientAId);
    await page.locator('#cn-property').selectOption(propertyId);
    await page.locator('#cn-owner').selectOption(supportLeadId);
    await page.locator('#cn-due').fill(dayOffset(3));
    await page.locator('#cn-summary').fill(name('concern A summary'));
    await form.getByRole('button', { name: 'Raise concern' }).click();
    await expect(form.locator('.form-success')).toContainText('raised');

    const concernA = await prisma.concern.findFirstOrThrow({ where: { organisationId, title: name('concern A') } });
    created.concerns.push(concernA.id);
    expect(concernA.organisationId).toBe(organisationId);
    expect(concernA.reference).toMatch(/^CN-\d{4}-\d{3}$/);
    expect(concernA.clientId, 'the concern was not filed against the service user that was chosen').toBe(clientAId);
    expect(concernA.propertyId).toBe(propertyId);
    expect(concernA.summary).toBe(name('concern A summary'));
    expect(concernA.category).toBe('SAFEGUARDING');
    expect(concernA.severity).toBe('HIGH');
    expect(concernA.status).toBe('OPEN');
    expect(concernA.raisedById).toBe(adminUserId);
    expect(concernA.ownerId).toBe(supportLeadId);
    expect(concernA.dueAt?.toISOString().slice(0, 10)).toBe(dayOffset(3));
    expect(concernA.resolvedAt).toBeNull();
    expect(concernA.referralNeeded, 'a high-severity safeguarding concern is referable by the domain').toBe(true);

    // A second concern, unlinked and unassigned, so the register holds two similar rows and the
    // identical controls inside them have to be told apart.
    await page.locator('#cn-title').fill(name('concern B'));
    await page.locator('#cn-category').selectOption('WELFARE');
    await page.locator('#cn-severity').selectOption('LOW');
    await page.locator('#cn-client').selectOption('');
    await page.locator('#cn-property').selectOption('');
    await page.locator('#cn-owner').selectOption('');
    await page.locator('#cn-summary').fill(name('concern B summary'));
    await form.getByRole('button', { name: 'Raise concern' }).click();
    await expect(form.locator('.form-success')).toContainText('raised');

    const concernB = await prisma.concern.findFirstOrThrow({ where: { organisationId, title: name('concern B') } });
    created.concerns.push(concernB.id);
    expect(concernB.clientId).toBeNull();
    expect(concernB.ownerId, 'an unassigned concern still has an owner: whoever raised it').toBe(adminUserId);
    expect(concernB.referralNeeded).toBe(false);
    expect(concernB.dueAt, 'the response deadline is derived from the severity when nobody sets one').not.toBeNull();

    // Rows are targeted by title, not by the generated reference: two references raised in the same
    // month differ only in a random three-digit suffix, which is not a stable way to pick a row.
    const rowA = page.locator('tbody tr', { hasText: name('concern A') });
    await expect(rowA).toHaveCount(1);
    await expect(page.locator('tbody tr', { hasText: name('concern B') })).toHaveCount(1);

    // The status select carries the same accessible name in every row and in the filter bar, so the
    // row is the only thing that says which concern an edit belongs to.
    await rowA.getByLabel('Action taken').fill(name('concern A first action'));
    await rowA.getByLabel('Concern status').selectOption('IN_PROGRESS');
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect.poll(async () => (await prisma.concern.findUniqueOrThrow({ where: { id: concernA.id } })).status, { timeout: 30_000 }).toBe('IN_PROGRESS');

    const actions = await prisma.concernAction.findMany({ where: { concernId: concernA.id } });
    expect(actions.map((row) => row.note)).toEqual([name('concern A first action')]);
    expect(actions[0]?.authorId).toBe(adminUserId);

    const untouched = await prisma.concern.findUniqueOrThrow({ where: { id: concernB.id } });
    expect(untouched.status, 'the sibling concern was changed by an edit aimed at another row').toBe('OPEN');
    expect(await prisma.concernAction.count({ where: { concernId: concernB.id } })).toBe(0);

    // Resolving stamps the time the ageing report measures; closing keeps it.
    await rowA.getByLabel('Concern status').selectOption('RESOLVED');
    await rowA.getByLabel('Action taken').fill(name('concern A resolution action'));
    await rowA.getByLabel('Resolution').fill(name('concern A resolution'));
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect.poll(async () => (await prisma.concern.findUniqueOrThrow({ where: { id: concernA.id } })).status, { timeout: 30_000 }).toBe('RESOLVED');

    const resolved = await prisma.concern.findUniqueOrThrow({ where: { id: concernA.id } });
    expect(resolved.resolvedAt, 'resolving did not stamp the resolution time').not.toBeNull();
    expect(resolved.resolution).toBe(name('concern A resolution'));
    expect(await prisma.concernAction.count({ where: { concernId: concernA.id } })).toBe(2);

    await rowA.getByLabel('Concern status').selectOption('CLOSED');
    await rowA.getByLabel('Action taken').fill(name('concern A closed'));
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect.poll(async () => (await prisma.concern.findUniqueOrThrow({ where: { id: concernA.id } })).status, { timeout: 30_000 }).toBe('CLOSED');

    // The closed state has to survive a full page load, and be readable as words rather than colour.
    await page.reload();
    await waitForHydratedForm(page, '#cn-title');
    const closedRow = page.locator('tbody tr', { hasText: name('concern A') });
    await expect(closedRow.locator('.crm-badge').last()).toContainText('Closed');
    const stillClosed = await prisma.concern.findUniqueOrThrow({ where: { id: concernA.id } });
    expect(stillClosed.status).toBe('CLOSED');
    expect(stillClosed.resolvedAt, 'closing threw away the resolution time').not.toBeNull();

    // A closed concern can only be reopened. The select offers every status, so the domain has to
    // refuse the impossible move, say so where staff are looking, and change nothing.
    await closedRow.getByLabel('Concern status').selectOption('IN_PROGRESS');
    await closedRow.getByLabel('Action taken').fill(name('concern A impossible move'));
    await closedRow.getByRole('button', { name: 'Save' }).click();
    await expect(closedRow.locator('.form-error')).toContainText('That status change is not allowed from the current state.');
    expect((await prisma.concern.findUniqueOrThrow({ where: { id: concernA.id } })).status, 'a refused transition changed the record').toBe('CLOSED');
    // Three notes by now: the progress note, the resolution note and the closure note. The refused
    // attempt must not have appended a fourth, which is how a rejected write would leave a trace.
    expect(await prisma.concernAction.count({ where: { concernId: concernA.id } }), 'a refused transition wrote a history row').toBe(3);
    expect(await prisma.concernAction.count({ where: { concernId: concernA.id, note: name('concern A impossible move') } }), 'the refused note was stored anyway').toBe(0);

    // Safeguarding history is never destroyed: the register offers no destructive control at all.
    await expect(closedRow.getByRole('button', { name: /delete|remove|archive|void/i })).toHaveCount(0);

    const audits = await prisma.auditLog.findMany({ where: { resourceType: 'Concern', resourceId: concernA.id } });
    expect(audits.length, 'every concern lifecycle step is audited').toBe(4);
    expect(audits.every((row) => row.actorId === adminUserId && row.organisationId === organisationId && row.resourceId === concernA.id && row.success)).toBe(true);
    expect(audits.filter((row) => row.action === 'CONCERN_RAISED')).toHaveLength(1);
    expect(audits.filter((row) => row.action === 'CONCERN_UPDATED')).toHaveLength(1);
    expect(audits.filter((row) => row.action === 'CONCERN_RESOLVED'), 'resolving and closing are both recorded').toHaveLength(2);
    expect(audits.find((row) => row.action === 'CONCERN_RAISED')?.afterJson ?? '').toContain('SAFEGUARDING');

    // The service user's own record lists the concern, which is what proves the association is real.
    await page.goto(`/crm/clients/${clientAId}`);
    const reportedCard = page.locator('section.table-card').filter({ has: page.getByRole('heading', { name: 'Repairs and concerns' }) });
    const profileRow = reportedCard.locator('tbody tr', { hasText: name('concern A') });
    await expect(profileRow).toHaveCount(1);
    await expect(profileRow).toContainText('Concern');
    await expect(profileRow).toContainText('Closed');
  });

  test('complaints: logged twice, acknowledged and escalated, and an upheld complaint cannot close without learning', async () => {
    expect(clientAId, 'the service user fixture was not created').toBeTruthy();
    await page.goto('/crm/complaints');
    await waitForHydratedForm(page, '#cp-title');
    const form = page.locator('form:has(#cp-title)');
    const openBefore = Number(await page.locator('.metric-card', { hasText: 'Open complaints' }).locator('strong').textContent());

    await expect(page.locator('#cp-title')).toHaveAttribute('required', '');
    await expect(page.locator('#cp-summary')).toHaveAttribute('required', '');
    await form.getByRole('button', { name: 'Log complaint' }).click();
    await expect(form.locator('.form-success')).toHaveCount(0);
    expect(await prisma.complaint.count({ where: { organisationId, title: { startsWith: prefix } } }), 'a blocked submission still wrote a row').toBe(0);

    await page.locator('#cp-title').fill(name('complaint A'));
    await page.locator('#cp-category').selectOption('STAFF_CONDUCT');
    await page.locator('#cp-severity').selectOption('HIGH');
    await page.locator('#cp-stage').selectOption('STAGE_1');
    await page.locator('#cp-raised').selectOption('ADVOCATE');
    await page.locator('#cp-name').fill(name('complainant A'));
    await page.locator('#cp-date').fill(dayOffset(-2));
    await page.locator('#cp-client').selectOption(clientAId);
    await page.locator('#cp-owner').selectOption(supportLeadId);
    await page.locator('#cp-summary').fill(name('complaint A summary'));
    await form.getByRole('button', { name: 'Log complaint' }).click();
    await expect(form.locator('.form-success')).toContainText('logged');

    const complaintA = await prisma.complaint.findFirstOrThrow({ where: { organisationId, title: name('complaint A') } });
    created.complaints.push(complaintA.id);
    expect(complaintA.reference).toMatch(/^CMP-\d{4}-\d{3}$/);
    expect(complaintA.organisationId).toBe(organisationId);
    expect(complaintA.clientId, 'the complaint was not filed against the service user that was chosen').toBe(clientAId);
    expect(complaintA.ownerId).toBe(supportLeadId);
    expect(complaintA.complainantName).toBe(name('complainant A'));
    expect(complaintA.raisedBy).toBe('ADVOCATE');
    expect(complaintA.category).toBe('STAFF_CONDUCT');
    expect(complaintA.severity).toBe('HIGH');
    expect(complaintA.status).toBe('LOGGED');
    expect(complaintA.stage).toBe('STAGE_1');
    expect(complaintA.summary).toBe(name('complaint A summary'));
    expect(complaintA.receivedAt.toISOString().slice(0, 10)).toBe(dayOffset(-2));
    // The statutory clock belongs to the domain, not to whoever typed into the form: ten working
    // days from receipt, weekends skipped. The assertion asks the domain rather than restating it.
    expect(complaintA.dueAt?.getTime()).toBe(complaintTimescales(complaintA.receivedAt, 'STAGE_1').responseDueAt.getTime());
    expect(complaintA.acknowledgedAt).toBeNull();
    expect(complaintA.closedAt).toBeNull();
    expect(complaintA.outcome).toBeNull();

    // A second complaint, unlinked and undated, so the register holds two similar rows.
    await page.locator('#cp-title').fill(name('complaint B'));
    await page.locator('#cp-category').selectOption('TIMELINESS');
    await page.locator('#cp-severity').selectOption('LOW');
    await page.locator('#cp-raised').selectOption('SERVICE_USER');
    await page.locator('#cp-summary').fill(name('complaint B summary'));
    await form.getByRole('button', { name: 'Log complaint' }).click();
    await expect(form.locator('.form-success')).toContainText('logged');

    const complaintB = await prisma.complaint.findFirstOrThrow({ where: { organisationId, title: name('complaint B') } });
    created.complaints.push(complaintB.id);
    expect(complaintB.clientId).toBeNull();
    expect(complaintB.complainantName).toBeNull();
    expect(complaintB.ownerId, 'an unassigned complaint still has an owner: whoever logged it').toBe(adminUserId);
    expect(complaintB.dueAt?.getTime(), 'the deadline is derived from the stage when nobody sets one').toBe(complaintTimescales(complaintB.receivedAt, 'STAGE_1').responseDueAt.getTime());

    // Two logged complaints are two open complaints, and the dashboard has to say so.
    await page.reload();
    await expect(page.locator('.metric-card', { hasText: 'Open complaints' }).locator('strong')).toHaveText(String(openBefore + 2));

    const rowA = page.locator('tbody tr', { hasText: name('complaint A') });
    await expect(rowA).toHaveCount(1);

    // Acknowledging and moving to stage 2 in one save: the deadline has to be recalculated from the
    // new stage's twenty working days, not left on the stage 1 clock.
    await rowA.getByLabel('Complaint status').selectOption('ACKNOWLEDGED');
    await rowA.getByLabel('Complaint stage').selectOption('STAGE_2');
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect(rowA.locator('.crm-badge')).toContainText('Acknowledged');

    const acknowledged = await prisma.complaint.findUniqueOrThrow({ where: { id: complaintA.id } });
    expect(acknowledged.status).toBe('ACKNOWLEDGED');
    expect(acknowledged.stage).toBe('STAGE_2');
    expect(acknowledged.acknowledgedAt, 'acknowledging did not stamp the acknowledgement').not.toBeNull();
    expect(acknowledged.dueAt?.getTime(), 'moving stage left the deadline on the old clock').toBe(complaintTimescales(acknowledged.receivedAt, 'STAGE_2').responseDueAt.getTime());

    // The sibling is the whole point: an edit aimed at one row must not reach the other.
    const untouchedB = await prisma.complaint.findUniqueOrThrow({ where: { id: complaintB.id } });
    expect(untouchedB.status, 'the sibling complaint was changed by an edit aimed at another row').toBe('LOGGED');
    expect(untouchedB.stage).toBe('STAGE_1');
    expect(untouchedB.acknowledgedAt).toBeNull();
    expect(untouchedB.dueAt?.getTime()).toBe(complaintTimescales(untouchedB.receivedAt, 'STAGE_1').responseDueAt.getTime());

    // An upheld outcome is recorded while the complaint is still open.
    await rowA.getByLabel('Complaint status').selectOption('INVESTIGATING');
    await rowA.getByLabel('Complaint outcome').selectOption('UPHELD');
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect(rowA.locator('.crm-badge')).toContainText('Investigating');
    expect((await prisma.complaint.findUniqueOrThrow({ where: { id: complaintA.id } })).outcome).toBe('UPHELD');

    await rowA.getByLabel('Complaint status').selectOption('RESPONDED');
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect(rowA.locator('.crm-badge')).toContainText('Responded');

    // Closing an upheld complaint with nothing learned from it is refused. The form says the field
    // is required to close, so the refusal has to be real: no status change, no closure stamp.
    await rowA.getByLabel('Complaint status').selectOption('CLOSED');
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect(rowA.locator('.form-error')).toContainText('Record what the organisation has learned before closing a complaint with this outcome.');
    const refused = await prisma.complaint.findUniqueOrThrow({ where: { id: complaintA.id } });
    expect(refused.status, 'a refused closure changed the record anyway').toBe('RESPONDED');
    expect(refused.closedAt).toBeNull();
    expect(refused.learning).toBeNull();

    // The "Response given" field is accepted by the endpoint but the complaint has no column for it,
    // so nothing here asserts that it is stored. That gap is reported rather than papered over.
    await rowA.getByLabel('Learning').fill(name('complaint A learning'));
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect(rowA.locator('.crm-badge')).toContainText('Closed');

    const closed = await prisma.complaint.findUniqueOrThrow({ where: { id: complaintA.id } });
    expect(closed.status).toBe('CLOSED');
    expect(closed.learning).toBe(name('complaint A learning'));
    expect(closed.outcome, 'closing dropped the outcome').toBe('UPHELD');
    expect(closed.closedAt, 'closing did not stamp the closure').not.toBeNull();
    expect(closed.stage).toBe('STAGE_2');

    // One of the two is closed, so the open count falls by exactly one.
    await expect(page.locator('.metric-card', { hasText: 'Open complaints' }).locator('strong')).toHaveText(String(openBefore + 1));
    await expect(rowA.getByRole('button', { name: /delete|remove|archive|void/i })).toHaveCount(0);

    const audits = await prisma.auditLog.findMany({ where: { resourceType: 'Complaint', resourceId: complaintA.id } });
    expect(audits.length, 'logging plus four accepted updates are audited; the refused one is not').toBe(5);
    expect(audits.every((row) => row.actorId === adminUserId && row.organisationId === organisationId && row.resourceId === complaintA.id && row.success)).toBe(true);
    expect(audits.filter((row) => row.action === 'COMPLAINT_LOGGED')).toHaveLength(1);
    expect(audits.filter((row) => row.action === 'COMPLAINT_UPDATED')).toHaveLength(4);
    const lastAudit = audits.find((row) => (row.afterJson ?? '').includes('"status":"CLOSED"'));
    expect(lastAudit?.beforeJson ?? '', 'the audit trail keeps the state the complaint was in').toContain('RESPONDED');

    // The service user's own record lists the complaint by reference, stage and status.
    await page.goto(`/crm/clients/${clientAId}`);
    const panel = page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Complaints' }) });
    await expect(panel).toContainText(complaintA.reference);
    await expect(panel).toContainText('stage 2');
    await expect(panel).toContainText('Closed');
    await expect(panel).not.toContainText(complaintB.reference);
  });

  test('repairs: logged twice against a property, a safety-critical category escalates the SLA, and only the edited ticket moved', async () => {
    expect(clientAId && clientBId, 'the service user fixtures were not created').toBeTruthy();
    await ensurePropertyFixture();
    const roomsBefore = await prisma.room.findMany({ where: { propertyId }, select: { id: true, label: true, status: true }, orderBy: { label: 'asc' } });
    const propertyBefore = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });

    await page.goto('/crm/maintenance');
    await waitForHydratedForm(page, '#mt-title');
    const form = page.locator('form:has(#mt-title)');

    await expect(page.locator('#mt-title')).toHaveAttribute('required', '');
    await form.getByRole('button', { name: 'Log repair' }).click();
    await expect(form.locator('.form-success')).toHaveCount(0);
    expect(await prisma.maintenanceTicket.count({ where: { organisationId, title: { startsWith: prefix } } }), 'a blocked submission still wrote a row').toBe(0);

    // A repair with an agreed target date, against the fixture property and one of the service users.
    // The form has no room and no assigned-staff field: those exist on the endpoint but no screen
    // offers them, so nothing here pretends otherwise.
    await page.locator('#mt-title').fill(name('repair A'));
    await page.locator('#mt-category').selectOption('PLUMBING');
    await page.locator('#mt-trade').selectOption('PLUMBER');
    await page.locator('#mt-priority').selectOption('MEDIUM');
    await page.locator('#mt-target').fill(atTime(2, '17:00'));
    await page.locator('#mt-property').selectOption(propertyId);
    await page.locator('#mt-client').selectOption(clientAId);
    await page.locator('#mt-contractor').fill(name('contractor A'));
    await page.locator('#mt-description').fill(name('repair A description'));
    await form.getByRole('button', { name: 'Log repair' }).click();
    await expect(form.locator('.form-success')).toContainText('logged at MEDIUM priority.');

    const ticketA = await prisma.maintenanceTicket.findFirstOrThrow({ where: { organisationId, title: name('repair A') } });
    expect(ticketA.reference).toMatch(/^MT-\d{4}-\d{4}$/);
    expect(ticketA.organisationId).toBe(organisationId);
    expect(ticketA.propertyId, 'the repair was not logged against the property that was chosen').toBe(propertyId);
    expect(ticketA.clientId).toBe(clientAId);
    expect(ticketA.roomId).toBeNull();
    expect(ticketA.assignedToId).toBeNull();
    expect(ticketA.description).toBe(name('repair A description'));
    expect(ticketA.category).toBe('PLUMBING');
    expect(ticketA.trade).toBe('PLUMBER');
    expect(ticketA.priority).toBe('MEDIUM');
    expect(ticketA.status).toBe('REPORTED');
    expect(ticketA.safetyRisk).toBe(false);
    expect(ticketA.contractor).toBe(name('contractor A'));
    expect(ticketA.reportedById).toBe(adminUserId);
    expect(ticketA.completedAt).toBeNull();
    expect(ticketA.targetFixAt?.getTime(), 'the target date staff chose was replaced by the derived SLA').toBe(instantAt(2, '17:00').getTime());

    // Raising a ticket always leaves the first progress note, so the journey is evidenced from the start.
    const firstNotes = await prisma.maintenanceUpdate.findMany({ where: { ticketId: ticketA.id } });
    expect(firstNotes.map((row) => [row.status, row.note])).toEqual([['REPORTED', 'Repair reported.']]);
    expect(firstNotes[0]?.authorId).toBe(adminUserId);

    // The same form, but in a safety-critical category and at the lowest priority: the operations
    // domain escalates the SLA rather than trusting the priority the reporter picked.
    await page.locator('#mt-title').fill(name('repair B'));
    await page.locator('#mt-category').selectOption('GAS');
    await page.locator('#mt-trade').selectOption('GAS_ENGINEER');
    await page.locator('#mt-priority').selectOption('LOW');
    await page.locator('#mt-property').selectOption(propertyId);
    await page.locator('#mt-client').selectOption(clientBId);
    await page.locator('#mt-description').fill(name('repair B description'));
    await form.getByRole('button', { name: 'Log repair' }).click();
    await expect(form.locator('.form-success')).toContainText('logged at URGENT priority.');

    const ticketB = await prisma.maintenanceTicket.findFirstOrThrow({ where: { organisationId, title: name('repair B') } });
    expect(ticketB.priority, 'a gas repair logged as low priority was not escalated').toBe('URGENT');
    expect(ticketB.safetyRisk, 'the stored flag still says what the reporter ticked').toBe(false);
    expect(ticketB.status).toBe('REPORTED');
    expect(ticketB.clientId).toBe(clientBId);
    // No target date was given, so it is the urgent four-hour window from the moment it was reported.
    const slack = Math.abs((ticketB.targetFixAt?.getTime() ?? 0) - (ticketB.reportedAt.getTime() + 4 * 3_600_000));
    expect(slack, 'the derived target date is not the urgent SLA window').toBeLessThan(60_000);

    // Logging repairs must not disturb the property or its rooms.
    const roomsAfter = await prisma.room.findMany({ where: { propertyId }, select: { id: true, label: true, status: true }, orderBy: { label: 'asc' } });
    expect(roomsAfter).toEqual(roomsBefore);
    const propertyAfter = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
    expect(propertyAfter.capacity).toBe(propertyBefore.capacity);
    expect(propertyAfter.publicVacancyState).toBe(propertyBefore.publicVacancyState);

    // Both tickets name the property they were logged against.
    await expect(page.locator('tbody tr', { hasText: name('repair A') })).toContainText(propertyAfter.publicName);
    await expect(page.locator('tbody tr', { hasText: name('repair B') })).toContainText(propertyAfter.publicName);
  });

  test('repairs: reported to in progress to completed, a sibling is cancelled, and a completed repair stays historical', async () => {
    const ticketA = await prisma.maintenanceTicket.findFirstOrThrow({ where: { organisationId, title: name('repair A') } });
    const ticketB = await prisma.maintenanceTicket.findFirstOrThrow({ where: { organisationId, title: name('repair B') } });
    await page.goto('/crm/maintenance');
    await waitForHydratedForm(page, '#mt-title');

    const rowA = page.locator('tbody tr', { hasText: name('repair A') });
    const rowB = page.locator('tbody tr', { hasText: name('repair B') });
    await expect(rowA).toHaveCount(1);
    await expect(rowB).toHaveCount(1);

    // The browser refuses an empty progress note, and the endpoint asks for a few real characters, so
    // a one-letter note has to be refused where staff can see it rather than stored as noise.
    await expect(rowA.getByLabel('Progress note')).toHaveAttribute('required', '');
    await rowA.getByLabel('Repair status').selectOption('IN_PROGRESS');
    await rowA.getByLabel('Progress note').fill('x');
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect(rowA.locator('.form-error')).toContainText('Add a short progress note.');
    expect((await prisma.maintenanceTicket.findUniqueOrThrow({ where: { id: ticketA.id } })).status, 'a refused note still moved the ticket').toBe('REPORTED');
    expect(await prisma.maintenanceUpdate.count({ where: { ticketId: ticketA.id } })).toBe(1);

    // Reported to in progress, with the contractor that actually attended.
    await rowA.getByLabel('Contractor').fill(name('contractor A attending'));
    await rowA.getByLabel('Progress note').fill(name('repair A in progress note'));
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect(rowA.locator('.crm-badge').last()).toContainText('In Progress');

    const inProgress = await prisma.maintenanceTicket.findUniqueOrThrow({ where: { id: ticketA.id } });
    expect(inProgress.status).toBe('IN_PROGRESS');
    expect(inProgress.contractor, 'the contractor on the ticket was not updated').toBe(name('contractor A attending'));
    expect(inProgress.completedAt).toBeNull();
    expect(inProgress.targetFixAt?.getTime(), 'a status change silently cleared the agreed target date').toBe(instantAt(2, '17:00').getTime());
    const notes = await prisma.maintenanceUpdate.findMany({ where: { ticketId: ticketA.id }, orderBy: { createdAt: 'asc' } });
    expect(notes.map((row) => row.status)).toEqual(['REPORTED', 'IN_PROGRESS']);
    expect(notes[1]?.note).toBe(name('repair A in progress note'));

    // The sibling has not moved: this is the wrong-record regression the relationship editors had.
    expect((await prisma.maintenanceTicket.findUniqueOrThrow({ where: { id: ticketB.id } })).status).toBe('REPORTED');
    expect(await prisma.maintenanceUpdate.count({ where: { ticketId: ticketB.id } })).toBe(1);

    // In progress to completed stamps the completion the average-fix metric measures.
    await rowA.getByLabel('Repair status').selectOption('COMPLETED');
    await rowA.getByLabel('Progress note').fill(name('repair A completed note'));
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect(rowA.locator('.crm-badge').last()).toContainText('Completed');

    const completed = await prisma.maintenanceTicket.findUniqueOrThrow({ where: { id: ticketA.id } });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.completedAt, 'completing did not stamp the completion time').not.toBeNull();
    expect(await prisma.maintenanceUpdate.count({ where: { ticketId: ticketA.id } })).toBe(3);

    // Cancelling the sibling leaves the completed repair exactly as it was: history is not rewritten.
    await rowB.getByLabel('Repair status').selectOption('CANCELLED');
    await rowB.getByLabel('Progress note').fill(name('repair B cancelled note'));
    await rowB.getByRole('button', { name: 'Save' }).click();
    await expect(rowB.locator('.crm-badge').last()).toContainText('Cancelled');

    const cancelled = await prisma.maintenanceTicket.findUniqueOrThrow({ where: { id: ticketB.id } });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.completedAt, 'a cancelled repair is not a completed one').toBeNull();
    const stillCompleted = await prisma.maintenanceTicket.findUniqueOrThrow({ where: { id: ticketA.id } });
    expect(stillCompleted.status, 'cancelling one repair closed another').toBe('COMPLETED');
    expect(stillCompleted.completedAt?.getTime()).toBe(completed.completedAt?.getTime());

    // A completed repair can only be reopened. The refusal has to be visible and change nothing.
    await rowA.getByLabel('Repair status').selectOption('REPORTED');
    await rowA.getByLabel('Progress note').fill(name('repair A impossible move'));
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect(rowA.locator('.form-error')).toContainText('That status change is not allowed from the current state.');
    expect((await prisma.maintenanceTicket.findUniqueOrThrow({ where: { id: ticketA.id } })).status).toBe('COMPLETED');
    expect(await prisma.maintenanceUpdate.count({ where: { ticketId: ticketA.id } }), 'a refused transition wrote a progress note').toBe(3);

    // A repair is worked, then closed, then kept: the register offers no destructive control.
    await expect(rowA.getByRole('button', { name: /delete|remove|archive|void/i })).toHaveCount(0);

    const audits = await prisma.auditLog.findMany({ where: { resourceType: 'MaintenanceTicket', resourceId: { in: [ticketA.id, ticketB.id] } } });
    expect(audits.every((row) => row.actorId === adminUserId && row.organisationId === organisationId && row.success)).toBe(true);
    expect(audits.filter((row) => row.action === 'MAINTENANCE_TICKET_RAISED')).toHaveLength(2);
    expect(audits.filter((row) => row.action === 'MAINTENANCE_TICKET_UPDATED')).toHaveLength(2);
    expect(audits.filter((row) => row.action === 'MAINTENANCE_TICKET_COMPLETED')).toHaveLength(1);
    expect(audits.find((row) => row.action === 'MAINTENANCE_TICKET_COMPLETED')?.resourceId).toBe(ticketA.id);

    // The property profile lists rooms only — it does not list repairs — so the check that matters
    // here is that working on a ticket left the property and both of its rooms exactly as they were.
    await page.goto(`/crm/properties/${propertyId}`);
    await expect(page.getByRole('heading', { name: 'Rooms' })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: 'Fixture Room 1' })).toContainText('Available');
    await expect(page.locator('tbody tr', { hasText: 'Fixture Room 2' })).toContainText('Available');
  });

  test('appointments: booked for a service user, shown in the book, on the calendar and on the profile, then completed, cancelled and missed', async () => {
    expect(clientAId && clientBId, 'the service user fixtures were not created').toBeTruthy();
    await ensurePropertyFixture();
    await page.goto('/crm/appointments');
    await waitForHydratedForm(page, '#appt-title');
    const form = page.locator('form:has(#appt-title)');

    await expect(page.locator('#appt-title')).toHaveAttribute('required', '');
    await expect(page.locator('#appt-start')).toHaveAttribute('required', '');
    await form.getByRole('button', { name: 'Book appointment' }).click();
    await expect(form.locator('.form-success')).toHaveCount(0);
    expect(await prisma.appointment.count({ where: { organisationId, title: { startsWith: prefix } } }), 'a blocked submission still wrote a row').toBe(0);

    // An appointment that ends before it starts is refused with a reason, and nothing is stored.
    await page.locator('#appt-title').fill(name('impossible appointment'));
    await page.locator('#appt-start').fill(atTime(sundayOffset, '21:45'));
    await page.locator('#appt-end').fill(atTime(sundayOffset, '20:00'));
    await form.getByRole('button', { name: 'Book appointment' }).click();
    await expect(form.locator('.form-error')).toContainText('The appointment must end after it starts.');
    expect(await prisma.appointment.count({ where: { organisationId, title: name('impossible appointment') } })).toBe(0);

    // Booked inside the current week, so the calendar's Monday-to-Sunday strip can be checked too.
    await page.locator('#appt-title').fill(name('appointment A'));
    await page.locator('#appt-category').selectOption('KEY_WORK');
    await page.locator('#appt-owner').selectOption(supportLeadId);
    await page.locator('#appt-start').fill(atTime(sundayOffset, '21:45'));
    await page.locator('#appt-end').fill(atTime(sundayOffset, '22:35'));
    await page.locator('#appt-client').selectOption(clientAId);
    await page.locator('#appt-property').selectOption(propertyId);
    await page.locator('#appt-location').fill(name('appointment A location'));
    await page.locator('#appt-attendees').fill(name('appointment A attendees'));
    await page.locator('#appt-notes').fill(name('appointment A notes'));
    await form.getByRole('button', { name: 'Book appointment' }).click();
    await expect(form.locator('.form-success')).toContainText('Appointment booked.');

    const appointmentA = await prisma.appointment.findFirstOrThrow({ where: { organisationId, title: name('appointment A') } });
    created.appointments.push(appointmentA.id);
    expect(appointmentA.organisationId).toBe(organisationId);
    expect(appointmentA.clientId, 'the appointment was not booked for the service user that was chosen').toBe(clientAId);
    expect(appointmentA.propertyId).toBe(propertyId);
    expect(appointmentA.ownerId).toBe(supportLeadId);
    expect(appointmentA.category).toBe('KEY_WORK');
    expect(appointmentA.location).toBe(name('appointment A location'));
    expect(appointmentA.attendees).toBe(name('appointment A attendees'));
    expect(appointmentA.notes).toBe(name('appointment A notes'));
    expect(appointmentA.status).toBe('SCHEDULED');
    expect(appointmentA.allDay).toBe(false);
    expect(appointmentA.completedAt).toBeNull();
    expect(appointmentA.outcome).toBeNull();
    // The stored times are the wall-clock times that were typed, not a shifted UTC round-trip.
    expect(appointmentA.startsAt.getTime()).toBe(instantAt(sundayOffset, '21:45').getTime());
    expect(appointmentA.endsAt?.getTime()).toBe(instantAt(sundayOffset, '22:35').getTime());

    // Two more, on the two evenings before it, so the diary holds three similar rows and one can be
    // completed, one cancelled and one marked missed without any of them touching another.
    for (const [label, category, offset, client] of [
      ['appointment B', 'SUPPORT', sundayOffset - 1, clientBId],
      ['appointment C', 'REVIEW', sundayOffset - 2, clientAId]
    ] as const) {
      await page.locator('#appt-title').fill(name(label));
      await page.locator('#appt-category').selectOption(category);
      await page.locator('#appt-owner').selectOption(adminUserId);
      await page.locator('#appt-start').fill(atTime(offset, '21:45'));
      await page.locator('#appt-end').fill(atTime(offset, '22:35'));
      await page.locator('#appt-client').selectOption(client);
      await page.locator('#appt-notes').fill(name(`${label} notes`));
      await form.getByRole('button', { name: 'Book appointment' }).click();
      await expect(form.locator('.form-success')).toContainText('Appointment booked.');
      const stored = await prisma.appointment.findFirstOrThrow({ where: { organisationId, title: name(label) } });
      created.appointments.push(stored.id);
      expect(stored.clientId, `the appointment for ${label} was booked for the wrong person`).toBe(client);
      expect(stored.ownerId).toBe(adminUserId);
      expect(stored.category).toBe(category);
      expect(stored.status).toBe('SCHEDULED');
      expect(stored.startsAt.getTime()).toBe(instantAt(offset, '21:45').getTime());
      expect(stored.endsAt?.getTime()).toBe(instantAt(offset, '22:35').getTime());
    }

    // The same service user at the same time is refused rather than double-booked. Which clash the
    // domain reports first depends on what else is in the diary, so the status and the empty database
    // are what is asserted, plus a message the person booking can act on.
    await page.locator('#appt-title').fill(name('clashing appointment'));
    await page.locator('#appt-start').fill(atTime(sundayOffset, '21:45'));
    await page.locator('#appt-end').fill(atTime(sundayOffset, '22:35'));
    await page.locator('#appt-client').selectOption(clientAId);
    const [clash] = await Promise.all([
      page.waitForResponse((candidate) => candidate.url().includes('/api/crm/appointments') && candidate.request().method() === 'POST'),
      form.getByRole('button', { name: 'Book appointment' }).click()
    ]);
    expect(clash.status(), 'a double booking was accepted').toBe(409);
    await expect(form.locator('.form-error')).not.toBeEmpty();
    expect(await prisma.appointment.count({ where: { organisationId, title: name('clashing appointment') } })).toBe(0);
  });

  test('calendar: the booked appointment is on the right day, at the right time, for the right person, and opens the diary', async () => {
    const appointmentA = await prisma.appointment.findFirstOrThrow({ where: { organisationId, title: name('appointment A') } });
    const clientA = await prisma.client.findUniqueOrThrow({ where: { id: clientAId }, select: { displayName: true } });

    // The appointment book is the register of record: it names the person, the category and the status.
    await page.goto('/crm/appointments');
    const bookRow = page.locator('tbody tr', { hasText: name('appointment A') });
    await expect(bookRow).toHaveCount(1);
    await expect(bookRow).toContainText(clientA.displayName);
    await expect(bookRow).toContainText('key work');
    await expect(bookRow).toContainText('21:45');
    await expect(bookRow.locator('.crm-badge').last()).toContainText('Scheduled');

    await page.goto('/crm/calendar');
    const entryRow = page.locator('tbody tr', { hasText: name('appointment A') });
    await expect(entryRow).toHaveCount(1);
    await expect(entryRow).toContainText('Appointment');
    await expect(entryRow).toContainText(clientA.displayName);
    await expect(entryRow).toContainText('21:45');
    await expect(entryRow).toContainText('Until 22:35');
    // The calendar overrides the badge once an open appointment has passed, so the expectation is
    // derived from the stored record rather than assumed to be "Scheduled" at any hour of the run.
    const calendarBadge = (appointmentA.endsAt ?? appointmentA.startsAt).getTime() < Date.now() ? 'Overdue' : 'Scheduled';
    await expect(entryRow.locator('.crm-badge')).toContainText(calendarBadge);

    // The week strip has to file it under the day it actually starts and under no other day. This is
    // the day-boundary check: an off-by-one in the grid would file a Sunday visit under Monday.
    await expect(page.locator('.calendar-day')).toHaveCount(7);
    const dayCell = page.locator('.calendar-day', { has: page.locator('.calendar-entry', { hasText: name('appointment A') }) });
    await expect(dayCell, 'the appointment is on the wrong day of the week strip').toHaveCount(1);
    await expect(dayCell.locator('.calendar-day-head')).toContainText(weekdayLabel(sundayOffset));
    await expect(dayCell.locator('.calendar-day-head')).toContainText(dayLabel(sundayOffset));
    const entry = dayCell.locator('.calendar-entry', { hasText: name('appointment A') });
    await expect(entry.locator('.calendar-entry-kind')).toContainText('Appointment');
    await expect(entry.locator('.calendar-entry-time')).toContainText('21:45');

    // Clicking through from the calendar lands where the calendar says it will.
    await entryRow.getByRole('link', { name: 'Appointment book' }).click();
    await expect(page).toHaveURL(/\/crm\/appointments$/);
    await expect(page.locator('tbody tr', { hasText: name('appointment A') })).toHaveCount(1);

    // The service user's own record lists the same appointment, at the same time, in the same state.
    await page.goto(`/crm/clients/${clientAId}`);
    const diaryCard = page.locator('section.table-card').filter({ has: page.getByRole('heading', { name: 'Appointments and visits' }) });
    const profileRow = diaryCard.locator('tbody tr', { hasText: name('appointment A') });
    await expect(profileRow).toHaveCount(1);
    await expect(profileRow).toContainText('21:45');
    await expect(profileRow).toContainText('key work');
    await expect(profileRow).toContainText('Scheduled');
  });

  test('appointments: one completed, one cancelled, one missed — and the closed ones stay in the book but leave the working diary', async () => {
    const appointmentA = await prisma.appointment.findFirstOrThrow({ where: { organisationId, title: name('appointment A') } });
    const appointmentB = await prisma.appointment.findFirstOrThrow({ where: { organisationId, title: name('appointment B') } });
    const appointmentC = await prisma.appointment.findFirstOrThrow({ where: { organisationId, title: name('appointment C') } });

    await page.goto('/crm/appointments');
    await waitForHydratedForm(page, '#appt-title');
    const rowA = page.locator('tbody tr', { hasText: name('appointment A') });
    const rowB = page.locator('tbody tr', { hasText: name('appointment B') });
    const rowC = page.locator('tbody tr', { hasText: name('appointment C') });

    // Confirming has nothing to report, so the control does not ask for an outcome.
    await rowA.getByLabel('Appointment status').selectOption('CONFIRMED');
    await expect(rowA.getByLabel('Outcome')).toHaveCount(0);
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect(rowA.locator('.crm-badge').last()).toContainText('Confirmed');
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentA.id } })).status).toBe('CONFIRMED');

    // Completing records the outcome and the note against this appointment, and only this one.
    await rowA.getByLabel('Appointment status').selectOption('COMPLETED');
    await rowA.getByLabel('Outcome').fill(name('appointment A outcome'));
    await rowA.getByLabel('Appointment note').fill(name('appointment A completion note'));
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect(rowA.locator('.crm-badge').last()).toContainText('Completed');

    const completed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentA.id } });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.outcome).toBe(name('appointment A outcome'));
    expect(completed.notes, 'the completion note was not stored').toBe(name('appointment A completion note'));
    expect(completed.completedAt, 'completing did not stamp the completion').not.toBeNull();
    expect(completed.startsAt.getTime(), 'a status change moved the appointment').toBe(instantAt(sundayOffset, '21:45').getTime());
    expect(completed.clientId).toBe(clientAId);

    // The siblings have not moved: three similar rows, three identical controls, one record changed.
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentB.id } })).status).toBe('SCHEDULED');
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentC.id } })).status).toBe('SCHEDULED');
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentB.id } })).outcome).toBeNull();

    // Cancelling keeps the appointment in the book and on the profile, but out of the working diary:
    // the calendar is what is coming up, the appointment book is the history.
    await rowB.getByLabel('Appointment status').selectOption('CANCELLED');
    await rowB.getByLabel('Outcome').fill(name('appointment B cancelled reason'));
    await rowB.getByRole('button', { name: 'Save' }).click();
    await expect(rowB.locator('.crm-badge').last()).toContainText('Cancelled');

    const cancelled = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentB.id } });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.outcome).toBe(name('appointment B cancelled reason'));
    expect(cancelled.clientId).toBe(clientBId);

    // A missed appointment is its own outcome, not a cancellation: the diary has to be able to say
    // that nobody turned up, which is different from a visit that never should have been booked.
    await rowC.getByLabel('Appointment status').selectOption('MISSED');
    await rowC.getByLabel('Outcome').fill(name('appointment C missed reason'));
    await rowC.getByRole('button', { name: 'Save' }).click();
    await expect(rowC.locator('.crm-badge').last()).toContainText('Missed');
    const missed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentC.id } });
    expect(missed.status).toBe('MISSED');
    expect(missed.outcome).toBe(name('appointment C missed reason'));

    // A completed appointment can only be reopened. The refusal has to be visible and change nothing.
    await rowA.getByLabel('Appointment status').selectOption('CANCELLED');
    await rowA.getByLabel('Outcome').fill(name('appointment A impossible move'));
    await rowA.getByRole('button', { name: 'Save' }).click();
    await expect(rowA.locator('.form-error')).toContainText('That status change is not allowed from the current state.');
    const stillCompleted = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentA.id } });
    expect(stillCompleted.status).toBe('COMPLETED');
    expect(stillCompleted.outcome, 'a refused transition overwrote the recorded outcome').toBe(name('appointment A outcome'));

    // An appointment is completed, cancelled or missed — never destroyed.
    await expect(rowA.getByRole('button', { name: /delete|remove|archive|void/i })).toHaveCount(0);

    // All three stay in the appointment book, which is the history staff go back to.
    await page.reload();
    await waitForHydratedForm(page, '#appt-title');
    for (const label of ['appointment A', 'appointment B', 'appointment C']) {
      await expect(page.locator('tbody tr', { hasText: name(label) }), `${label} disappeared from the appointment book`).toHaveCount(1);
    }
    await expect(page.locator('tbody tr', { hasText: name('appointment A') }).locator('.crm-badge').last()).toContainText('Completed');
    await expect(page.locator('tbody tr', { hasText: name('appointment B') }).locator('.crm-badge').last()).toContainText('Cancelled');
    await expect(page.locator('tbody tr', { hasText: name('appointment C') }).locator('.crm-badge').last()).toContainText('Missed');

    // None of them is on the working diary any more: the calendar is what is coming up, and leaving a
    // finished visit on it would be the bug, not removing it.
    await page.goto('/crm/calendar');
    for (const label of ['appointment A', 'appointment B', 'appointment C']) {
      await expect(page.locator('tbody tr', { hasText: name(label) }), `${label} is still on the working diary`).toHaveCount(0);
    }

    // And the cancelled appointment is still on the profile of the person it was booked for.
    await page.goto(`/crm/clients/${clientBId}`);
    const diaryCard = page.locator('section.table-card').filter({ has: page.getByRole('heading', { name: 'Appointments and visits' }) });
    const profileRow = diaryCard.locator('tbody tr', { hasText: name('appointment B') });
    await expect(profileRow).toHaveCount(1);
    await expect(profileRow).toContainText('Cancelled');
    await expect(profileRow).toContainText(name('appointment B cancelled reason'));

    const audits = await prisma.auditLog.findMany({ where: { resourceType: 'Appointment', resourceId: { in: [appointmentA.id, appointmentB.id, appointmentC.id] } } });
    expect(audits.every((row) => row.actorId === adminUserId && row.organisationId === organisationId && row.success)).toBe(true);
    expect(audits.filter((row) => row.action === 'APPOINTMENT_CREATED')).toHaveLength(3);
    expect(audits.filter((row) => row.action === 'APPOINTMENT_STATUS_CHANGED'), 'only the confirmation carried no outcome').toHaveLength(1);
    expect(audits.filter((row) => row.action === 'APPOINTMENT_OUTCOME_RECORDED')).toHaveLength(3);
    expect(audits.find((row) => row.action === 'APPOINTMENT_CREATED' && row.resourceId === appointmentA.id)?.afterJson ?? '').toContain(clientAId);
  });

  test('invoices: created with line items as integer pence, issued, part-paid and paid, with the refusals staying refused', async () => {
    // What is actually writable here: a draft invoice with line items, a status change, and a payment.
    // There is no service-user field, no period start or end, no line-item editing and no delete — an
    // invoice is issued, paid or voided. Nothing below invents a workflow the screen does not offer.
    const referenceA = `E2E-INV-${stamp}-A`;
    const referenceB = `E2E-INV-${stamp}-B`;
    await page.goto('/crm/billing');
    await waitForHydratedForm(page, '#invoice-reference');
    const form = page.locator('form:has(#invoice-reference)');

    await expect(page.locator('#invoice-reference')).toHaveAttribute('required', '');
    await expect(page.locator('#invoice-description-0')).toHaveAttribute('required', '');
    await expect(page.locator('#invoice-quantity-0')).toHaveAttribute('required', '');
    await expect(page.locator('#invoice-amount-0')).toHaveAttribute('required', '');
    await form.getByRole('button', { name: 'Create draft invoice' }).click();
    await expect(form.locator('.form-success')).toHaveCount(0);
    expect(await prisma.invoice.count({ where: { organisationId, reference: { contains: stamp } } }), 'a blocked submission still wrote a row').toBe(0);

    // The amount is a decimal text input, so the browser cannot check its shape: this validation has
    // to be the app's, and it has to be reachable.
    await page.locator('#invoice-reference').fill(referenceA);
    await page.locator('#invoice-description-0').fill(name('invoice A line one'));
    await page.locator('#invoice-amount-0').fill('not an amount');
    await form.getByRole('button', { name: 'Create draft invoice' }).click();
    await expect(form.locator('.form-error')).toContainText('Enter each line amount as pounds, for example 125.00.');
    expect(await prisma.invoice.count({ where: { reference: referenceA } }), 'a refused amount still wrote an invoice').toBe(0);

    // Two line items: pounds in, integer pence out, and the total is the sum of quantity times unit.
    await page.locator('#invoice-reference').fill(referenceA);
    await page.locator('#invoice-due').fill(dayOffset(14));
    await page.locator('#invoice-description-0').fill(name('invoice A line one'));
    await page.locator('#invoice-quantity-0').fill('2');
    await page.locator('#invoice-amount-0').fill('125.00');
    await form.getByRole('button', { name: 'Add line item' }).click();
    await page.locator('#invoice-description-1').fill(name('invoice A line two'));
    await page.locator('#invoice-quantity-1').fill('1');
    await page.locator('#invoice-amount-1').fill('40.50');
    await form.getByRole('button', { name: 'Create draft invoice' }).click();
    await expect(form.locator('.form-success')).toContainText(`Invoice ${referenceA} created.`);

    const invoiceA = await prisma.invoice.findUniqueOrThrow({ where: { reference: referenceA }, include: { items: true } });
    created.invoices.push(invoiceA.id);
    expect(invoiceA.organisationId).toBe(organisationId);
    expect(invoiceA.status).toBe('DRAFT');
    expect(invoiceA.clientId, 'the invoice form offers no service user, so none may be quietly attached').toBeNull();
    expect(invoiceA.issuedAt).toBeNull();
    expect(invoiceA.periodStart).toBeNull();
    expect(invoiceA.periodEnd).toBeNull();
    expect(invoiceA.dueAt?.toISOString().slice(0, 10)).toBe(dayOffset(14));
    expect(invoiceA.totalMinor, 'the total is not the sum of the line items').toBe(2 * 12_500 + 4_050);
    expect(invoiceA.items.map((item) => [item.description, item.quantity, item.unitMinor])).toEqual([
      [name('invoice A line one'), 2, 12_500],
      [name('invoice A line two'), 1, 4_050]
    ]);

    // A second invoice, so the register holds two similar rows with identical status and payment controls.
    await page.locator('#invoice-reference').fill(referenceB);
    await page.locator('#invoice-description-0').fill(name('invoice B line one'));
    await page.locator('#invoice-quantity-0').fill('1');
    await page.locator('#invoice-amount-0').fill('60.00');
    await form.getByRole('button', { name: 'Create draft invoice' }).click();
    await expect(form.locator('.form-success')).toContainText(`Invoice ${referenceB} created.`);

    const invoiceB = await prisma.invoice.findUniqueOrThrow({ where: { reference: referenceB }, include: { items: true } });
    created.invoices.push(invoiceB.id);
    expect(invoiceB.status).toBe('DRAFT');
    expect(invoiceB.totalMinor).toBe(6_000);
    expect(invoiceB.items).toHaveLength(1);

    // Both rows name their line items, which is what tells two invoices apart on screen.
    const rowA = page.locator('tbody tr', { hasText: referenceA });
    const rowB = page.locator('tbody tr', { hasText: referenceB });
    await expect(rowA).toHaveCount(1);
    await expect(rowB).toHaveCount(1);
    await expect(rowA).toContainText(name('invoice A line one'));
    await expect(rowA).toContainText(name('invoice A line two'));
    await expect(rowA).toContainText('290.50');
    await expect(rowB).toContainText('60.00');

    // Issuing one invoice must not issue the other: the status control looks the same in every row.
    await rowA.getByLabel('Invoice status').selectOption('ISSUED');
    await expect.poll(async () => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA.id } })).status, { timeout: 30_000 }).toBe('ISSUED');
    const issued = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA.id } });
    expect(issued.issuedAt, 'issuing did not stamp the issue date').not.toBeNull();
    expect(issued.totalMinor).toBe(29_050);
    const siblingDraft = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceB.id } });
    expect(siblingDraft.status, 'the sibling invoice was issued by a change aimed at another row').toBe('DRAFT');
    expect(siblingDraft.issuedAt).toBeNull();

    // A part payment: the invoice follows the money rather than being told what to be.
    await rowA.getByLabel('Payment amount in pounds').fill('100.00');
    await rowA.getByLabel('Payment method').selectOption('CASH');
    await rowA.getByRole('button', { name: 'Record' }).click();
    await expect(rowA.locator('.form-success')).toContainText('Payment recorded.');

    const partPaid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA.id }, include: { payments: true } });
    expect(partPaid.status, 'a part payment did not move the invoice to part paid').toBe('PART_PAID');
    expect(partPaid.payments).toHaveLength(1);
    expect(partPaid.payments[0]?.amountMinor).toBe(10_000);
    expect(partPaid.payments[0]?.method).toBe('CASH');
    expect(partPaid.payments[0]?.paidAt.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
    await expect(rowA).toContainText('190.50');

    // Paying more than is outstanding is refused, and the invoice that was aimed at is not the one
    // that was paid — so the refusal has to leave both invoices exactly as they were.
    await rowB.getByLabel('Payment amount in pounds').fill('100.00');
    await rowB.getByRole('button', { name: 'Record' }).click();
    await expect(rowB.locator('.text-danger')).toContainText('Payment cannot exceed the remaining invoice balance.');
    expect(await prisma.payment.count({ where: { invoiceId: invoiceB.id } }), 'an overpayment was stored').toBe(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceB.id } })).status).toBe('DRAFT');
    expect((await prisma.payment.count({ where: { invoiceId: invoiceA.id } })), 'an overpayment on one invoice landed on another').toBe(1);

    // Settling the balance closes the invoice and stops asking for more money.
    await rowA.getByLabel('Payment amount in pounds').fill('190.50');
    await rowA.getByLabel('Payment method').selectOption('BANK_TRANSFER');
    await rowA.getByRole('button', { name: 'Record' }).click();
    await expect.poll(async () => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA.id } })).status, { timeout: 30_000 }).toBe('PAID');

    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA.id }, include: { payments: true } });
    expect(paid.payments).toHaveLength(2);
    expect(paid.payments.reduce((total, payment) => total + payment.amountMinor, 0)).toBe(29_050);
    await expect(rowA.getByText('Paid in full')).toBeVisible();

    // A paid invoice cannot be dragged back to draft, and cannot be voided once money has been taken.
    await rowA.getByLabel('Invoice status').selectOption('DRAFT');
    await expect(rowA.locator('.text-danger')).toContainText('A paid invoice cannot be returned to draft.');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA.id } })).status, 'a refused change still moved the invoice').toBe('PAID');

    await rowA.getByLabel('Invoice status').selectOption('VOID');
    await expect(rowA.locator('.text-danger')).toContainText('An invoice with payments cannot be voided.');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceA.id } })).status).toBe('PAID');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceB.id } })).status, 'voiding one invoice voided the other').toBe('DRAFT');

    // Voiding is the replacement for deleting, and it is only offered while nothing has been paid.
    await rowB.getByLabel('Invoice status').selectOption('VOID');
    await expect.poll(async () => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceB.id } })).status, { timeout: 30_000 }).toBe('VOID');

    // A void invoice cannot take money either, even though the row still shows a balance.
    await rowB.getByLabel('Payment amount in pounds').fill('10.00');
    await rowB.getByRole('button', { name: 'Record' }).click();
    await expect(rowB.locator('form .text-danger')).toContainText('A void invoice cannot receive a payment.');
    expect(await prisma.payment.count({ where: { invoiceId: invoiceB.id } }), 'a payment was taken on a void invoice').toBe(0);

    // Nothing here is destroyed: the row offers a status, a payment and a PDF, and that is all.
    await expect(rowA.getByRole('button', { name: /delete|remove|archive/i })).toHaveCount(0);
    await expect(rowB.getByRole('button', { name: /delete|remove|archive/i })).toHaveCount(0);
    await expect(rowB.getByRole('link', { name: 'PDF' })).toBeVisible();

    // The headline outstanding figure has to be the sum the invoices actually add up to.
    const allInvoices = await prisma.invoice.findMany({ where: { organisationId }, include: { payments: true } });
    const expectedMinor = allInvoices
      .filter((invoice) => !['PAID', 'VOID'].includes(invoice.status))
      .reduce((total, invoice) => total + Math.max(0, invoice.totalMinor - invoice.payments.reduce((sum, payment) => sum + payment.amountMinor, 0)), 0);
    await page.reload();
    await waitForHydratedForm(page, '#invoice-reference');
    const shown = await page.locator('.metric-card', { hasText: 'Outstanding invoices' }).locator('strong').textContent();
    expect(Math.round(Number((shown ?? '').replace(/[^0-9.]/g, '')) * 100), 'the outstanding total does not match the invoices').toBe(expectedMinor);

    const invoiceAudits = await prisma.auditLog.findMany({ where: { resourceType: 'Invoice', resourceId: { in: [invoiceA.id, invoiceB.id] } } });
    expect(invoiceAudits.every((row) => row.actorId === adminUserId && row.organisationId === organisationId && row.success)).toBe(true);
    expect(invoiceAudits.filter((row) => row.action === 'INVOICE_CREATED')).toHaveLength(2);
    expect(invoiceAudits.filter((row) => row.action === 'INVOICE_STATUS_CHANGED'), 'issuing and voiding are audited; the two refusals are not').toHaveLength(2);

    // A payment is audited against the payment itself, and names the invoice it settled.
    const paymentAudits = await prisma.auditLog.findMany({ where: { action: 'INVOICE_PAYMENT_RECORDED' } });
    const ours = paymentAudits.filter((row) => (row.afterJson ?? '').includes(invoiceA.id));
    expect(ours).toHaveLength(2);
    expect(ours.every((row) => row.actorId === adminUserId && row.organisationId === organisationId && row.resourceType === 'Payment')).toBe(true);
    expect(ours.map((row) => row.afterJson ?? '').join()).toContain('"amountMinor":10000');
  });

  test('housing benefit: one claim per service user, amended in place and audited, with a sibling claim untouched', async () => {
    expect(clientAId && clientBId, 'the service user fixtures were not created').toBeTruthy();
    const clientA = await prisma.client.findUniqueOrThrow({ where: { id: clientAId }, select: { reference: true } });
    await page.goto('/crm/billing');
    await waitForHydratedForm(page, '#hb-client');
    const form = page.locator('form:has(#hb-client)');
    expect(await prisma.housingBenefitClaim.count({ where: { clientId: { in: [clientAId, clientBId] } } }), 'the fixtures should start with no claim').toBe(0);

    // Choosing a service user with no claim offers to create one, starting from the domain defaults.
    await page.locator('#hb-client').selectOption(clientAId);
    await expect(form.getByRole('button', { name: 'Create claim' })).toBeEnabled();
    await expect(page.locator('#hb-status')).toHaveValue('NOT_STARTED');
    await expect(page.locator('#hb-payment-status')).toHaveValue('PENDING');
    await expect(page.locator('#hb-rent')).toHaveValue('0.00');

    await page.locator('#hb-status').selectOption('SUBMITTED');
    await page.locator('#hb-submitted').fill(dayOffset(-5));
    await page.locator('#hb-evidence').fill(name('hb evidence for A'));
    await page.locator('#hb-rent').fill('185.00');
    await page.locator('#hb-service-charge').fill('22.50');
    await form.getByRole('button', { name: 'Create claim' }).click();
    await expect(form.locator('.form-success')).toContainText('Housing Benefit claim saved.');

    const claimA = await prisma.housingBenefitClaim.findFirstOrThrow({ where: { clientId: clientAId } });
    expect(claimA.status).toBe('SUBMITTED');
    expect(claimA.paymentStatus).toBe('PENDING');
    expect(claimA.submittedAt?.toISOString().slice(0, 10)).toBe(dayOffset(-5));
    expect(claimA.evidenceRequired).toBe(name('hb evidence for A'));
    expect(claimA.weeklyRentMinor, 'the rent was not stored as integer pence').toBe(18_500);
    expect(claimA.serviceChargeMinor).toBe(2_250);

    // A second service user gets a second claim, so the page holds two similar records and one
    // dropdown decides which of them a save belongs to.
    await page.locator('#hb-client').selectOption(clientBId);
    await expect(form.getByRole('button', { name: 'Create claim' })).toBeEnabled();
    await expect(page.locator('#hb-status'), 'switching service user left the previous claim on the form').toHaveValue('NOT_STARTED');
    await page.locator('#hb-status').selectOption('PENDING');
    await page.locator('#hb-rent').fill('90.00');
    await page.locator('#hb-service-charge').fill('0.00');
    await form.getByRole('button', { name: 'Create claim' }).click();
    await expect(form.locator('.form-success')).toContainText('Housing Benefit claim saved.');

    const claimB = await prisma.housingBenefitClaim.findFirstOrThrow({ where: { clientId: clientBId } });
    expect(claimB.id, 'both service users were written to the same claim').not.toBe(claimA.id);
    expect(claimB.status).toBe('PENDING');
    expect(claimB.paymentStatus).toBe('PENDING');
    expect(claimB.weeklyRentMinor).toBe(9_000);
    expect(claimB.serviceChargeMinor).toBe(0);
    expect(claimB.submittedAt, 'a claim nobody has submitted yet carries a submission date').toBeNull();
    expect(claimB.evidenceRequired).toBeNull();

    const claimsCard = page.locator('section.table-card').filter({ has: page.getByRole('heading', { name: 'Housing Benefit claims' }) });
    await expect(claimsCard.locator('tbody tr', { hasText: clientA.reference })).toContainText('185.00');
    await expect(claimsCard.locator('tbody tr', { hasText: clientA.reference })).toContainText(name('hb evidence for A'));

    // Amending the first claim: the form has round-tripped what is stored, so an update cannot
    // quietly zero a field nobody touched, and it cannot create a second claim for the same person.
    await page.locator('#hb-client').selectOption(clientAId);
    await expect(form.getByRole('button', { name: 'Save claim update' })).toBeEnabled();
    await expect(page.locator('#hb-status')).toHaveValue('SUBMITTED');
    await expect(page.locator('#hb-rent')).toHaveValue('185.00');
    await expect(page.locator('#hb-service-charge')).toHaveValue('22.50');
    await expect(page.locator('#hb-evidence')).toHaveValue(name('hb evidence for A'));
    await expect(page.locator('#hb-submitted')).toHaveValue(dayOffset(-5));

    await page.locator('#hb-status').selectOption('IN_PAYMENT');
    await page.locator('#hb-payment-status').selectOption('IN_PAYMENT');
    await page.locator('#hb-rent').fill('190.00');
    await form.getByRole('button', { name: 'Save claim update' }).click();
    await expect(form.locator('.form-success')).toContainText('Housing Benefit claim saved.');

    const amended = await prisma.housingBenefitClaim.findUniqueOrThrow({ where: { id: claimA.id } });
    expect(amended.status).toBe('IN_PAYMENT');
    expect(amended.paymentStatus).toBe('IN_PAYMENT');
    expect(amended.weeklyRentMinor).toBe(19_000);
    expect(amended.serviceChargeMinor, 'an update zeroed a field nobody edited').toBe(2_250);
    expect(amended.evidenceRequired, 'an update dropped the evidence action').toBe(name('hb evidence for A'));
    expect(amended.submittedAt?.toISOString().slice(0, 10)).toBe(dayOffset(-5));
    expect(await prisma.housingBenefitClaim.count({ where: { clientId: clientAId } }), 'an update started a second claim instead of amending the one').toBe(1);

    // The sibling claim is the whole point: one dropdown decides whose claim a save belongs to.
    const untouchedB = await prisma.housingBenefitClaim.findUniqueOrThrow({ where: { id: claimB.id } });
    expect(untouchedB.status, 'the sibling claim was changed by a save aimed at another service user').toBe('PENDING');
    expect(untouchedB.paymentStatus).toBe('PENDING');
    expect(untouchedB.weeklyRentMinor).toBe(9_000);

    // The amount is a decimal text input, so the shape check has to be the app's, and reachable.
    await page.locator('#hb-rent').fill('not an amount');
    await form.getByRole('button', { name: 'Save claim update' }).click();
    await expect(form.locator('.form-error')).toContainText('Enter rent and service charge as pounds, for example 185.00.');
    expect((await prisma.housingBenefitClaim.findUniqueOrThrow({ where: { id: claimA.id } })).weeklyRentMinor, 'a refused amount was stored anyway').toBe(19_000);

    // Closing the claim is an ordinary amendment of the same record, not a new event row.
    await page.locator('#hb-rent').fill('190.00');
    await page.locator('#hb-status').selectOption('CLOSED');
    await page.locator('#hb-payment-status').selectOption('CLOSED');
    await form.getByRole('button', { name: 'Save claim update' }).click();
    await expect(form.locator('.form-success')).toContainText('Housing Benefit claim saved.');

    const closed = await prisma.housingBenefitClaim.findUniqueOrThrow({ where: { id: claimA.id } });
    expect(closed.status).toBe('CLOSED');
    expect(closed.paymentStatus).toBe('CLOSED');
    expect(await prisma.housingBenefitClaim.count({ where: { clientId: clientAId } })).toBe(1);

    // The claim record is mutable by design, so the history lives in the audit trail: every save
    // keeps the state it replaced. That is what makes an overwritten claim still defensible.
    await page.reload();
    await waitForHydratedForm(page, '#hb-client');
    const reloaded = page.locator('section.table-card').filter({ has: page.getByRole('heading', { name: 'Housing Benefit claims' }) });
    await expect(reloaded.locator('tbody tr', { hasText: clientA.reference })).toContainText('Closed');
    await expect(reloaded.locator('tbody tr', { hasText: clientA.reference })).toContainText('190.00');

    const audits = await prisma.auditLog.findMany({ where: { resourceType: 'HousingBenefitClaim', resourceId: claimA.id }, orderBy: { createdAt: 'asc' } });
    expect(audits, 'creating, amending and closing are each audited').toHaveLength(3);
    expect(audits.every((row) => row.actorId === adminUserId && row.organisationId === organisationId && row.action === 'HOUSING_BENEFIT_UPDATED' && row.success)).toBe(true);
    expect(audits[0]?.beforeJson, 'the first save has no previous state to record').toBeNull();
    expect(audits[0]?.afterJson ?? '').toContain('"weeklyRentMinor":18500');
    expect(audits[1]?.beforeJson ?? '', 'the amendment did not keep the state it replaced').toContain('"weeklyRentMinor":18500');
    expect(audits[1]?.afterJson ?? '').toContain('"weeklyRentMinor":19000');
    expect(audits[2]?.beforeJson ?? '').toContain('"status":"IN_PAYMENT"');
    expect(audits[2]?.afterJson ?? '').toContain('"status":"CLOSED"');
    expect(audits.every((row) => (row.afterJson ?? '').includes(clientA.reference)), 'the audit entry names the service user').toBe(true);

    // A claim is amended or closed, never deleted: the page offers no destructive control.
    await expect(reloaded.locator('tbody tr', { hasText: clientA.reference }).getByRole('button', { name: /delete|remove|archive|void/i })).toHaveCount(0);
  });

  test('placement: created through the register, corrected, ended and kept in the history', async () => {
    // Removal, the entered-in-error protection, the register's 404s and another organisation's
    // placement are all covered by tests/e2e/placements.spec.ts, which builds its records with
    // Prisma. This is the part that file does not drive: create, open, correct and end through the
    // same screens a housing officer uses.
    expect(clientAId, 'the service user fixture was not created').toBeTruthy();
    await ensurePropertyFixture();
    await page.goto('/crm/placements');
    await waitForHydratedForm(page, '#placement-client');
    const form = page.locator('form:has(#placement-client)');

    // Every field the browser can check is marked required, so an empty move-in cannot be submitted.
    await expect(page.locator('#placement-client')).toHaveAttribute('required', '');
    await expect(page.locator('#placement-property')).toHaveAttribute('required', '');
    await expect(page.locator('#placement-room')).toHaveAttribute('required', '');
    await expect(page.locator('#placement-start')).toHaveAttribute('required', '');
    await form.getByRole('button', { name: 'Create placement' }).click();
    await expect(form.locator('.form-success')).toHaveCount(0);
    expect(await prisma.placement.count({ where: { clientId: clientAId } }), 'a blocked submission still wrote a placement').toBe(0);

    await page.locator('#placement-client').selectOption(clientAId);
    await page.locator('#placement-property').selectOption(propertyId);
    await page.locator('#placement-room').selectOption(roomOneId);
    await page.locator('#placement-start').fill(dayOffset(-1));
    await page.locator('#placement-tenancy').fill(name('tenancy'));
    await form.getByRole('button', { name: 'Create placement' }).click();
    await expect(form.locator('.form-success')).toContainText('Placement created and room marked occupied.');

    const placement = await prisma.placement.findFirstOrThrow({ where: { clientId: clientAId } });
    created.placements.push(placement.id);
    expect(placement.propertyId).toBe(propertyId);
    expect(placement.roomId, 'the placement went to the wrong room').toBe(roomOneId);
    expect(placement.status).toBe('ACTIVE');
    expect(placement.startDate.toISOString().slice(0, 10)).toBe(dayOffset(-1));
    expect(placement.endDate).toBeNull();
    expect(placement.tenancyRef).toBe(name('tenancy'));

    // The room the person moved into is taken; the other room in the same property is still free.
    expect((await prisma.room.findUniqueOrThrow({ where: { id: roomOneId } })).status).toBe('OCCUPIED');
    expect((await prisma.room.findUniqueOrThrow({ where: { id: roomTwoId } })).status, 'an unrelated room was marked occupied').toBe('AVAILABLE');
    expect(await prisma.occupancyRecord.count({ where: { placementId: placement.id } })).toBe(1);

    const registerRow = page.locator('tbody tr', { hasText: name('service user A') });
    await expect(registerRow).toHaveCount(1);
    await expect(registerRow).toContainText('Fixture Room 1');
    await expect(registerRow.locator('.crm-badge')).toContainText('Current');
    await expect(registerRow).toContainText('Stored status active');

    // Opening the record loads that placement and no other: the correction form is prefilled from it.
    await page.goto(`/crm/placements/${placement.id}`);
    await waitForHydratedForm(page, '#placement-tenancy');
    await expect(page.locator('#placement-tenancy')).toHaveValue(name('tenancy'));
    await expect(page.locator('#placement-start')).toHaveValue(dayOffset(-1));
    await expect(page.locator('#placement-room')).toHaveValue(roomOneId);

    // An ordinary correction: the tenancy reference and the start date, without moving the person.
    await page.locator('#placement-tenancy').fill(name('tenancy corrected'));
    await page.locator('#placement-start').fill(dayOffset(-3));
    await page.getByRole('button', { name: 'Save placement details' }).click();
    await expect(page.locator('.placement-actions .form-success')).toContainText('Placement updated. The room occupancy and the register were kept in step.');

    const corrected = await prisma.placement.findUniqueOrThrow({ where: { id: placement.id } });
    expect(corrected.tenancyRef).toBe(name('tenancy corrected'));
    expect(corrected.startDate.toISOString().slice(0, 10)).toBe(dayOffset(-3));
    expect(corrected.status, 'a correction quietly ended the placement').toBe('ACTIVE');
    expect(corrected.roomId, 'a correction moved the person to another room').toBe(roomOneId);
    expect(corrected.propertyId).toBe(propertyId);
    expect(corrected.endDate).toBeNull();
    expect(await prisma.occupancyRecord.count({ where: { placementId: placement.id } }), 'a correction duplicated the occupancy record').toBe(1);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: roomOneId } })).status).toBe('OCCUPIED');

    // Ending is the honest action when somebody really lived there: the record is kept, the room goes.
    // The disclosure is opened first, and the button is scoped to the form because the summary above
    // it carries the same words.
    await page.locator('#end > summary').click();
    await page.locator('#placement-outcome').selectOption('MOVED_OUT');
    await page.locator('#placement-end').fill(dayOffset(0));
    await page.locator('#placement-end-reason').fill(name('moved on to independent living'));
    await page.locator('details#end form').getByRole('button', { name: 'End placement' }).click();
    await expect(page.locator('.placement-actions .form-success')).toContainText('Placement ended. It stays in the placement history and the room is released.');

    const ended = await prisma.placement.findUniqueOrThrow({ where: { id: placement.id } });
    expect(ended.status).toBe('MOVED_OUT');
    expect(ended.endDate?.toISOString().slice(0, 10)).toBe(dayOffset(0));
    expect(ended.endedReason).toBe(name('moved on to independent living'));
    expect(ended.tenancyRef, 'ending rewrote the corrected details').toBe(name('tenancy corrected'));
    expect((await prisma.room.findUniqueOrThrow({ where: { id: roomOneId } })).status, 'ending the placement did not free the room').toBe('AVAILABLE');
    expect((await prisma.room.findUniqueOrThrow({ where: { id: roomTwoId } })).status).toBe('AVAILABLE');

    // The record is still in the register, in the history stage rather than the current one.
    await page.goto('/crm/placements');
    const endedRow = page.locator('tbody tr', { hasText: name('service user A') });
    await expect(endedRow, 'an ended placement disappeared from the register').toHaveCount(1);
    await expect(endedRow.locator('.crm-badge')).toContainText('Ended');
    await expect(endedRow).toContainText('Stored status moved out');

    // And the service user's profile says so in both places: nothing current, and a history entry.
    await page.goto(`/crm/clients/${clientAId}`);
    const currentPanel = page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Current placement' }) });
    await expect(currentPanel).toContainText('No current placement.');
    const history = page.locator('section.crm-panel').filter({ has: page.getByRole('heading', { name: 'Placement history' }) });
    await expect(history).toContainText('Ended');
    await expect(history).toContainText('Fixture Room 1');

    const audits = await prisma.auditLog.findMany({ where: { resourceType: 'Placement', resourceId: placement.id } });
    expect(audits.length, 'creating, correcting and ending are each audited').toBe(3);
    expect(audits.every((row) => row.actorId === adminUserId && row.organisationId === organisationId && row.success)).toBe(true);
    expect(audits.filter((row) => row.action === 'PLACEMENT_CREATED')).toHaveLength(1);
    // Ending is recorded as its own act rather than as an ordinary correction: the distinction is what
    // tells a housing officer that somebody moved out instead of that a typo was fixed.
    expect(audits.filter((row) => row.action === 'PLACEMENT_UPDATED')).toHaveLength(1);
    expect(audits.filter((row) => row.action === 'PLACEMENT_ENDED')).toHaveLength(1);
    expect(audits.find((row) => row.action === 'PLACEMENT_ENDED')?.afterJson ?? '', 'the closure does not record the status it moved to').toContain('MOVED_OUT');
  });

  test("organisation isolation: another organisation's operational records are invisible and cannot be written to", async () => {
    const foreign = await createForeignFixtures();

    // Nothing belonging to another organisation appears on any of the operational registers.
    await page.goto('/crm/concerns');
    await expect(page.locator('tbody tr', { hasText: foreign.concernTitle })).toHaveCount(0);
    await page.goto('/crm/complaints');
    await expect(page.locator('tbody tr', { hasText: foreign.complaintTitle })).toHaveCount(0);
    await page.goto('/crm/maintenance');
    await expect(page.locator('tbody tr', { hasText: foreign.ticketTitle })).toHaveCount(0);
    await expect(page.locator('tbody tr', { hasText: foreign.ticketReference })).toHaveCount(0);
    await page.goto('/crm/appointments');
    await expect(page.locator('tbody tr', { hasText: foreign.appointmentTitle })).toHaveCount(0);
    // The foreign appointment is dated inside this week, so it would be on the diary if it leaked.
    await page.goto('/crm/calendar');
    await expect(page.locator('tbody tr', { hasText: foreign.appointmentTitle })).toHaveCount(0);
    await expect(page.locator('.calendar-entry', { hasText: foreign.appointmentTitle })).toHaveCount(0);
    await page.goto('/crm/billing');
    await expect(page.locator('tbody tr', { hasText: foreign.invoiceReference })).toHaveCount(0);
    await expect(page.getByText(foreign.clientName)).toHaveCount(0);

    // These modules have no detail page of their own, but the service user behind them does.
    const leaked = await page.goto(`/crm/clients/${foreign.clientId}`);
    expect(leaked?.status(), "another organisation's service user record answered instead of 404").toBe(404);
    await expect(page.getByText(foreign.clientName)).toHaveCount(0);

    // Every write endpoint answers 404 for a record it does not own, using this browser's own signed-in
    // session: a reference from another organisation has to look like a missing record, not like a
    // permission that can be probed, and never like a change that was accepted.
    await page.goto('/crm/dashboard');
    const attempts = await Promise.all([
      page.request.patch(`/api/crm/concerns/${foreign.concernId}`, { data: { status: 'CLOSED', action: 'E2E cross-organisation attempt' } }),
      page.request.patch(`/api/crm/complaints/${foreign.complaintId}`, { data: { status: 'CLOSED', stage: 'STAGE_1', severity: 'HIGH', learning: 'E2E cross-organisation attempt' } }),
      page.request.patch(`/api/crm/maintenance/${foreign.ticketId}`, { data: { status: 'COMPLETED', note: 'E2E cross-organisation attempt' } }),
      page.request.patch(`/api/crm/appointments/${foreign.appointmentId}`, { data: { status: 'CANCELLED' } }),
      page.request.patch(`/api/crm/invoices/${foreign.invoiceId}`, { data: { status: 'VOID' } }),
      page.request.post(`/api/crm/invoices/${foreign.invoiceId}/payments`, { data: { amountMinor: 100, paidAt: dayOffset(0), method: 'CASH' } }),
      page.request.patch(`/api/crm/clients/${foreign.clientId}/housing-benefit`, { data: { status: 'CLOSED', paymentStatus: 'CLOSED', weeklyRentMinor: 1, serviceChargeMinor: 0 } })
    ]);
    for (const attempt of attempts) expect(attempt.status(), 'a cross-organisation write was not refused as a missing record').toBe(404);

    // A 404 that still wrote something would be worse than a leak, so the records are checked too.
    expect((await prisma.concern.findUniqueOrThrow({ where: { id: foreign.concernId } })).status).toBe('OPEN');
    expect(await prisma.concernAction.count({ where: { concernId: foreign.concernId } })).toBe(0);
    expect((await prisma.complaint.findUniqueOrThrow({ where: { id: foreign.complaintId } })).status).toBe('LOGGED');
    expect((await prisma.maintenanceTicket.findUniqueOrThrow({ where: { id: foreign.ticketId } })).status).toBe('REPORTED');
    expect(await prisma.maintenanceUpdate.count({ where: { ticketId: foreign.ticketId } })).toBe(0);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: foreign.appointmentId } })).status).toBe('SCHEDULED');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: foreign.invoiceId } })).status).toBe('DRAFT');
    expect(await prisma.payment.count({ where: { invoiceId: foreign.invoiceId } })).toBe(0);
    expect((await prisma.housingBenefitClaim.findFirstOrThrow({ where: { clientId: foreign.clientId } })).status).toBe('IN_PAYMENT');
  });
});


