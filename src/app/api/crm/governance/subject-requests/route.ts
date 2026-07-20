import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { dataSubjectRequestCreateSchema } from '@/lib/crm-validation';
import { db } from '@/lib/db';

function parseDueAt(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET() {
  try {
    const user = await requirePermission('governance.manage');
    const requests = await db.dataSubjectRequest.findMany({ where: { organisationId: user.organisationId }, orderBy: [{ legalHold: 'desc' }, { createdAt: 'desc' }] });
    return NextResponse.json({ requests });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to load data-subject requests.' : message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('governance.manage');
    const parsed = dataSubjectRequestCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the request details.' }, { status: 400 });
    const dueAt = parseDueAt(parsed.data.dueAt);
    if (parsed.data.dueAt && !dueAt) return NextResponse.json({ error: 'Use a valid due date.' }, { status: 400 });
    const requestRecord = await db.dataSubjectRequest.create({ data: { organisationId: user.organisationId, requestType: parsed.data.requestType, subjectRef: parsed.data.subjectRef, status: parsed.data.legalHold ? 'ON_HOLD' : 'OPEN', dueAt, notes: parsed.data.notes || undefined, legalHold: parsed.data.legalHold } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'DATA_SUBJECT_REQUEST_CREATED', resourceType: 'DataSubjectRequest', resourceId: requestRecord.id, after: { requestType: requestRecord.requestType, status: requestRecord.status, legalHold: requestRecord.legalHold, dueAt: requestRecord.dueAt?.toISOString() ?? null } });
    return NextResponse.json({ ok: true, request: requestRecord }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to create the data-subject request.' : message }, { status });
  }
}
