import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { readPrivateDocument, sha256Bytes } from '@/lib/storage';

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('documents.read');
    const document = await db.document.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    if (document.restricted && !user.memberships.some((membership) => ['super-administrator', 'organisation-administrator', 'safeguarding-lead', 'service-manager', 'support-lead'].includes(membership.role.slug))) {
      await audit({ organisationId: user.organisationId, actorId: user.id, action: 'DOCUMENT_ACCESS_DENIED', resourceType: 'Document', resourceId: document.id, success: false, after: { restricted: true } });
      return NextResponse.json({ error: 'You are not authorised to view this document.' }, { status: 403 });
    }
    const bytes = await readPrivateDocument(document.storageKey);
    if (document.sha256 && sha256Bytes(bytes) !== document.sha256) {
      await audit({ organisationId: user.organisationId, actorId: user.id, action: 'DOCUMENT_INTEGRITY_FAILURE', resourceType: 'Document', resourceId: document.id, success: false });
      return NextResponse.json({ error: 'Document unavailable.' }, { status: 503 });
    }
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'DOCUMENT_DOWNLOADED', resourceType: 'Document', resourceId: document.id, after: { restricted: document.restricted } });
    const safeName = document.displayName.replace(/[\r\n\\"]/g, '_').replace(/[^\x20-\x7E]/g, '_') || 'document';
    return new NextResponse(bytes, { headers: { 'Content-Type': document.mimeType, 'Content-Length': String(bytes.byteLength), 'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(document.displayName)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Download-Options': 'noopen', 'Content-Security-Policy': "default-src 'none'" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 404;
    return NextResponse.json({ error: status === 404 ? 'Document unavailable.' : message }, { status });
  }
}
