import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { removePrivateDocument, storePrivateDocument } from '@/lib/storage';

export async function POST(request: Request) {
  try {
    const user = await requirePermission('documents.write');
    const limited = await rateLimit(`document-upload:${user.id}:${getClientIp(request)}`, 20, 15 * 60_000);
    if (!limited.allowed) return NextResponse.json({ error: 'Too many uploads. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a document to upload.' }, { status: 400 });
    const category = String(form.get('category') ?? '').trim();
    if (!category || category.length > 80) return NextResponse.json({ error: 'Choose a document category.' }, { status: 400 });
    const restricted = form.get('restricted') === 'on';
    const stored = await storePrivateDocument(file);
    let document;
    try {
      document = await db.document.create({ data: { organisationId: user.organisationId, displayName: stored.displayName, storageKey: stored.storageKey, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, malwareScanStatus: stored.malwareScanStatus, malwareScannedAt: stored.malwareScannedAt, category, restricted, uploadedBy: user.id } });
    } catch (error) {
      await removePrivateDocument(stored.storageKey).catch(() => undefined);
      throw error;
    }
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'DOCUMENT_UPLOADED', resourceType: 'Document', resourceId: document.id, after: { category, restricted, sizeBytes: stored.sizeBytes, mimeType: stored.mimeType, sha256: stored.sha256, malwareScanStatus: stored.malwareScanStatus } });
    return NextResponse.json({ id: document.id, displayName: document.displayName });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : message === 'MALWARE_SCAN_REQUIRED' || message === 'MALWARE_SCAN_UNAVAILABLE' ? 503 : message === 'MALWARE_DETECTED' ? 422 : 400;
    const responseMessage = status === 503 ? 'The upload service is temporarily unavailable because malware scanning is not ready.' : status === 422 ? 'This file failed malware scanning and was not stored.' : status >= 500 ? 'Unable to upload the document.' : message || 'Unable to upload the document.';
    return NextResponse.json({ error: responseMessage }, { status });
  }
}
