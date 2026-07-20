import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { canViewRestricted, requirePermission } from '@/lib/auth';
import { incidentActionSchema } from '@/lib/crm-validation';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('incidents.write');
    const parsed = incidentActionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Enter a follow-up action.' }, { status: 400 });
    const incident = await db.incident.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!incident) return NextResponse.json({ error: 'Incident not found.' }, { status: 404 });
    if (incident.restricted && !canViewRestricted(user)) return NextResponse.json({ error: 'You are not authorised to access this incident.' }, { status: 403 });
    const dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined;
    if (dueDate && Number.isNaN(dueDate.getTime())) return NextResponse.json({ error: 'Enter a valid due date.' }, { status: 400 });
    const action = await db.incidentAction.create({ data: { incidentId: incident.id, action: parsed.data.action, owner: parsed.data.owner, dueDate } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'INCIDENT_ACTION_CREATED', resourceType: 'IncidentAction', resourceId: action.id, after: { incidentId: incident.id, dueDate } });
    return NextResponse.json({ id: action.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save the incident action.' : message }, { status });
  }
}
