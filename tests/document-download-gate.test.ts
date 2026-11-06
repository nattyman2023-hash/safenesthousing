import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The download route is the last line of defence for quarantined documents. These tests pin the
 * fail-closed behaviour: while `REQUIRE_MALWARE_SCAN=true`, only an explicitly CLEAN document may be
 * served, and a refusal must be audited without reading the stored bytes.
 */

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  audit: vi.fn(),
  readPrivateDocument: vi.fn(),
  requireUser: vi.fn()
}));

vi.mock('@/lib/db', () => ({ db: { document: { findFirst: mocks.findFirst } } }));
vi.mock('@/lib/audit', () => ({ audit: mocks.audit }));
vi.mock('@/lib/auth', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/storage', () => ({ readPrivateDocument: mocks.readPrivateDocument, sha256Bytes: () => 'hash' }));

import { GET } from '@/app/api/crm/documents/[id]/download/route';

const previousRequired = process.env.REQUIRE_MALWARE_SCAN;

function documentWith(status: string | undefined) {
  return { id: 'doc-1', organisationId: 'org-1', storageKey: '2026-01-01/object.txt', displayName: 'note.txt', mimeType: 'text/plain', restricted: false, sha256: null, malwareScanStatus: status };
}

async function download() {
  return GET(new Request('https://safe-nest.example/api/crm/documents/doc-1/download'), { params: Promise.resolve({ id: 'doc-1' }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: 'user-1', organisationId: 'org-1' });
  mocks.readPrivateDocument.mockResolvedValue(Buffer.from('private contents'));
});

afterEach(() => {
  if (previousRequired === undefined) delete process.env.REQUIRE_MALWARE_SCAN;
  else process.env.REQUIRE_MALWARE_SCAN = previousRequired;
});

describe('download malware gate', () => {
  it.each(['SKIPPED', 'PENDING', 'FAILED', 'INFECTED', 'ERROR', 'UNKNOWN', undefined])('refuses a %s document without reading it', async (status) => {
    process.env.REQUIRE_MALWARE_SCAN = 'true';
    mocks.findFirst.mockResolvedValue(documentWith(status));
    const response = await download();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Document unavailable until malware scanning has cleared it.' });
    expect(mocks.readPrivateDocument).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOCUMENT_DOWNLOAD_BLOCKED', success: false, resourceId: 'doc-1', after: expect.objectContaining({ reason: 'MALWARE_SCAN_NOT_CLEAN', malwareScanStatus: status }) }));
  });

  it('serves an explicitly CLEAN document and audits the download', async () => {
    process.env.REQUIRE_MALWARE_SCAN = 'true';
    mocks.findFirst.mockResolvedValue(documentWith('CLEAN'));
    const response = await download();
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('private contents');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOCUMENT_DOWNLOADED' }));
  });

  it('keeps historical downloads available when scanning is not required', async () => {
    delete process.env.REQUIRE_MALWARE_SCAN;
    mocks.findFirst.mockResolvedValue(documentWith('SKIPPED'));
    const response = await download();
    expect(response.status).toBe(200);
    expect(mocks.readPrivateDocument).toHaveBeenCalledOnce();
  });
});
