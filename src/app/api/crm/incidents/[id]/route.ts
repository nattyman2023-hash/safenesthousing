import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { hasPermission, requirePermission } from '@/lib/auth';
import { incidentReviewSchema } from '@/lib/crm-validation';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('incidents.write');
    const parsed = incidentReviewSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the incident review.' }, { status: 400 });
    if (parsed.data.status === 'CLOSED' && !(await hasPermission(user, 'incidents.close'))) return NextResponse.json({ error: 'Only an authorised safeguarding role may close this incident.' }, { status: 403 });
    const incident = await db.incident.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!incident) return NextResponse.json({ error: 'Incident not found.' }, { status: 404 });
    const updated = await db.incident.update({ where: { id: incident.id }, data: { severity: parsed.data.severity, status: parsed.data.status, closureDecision: parsed.data.closureDecision, reviewDate: parsed.data.reviewDate ? new Date(parsed.data.reviewDate) : undefined } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: parsed.data.status === 'CLOSED' ? 'INCIDENT_CLOSED' : 'INCIDENT_REVIEW_UPDATED', resourceType: 'Incident', resourceId: incident.id, before: { status: incident.status, severity: incident.severity }, after: { status: updated.status, severity: updated.severity } });
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save the incident review.' : message }, { status });
  }
}
