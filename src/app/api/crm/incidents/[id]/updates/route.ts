import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { canViewRestricted, requirePermission } from '@/lib/auth';
import { incidentUpdateSchema } from '@/lib/crm-validation';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('incidents.write');
    const parsed = incidentUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Enter an incident update.' }, { status: 400 });
    const incident = await db.incident.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!incident) return NextResponse.json({ error: 'Incident not found.' }, { status: 404 });
    if (incident.restricted && !canViewRestricted(user)) return NextResponse.json({ error: 'You are not authorised to access this incident.' }, { status: 403 });
    const update = await db.incidentUpdate.create({ data: { incidentId: incident.id, authorId: user.id, update: parsed.data.update } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'INCIDENT_UPDATE_CREATED', resourceType: 'IncidentUpdate', resourceId: update.id, after: { incidentId: incident.id } });
    return NextResponse.json({ id: update.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save the incident update.' : message }, { status });
  }
}
