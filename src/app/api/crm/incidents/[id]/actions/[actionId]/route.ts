import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { canViewRestricted, requirePermission } from '@/lib/auth';
import { incidentActionUpdateSchema } from '@/lib/crm-validation';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string; actionId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requirePermission('incidents.write');
    const parsed = incidentActionUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Choose whether the action is complete.' }, { status: 400 });
    const incident = await db.incident.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!incident) return NextResponse.json({ error: 'Incident not found.' }, { status: 404 });
    if (incident.restricted && !canViewRestricted(user)) return NextResponse.json({ error: 'You are not authorised to access this incident.' }, { status: 403 });
    const action = await db.incidentAction.findFirst({ where: { id: params.actionId, incidentId: incident.id } });
    if (!action) return NextResponse.json({ error: 'Incident action not found.' }, { status: 404 });
    const updated = await db.incidentAction.update({ where: { id: action.id }, data: { completedAt: parsed.data.completed ? new Date() : null } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: parsed.data.completed ? 'INCIDENT_ACTION_COMPLETED' : 'INCIDENT_ACTION_REOPENED', resourceType: 'IncidentAction', resourceId: action.id, after: { incidentId: incident.id, completed: parsed.data.completed } });
    return NextResponse.json({ id: updated.id, completed: !!updated.completedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to update the incident action.' : message }, { status });
  }
}
