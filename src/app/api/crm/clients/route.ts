import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { clientCreateSchema } from '@/lib/crm-validation';

function makeReference() {
  const suffix = Math.floor(100 + Math.random() * 900);
  return `SN-C-${suffix}`;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = clientCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the client details.' }, { status: 400 });
    if (parsed.data.serviceId) {
      const service = await db.service.findFirst({ where: { id: parsed.data.serviceId, organisationId: user.organisationId } });
      if (!service) return NextResponse.json({ error: 'Choose a service from your organisation.' }, { status: 400 });
    }
    if (parsed.data.referralId) {
      const referral = await db.referral.findFirst({ where: { id: parsed.data.referralId, organisationId: user.organisationId } });
      if (!referral) return NextResponse.json({ error: 'Choose a referral from your organisation.' }, { status: 400 });
    }
    const dateOfBirth = parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : undefined;
    if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) return NextResponse.json({ error: 'Enter a valid date of birth.' }, { status: 400 });
    let reference = makeReference();
    while (await db.client.findUnique({ where: { reference } })) reference = makeReference();
    const client = await db.client.create({
      data: {
        organisationId: user.organisationId,
        reference,
        displayName: parsed.data.displayName,
        serviceId: parsed.data.serviceId || undefined,
        referralId: parsed.data.referralId || undefined,
        dateOfBirth,
        riskLevel: parsed.data.riskLevel,
        communicationNeeds: parsed.data.communicationNeeds,
        restricted: parsed.data.restricted,
        status: parsed.data.status
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'CLIENT_CREATED', resourceType: 'Client', resourceId: client.id, after: { reference: client.reference, riskLevel: client.riskLevel, restricted: client.restricted } });
    return NextResponse.json({ id: client.id, reference: client.reference });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to create the client.' : message }, { status });
  }
}
