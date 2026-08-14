import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { incidentCreateSchema } from '@/lib/crm-validation';

function makeReference() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const suffix = Math.floor(100 + Math.random() * 900);
  return `INC-${yy}${mm}-${suffix}`;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = incidentCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the incident details.' }, { status: 400 });
    const incidentAt = new Date(parsed.data.incidentAt);
    if (Number.isNaN(incidentAt.getTime())) return NextResponse.json({ error: 'Enter a valid incident date and time.' }, { status: 400 });
    if (parsed.data.clientId) {
      const client = await db.client.findFirst({ where: { id: parsed.data.clientId, organisationId: user.organisationId } });
      if (!client) return NextResponse.json({ error: 'Choose a client from your organisation.' }, { status: 400 });
    }
    const incident = await db.incident.create({
      data: {
        organisationId: user.organisationId,
        reference: makeReference(),
        clientId: parsed.data.clientId || undefined,
        category: parsed.data.category,
        severity: parsed.data.severity,
        status: 'OPEN',
        incidentAt,
        location: parsed.data.location,
        description: parsed.data.description,
        immediateAction: parsed.data.immediateAction,
        restricted: parsed.data.restricted,
        assignedLeadId: user.id
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'INCIDENT_CREATED', resourceType: 'Incident', resourceId: incident.id, after: { reference: incident.reference, category: incident.category, severity: incident.severity, restricted: incident.restricted } });
    return NextResponse.json({ id: incident.id, reference: incident.reference });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to record the incident.' : message }, { status });
  }
}
