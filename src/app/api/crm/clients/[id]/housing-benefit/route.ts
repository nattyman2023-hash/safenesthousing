import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { housingBenefitUpdateSchema } from '@/lib/crm-validation';

function parseDate(value: string | undefined, label: string): Date | null | undefined {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Enter a valid ${label}.`);
  return date;
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('finance.write');
    const parsed = housingBenefitUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the Housing Benefit details.' }, { status: 400 });

    const client = await db.client.findFirst({ where: { id: params.id, organisationId: user.organisationId }, select: { id: true, reference: true } });
    if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    const submittedAt = parseDate(parsed.data.submittedAt, 'submission date');
    const current = await db.housingBenefitClaim.findFirst({ where: { clientId: client.id }, orderBy: { id: 'desc' } });
    const updated = current
      ? await db.housingBenefitClaim.update({ where: { id: current.id }, data: { status: parsed.data.status, paymentStatus: parsed.data.paymentStatus, submittedAt, evidenceRequired: parsed.data.evidenceRequired ?? null, weeklyRentMinor: parsed.data.weeklyRentMinor, serviceChargeMinor: parsed.data.serviceChargeMinor } })
      : await db.housingBenefitClaim.create({ data: { clientId: client.id, status: parsed.data.status, paymentStatus: parsed.data.paymentStatus, submittedAt, evidenceRequired: parsed.data.evidenceRequired, weeklyRentMinor: parsed.data.weeklyRentMinor, serviceChargeMinor: parsed.data.serviceChargeMinor } });

    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'HOUSING_BENEFIT_UPDATED', resourceType: 'HousingBenefitClaim', resourceId: updated.id, before: current ? { status: current.status, paymentStatus: current.paymentStatus, weeklyRentMinor: current.weeklyRentMinor, serviceChargeMinor: current.serviceChargeMinor } : undefined, after: { clientReference: client.reference, status: updated.status, paymentStatus: updated.paymentStatus, weeklyRentMinor: updated.weeklyRentMinor, serviceChargeMinor: updated.serviceChargeMinor } });
    return NextResponse.json({ id: updated.id, status: updated.status, paymentStatus: updated.paymentStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : message.startsWith('Enter a valid') ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save the Housing Benefit claim.' : message }, { status });
  }
}
