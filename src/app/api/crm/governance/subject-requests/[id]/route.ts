import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { dataSubjectRequestUpdateSchema } from '@/lib/crm-validation';
import { db } from '@/lib/db';
import { canCloseDataSubjectRequest } from '@/lib/domain';

function parseDueAt(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('governance.manage');
    const parsed = dataSubjectRequestUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the request review.' }, { status: 400 });
    const current = await db.dataSubjectRequest.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!current) return NextResponse.json({ error: 'Data-subject request not found.' }, { status: 404 });
    const dueAt = parseDueAt(parsed.data.dueAt);
    if (parsed.data.dueAt && !dueAt) return NextResponse.json({ error: 'Use a valid due date.' }, { status: 400 });
    const closing = ['COMPLETED', 'DECLINED'].includes(parsed.data.status);
    if (closing && !canCloseDataSubjectRequest(parsed.data.status, current.legalHold || parsed.data.legalHold)) return NextResponse.json({ error: 'Release the legal hold and save that change before closing this request.' }, { status: 409 });
    if (current.legalHold && !parsed.data.legalHold && parsed.data.status !== current.status) return NextResponse.json({ error: 'Save the legal-hold release as a separate review step before changing status.' }, { status: 409 });
    if (current.legalHold && parsed.data.status !== 'ON_HOLD' && parsed.data.legalHold !== false) return NextResponse.json({ error: 'Requests on legal hold must remain on hold.' }, { status: 409 });
    const requestRecord = await db.dataSubjectRequest.update({ where: { id: current.id }, data: { status: parsed.data.status, dueAt, notes: parsed.data.notes || undefined, legalHold: parsed.data.legalHold, reviewedBy: closing ? user.id : undefined, reviewedAt: closing ? new Date() : undefined } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'DATA_SUBJECT_REQUEST_UPDATED', resourceType: 'DataSubjectRequest', resourceId: requestRecord.id, before: { requestType: current.requestType, status: current.status, legalHold: current.legalHold, dueAt: current.dueAt?.toISOString() ?? null }, after: { requestType: requestRecord.requestType, status: requestRecord.status, legalHold: requestRecord.legalHold, dueAt: requestRecord.dueAt?.toISOString() ?? null, reviewed: Boolean(requestRecord.reviewedAt) } });
    return NextResponse.json({ ok: true, request: requestRecord });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to update the data-subject request.' : message }, { status });
  }
}
