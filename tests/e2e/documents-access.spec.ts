import { test, expect, type Locator, type Page } from '@playwright/test';
import { prisma, resetStaffSession } from './db-reset';
import { ADMIN_EMAIL, ADMIN_PASSWORD, enterCredentials, assertSignedIn } from './staff-auth';
import { waitForHydratedForm } from './hydration';

/**
 * The access rule for documents is one application boundary: a valid, authenticated staff
 * session. There is no per-document permission anywhere in the app, so two different staff
 * accounts must see exactly the same register, the same service-user file list, and be able to
 * download every file - including files flagged restricted and files uploaded by someone else.
 * Organisation scoping, private storage, and the download endpoint's validation stay in place.
 */
const SUPPORT_LEAD_EMAIL = 'j.whitfield@safenest.test';
const FOREIGN_ORGANISATION_ID = 'e2e-document-access-org';
const FOREIGN_DOCUMENT_ID = 'e2e-document-access-foreign';
// The service-user profile lists the most recent files, which is a display bound and identical
// for every user; the register itself is not limited.
const PROFILE_DOCUMENT_ROWS = 25;

async function signInOnce(page: Page, email: string): Promise<void> {
  // One real sign-in per account for the whole file: the sign-in endpoint rate-limits attempts
  // per IP and email, and the point of these tests is document access, not repeated logins.
  await resetStaffSession(email);
  await enterCredentials(page, email, ADMIN_PASSWORD);
  await assertSignedIn(page);
}

function registerCard(page: Page): Locator {
  return page.locator('section.table-card').filter({ has: page.getByRole('heading', { name: 'Document register' }) });
}

function serviceUserDocumentCard(page: Page): Locator {
  return page.locator('section.table-card').filter({ has: page.getByRole('heading', { name: 'Documents' }) });
}

async function listedNames(card: Locator): Promise<string[]> {
  const names = await card.locator('tbody tr td:first-child strong').allTextContents();
  return names.map((name) => name.trim()).sort();
}

async function downloadHref(card: Locator, fileName: string): Promise<string> {
  const href = await card.locator('tbody tr', { hasText: fileName }).getByRole('link', { name: 'Download' }).getAttribute('href');
  if (!href) throw new Error(`No download link for ${fileName}.`);
  return href;
}

test.describe.serial('Document access for every authenticated user', () => {
  let clientAId = '';
  let clientDId = '';
  let restrictedDocumentId = '';
  let restrictedDocumentName = '';
  let adminPage: Page;
  let supportLeadPage: Page;
  let closeSessions: () => Promise<void>;

  test.beforeAll(async ({ browser }) => {
    const clientA = await prisma.client.findFirstOrThrow({ where: { reference: 'SN-C-004' } });
    const clientD = await prisma.client.findFirstOrThrow({ where: { reference: 'SN-C-007' } });
    clientAId = clientA.id;
    clientDId = clientD.id;

    // A file that is still flagged restricted in the schema. The metadata is kept for future
    // security work, but today it must not hold any authenticated user back.
    const restricted = await prisma.document.findFirstOrThrow({ where: { restricted: true, clientId: clientD.id } });
    restrictedDocumentId = restricted.id;
    restrictedDocumentName = restricted.displayName;

    // A record owned by a different organisation, to prove tenant scoping is still enforced.
    await prisma.organisation.upsert({
      where: { id: FOREIGN_ORGANISATION_ID },
      update: {},
      create: { id: FOREIGN_ORGANISATION_ID, name: 'E2E foreign organisation', slug: FOREIGN_ORGANISATION_ID }
    });
    await prisma.document.upsert({
      where: { id: FOREIGN_DOCUMENT_ID },
      update: {},
      create: {
        id: FOREIGN_DOCUMENT_ID,
        organisationId: FOREIGN_ORGANISATION_ID,
        displayName: 'Foreign organisation document',
        storageKey: 'e2e/foreign/not-on-disk.txt',
        mimeType: 'text/plain',
        sizeBytes: 1,
        category: 'Compliance',
        uploadedBy: 'e2e-foreign-uploader'
      }
    });

    // Two different authenticated staff accounts, signed in once for the whole file.
    const adminContext = await browser.newContext();
    const leadContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    supportLeadPage = await leadContext.newPage();
    closeSessions = async () => {
      await adminContext.close();
      await leadContext.close();
    };
    await signInOnce(adminPage, ADMIN_EMAIL);
    await signInOnce(supportLeadPage, SUPPORT_LEAD_EMAIL);
  });

  test.afterAll(async () => {
    await prisma.document.deleteMany({ where: { id: FOREIGN_DOCUMENT_ID } });
    await prisma.organisation.deleteMany({ where: { id: FOREIGN_ORGANISATION_ID } });
    await closeSessions();
    await prisma.$disconnect();
  });

  test('every authenticated user sees the same document register', async () => {
    await adminPage.goto('/crm/documents');
    const adminNames = await listedNames(registerCard(adminPage));
    expect(adminNames).toContain(restrictedDocumentName);
    expect(adminNames.length).toBeGreaterThan(0);

    await supportLeadPage.goto('/crm/documents');
    const leadNames = await listedNames(registerCard(supportLeadPage));

    expect(leadNames).toEqual(adminNames);
  });

  test('a service-user profile lists every filed document for both users, restricted records included', async () => {
    for (const clientId of [clientAId, clientDId]) {
      const filed = await prisma.document.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
      const expectedNames = filed.slice(0, PROFILE_DOCUMENT_ROWS).map((document) => document.displayName).sort();

      for (const page of [adminPage, supportLeadPage]) {
        const response = await page.goto(`/crm/clients/${clientId}`);
        expect(response?.status()).toBe(200);
        const card = serviceUserDocumentCard(page);
        await expect(card).toBeVisible();
        expect(await listedNames(card)).toEqual(expectedNames);
        expect(await card.locator('tbody tr').count()).toBe(expectedNames.length);
        // No file is ever presented as needing extra permission.
        await expect(card).not.toContainText('Access required');
        await expect(card).not.toContainText('Withheld');
        for (const name of expectedNames) {
          expect(await downloadHref(card, name)).toMatch(/^\/api\/crm\/documents\/[^/]+\/download$/);
        }
      }
    }
  });

  test('a file flagged restricted by one user is found and downloaded by another user', async () => {
    const fileName = `playwright-restricted-${Date.now()}.txt`;
    const content = 'Playwright coverage: fictional restricted document. No real record is held here.';

    // User A (support lead) files the document against the service user and ticks restricted.
    await supportLeadPage.goto(`/crm/clients/${clientAId}`);
    await waitForHydratedForm(supportLeadPage, '#client-document-file');
    const uploadForm = supportLeadPage.locator('#document-upload');
    await uploadForm.locator('#client-document-file').setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: Buffer.from(content, 'utf-8') });
    await uploadForm.getByLabel('Category', { exact: true }).fill('Compliance');
    await uploadForm.locator('input[name="restricted"]').check();
    await uploadForm.getByRole('button', { name: 'File document' }).click();
    await expect(supportLeadPage.getByText(`${fileName} filed.`)).toBeVisible();

    const stored = await prisma.document.findFirstOrThrow({ where: { displayName: fileName } });
    expect(stored.restricted).toBe(true);
    expect(stored.uploadedBy).toBe((await prisma.user.findUniqueOrThrow({ where: { email: SUPPORT_LEAD_EMAIL } })).id);

    // The uploader downloads their own file...
    const leadHref = await downloadHref(serviceUserDocumentCard(supportLeadPage), fileName);
    const leadDownload = await supportLeadPage.request.get(leadHref);
    expect(leadDownload.status()).toBe(200);
    expect(await leadDownload.text()).toBe(content);

    // ...and so does a different authenticated user, with no uploader, assignment, department,
    // role, permission, or restricted-flag check standing in the way.
    await adminPage.goto(`/crm/clients/${clientAId}`);
    const adminCard = serviceUserDocumentCard(adminPage);
    await expect(adminCard.locator('tbody tr', { hasText: fileName })).toBeVisible();
    const adminDownload = await adminPage.request.get(await downloadHref(adminCard, fileName));
    expect(adminDownload.status()).toBe(200);
    expect(await adminDownload.text()).toBe(content);

    // The same file is visible in the organisation-wide register that user (B) browses.
    await adminPage.goto('/crm/documents');
    await expect(registerCard(adminPage).locator('tbody tr', { hasText: fileName })).toBeVisible();
  });

  test('the download endpoint needs a valid session, a real file, and the right organisation', async ({ request }) => {
    // No session at all: refused outright, never served.
    expect((await request.get(`/api/crm/documents/${restrictedDocumentId}/download`)).status()).toBe(401);

    // A valid authenticated session for a user who did not upload the file: the file is returned.
    const authenticated = await adminPage.request.get(`/api/crm/documents/${restrictedDocumentId}/download`);
    expect(authenticated.status()).toBe(200);
    expect(authenticated.headers()['content-disposition']).toContain('attachment');
    expect((await authenticated.body()).byteLength).toBeGreaterThan(0);

    // Unknown identifier and a document owned by another organisation: 404, never a file.
    expect((await adminPage.request.get('/api/crm/documents/not-a-real-document/download')).status()).toBe(404);
    expect((await adminPage.request.get(`/api/crm/documents/${FOREIGN_DOCUMENT_ID}/download`)).status()).toBe(404);

    // The private store is never reachable through the web server.
    const stored = await prisma.document.findFirstOrThrow({ where: { id: restrictedDocumentId } });
    expect((await request.get(`/storage/private/${stored.storageKey}`)).status()).not.toBe(200);
    expect((await request.get(`/${stored.storageKey}`)).status()).not.toBe(200);
  });

  test('every file still flagged restricted downloads for every authenticated user', async () => {
    const restrictedFiles = await prisma.document.findMany({ where: { restricted: true, organisationId: { not: FOREIGN_ORGANISATION_ID } } });
    expect(restrictedFiles.length).toBeGreaterThan(0);

    for (const page of [adminPage, supportLeadPage]) {
      await page.goto('/crm/documents');
      const card = registerCard(page);
      for (const file of restrictedFiles) {
        await expect(card.locator('tbody tr', { hasText: file.displayName })).toBeVisible();
        const download = await page.request.get(await downloadHref(card, file.displayName));
        expect(download.status()).toBe(200);
        expect((await download.body()).byteLength).toBeGreaterThan(0);
      }
    }
  });
});
