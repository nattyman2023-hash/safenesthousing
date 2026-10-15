import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { clientUpdateSchema } from '@/lib/crm-validation';

function parseDate(value: string | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser();
    const parsed = clientUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the client details.' }, { status: 400 });
    const client = await db.client.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });

    if (parsed.data.serviceId) {
      const service = await db.service.findFirst({ where: { id: parsed.data.serviceId, organisationId: user.organisationId } });
      if (!service) return NextResponse.json({ error: 'Choose a service from your organisation.' }, { status: 400 });
    }
    if (parsed.data.referralId) {
      const referral = await db.referral.findFirst({ where: { id: parsed.data.referralId, organisationId: user.organisationId } });
      if (!referral) return NextResponse.json({ error: 'Choose a referral from your organisation.' }, { status: 400 });
    }
    if (parsed.data.keyWorkerId) {
      const keyWorker = await db.user.findFirst({ where: { id: parsed.data.keyWorkerId, organisationId: user.organisationId, active: true } });
      if (!keyWorker) return NextResponse.json({ error: 'Choose an active key worker.' }, { status: 400 });
    }
    const dateOfBirth = parseDate(parsed.data.dateOfBirth);
    if (parsed.data.dateOfBirth !== undefined && dateOfBirth === null) return NextResponse.json({ error: 'Enter a valid date of birth.' }, { status: 400 });
    const admissionDate = parseDate(parsed.data.admissionDate);
    if (parsed.data.admissionDate !== undefined && admissionDate === null) return NextResponse.json({ error: 'Enter a valid admission date.' }, { status: 400 });

    const data = {
      ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
      ...(parsed.data.serviceId !== undefined ? { serviceId: parsed.data.serviceId || null } : {}),
      ...(parsed.data.referralId !== undefined ? { referralId: parsed.data.referralId || null } : {}),
      ...(parsed.data.keyWorkerId !== undefined ? { keyWorkerId: parsed.data.keyWorkerId || null } : {}),
      ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
      ...(parsed.data.email !== undefined ? { email: parsed.data.email || null } : {}),
      ...(parsed.data.address !== undefined ? { address: parsed.data.address || null } : {}),
      ...(parsed.data.gender !== undefined ? { gender: parsed.data.gender || null } : {}),
      ...(parsed.data.pronouns !== undefined ? { pronouns: parsed.data.pronouns || null } : {}),
      ...(admissionDate !== undefined ? { admissionDate } : {}),
      ...(parsed.data.riskLevel !== undefined ? { riskLevel: parsed.data.riskLevel } : {}),
      ...(parsed.data.communicationNeeds !== undefined ? { communicationNeeds: parsed.data.communicationNeeds || null } : {}),
      ...(parsed.data.importantAlerts !== undefined ? { importantAlerts: parsed.data.importantAlerts || null } : {}),
      ...(parsed.data.safeguardingFlag !== undefined ? { safeguardingFlag: parsed.data.safeguardingFlag } : {}),
      ...(parsed.data.restricted !== undefined ? { restricted: parsed.data.restricted } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {})
    };
    const updated = await db.client.update({ where: { id: client.id }, data });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'CLIENT_UPDATED', resourceType: 'Client', resourceId: client.id, before: { riskLevel: client.riskLevel, status: client.status, restricted: client.restricted }, after: { fields: Object.keys(data), riskLevel: updated.riskLevel, status: updated.status, restricted: updated.restricted } });
    return NextResponse.json({ id: updated.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to update the client.' : message }, { status });
  }
}
