import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { referralAssignmentSchema } from '@/lib/crm-validation';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await requireUser();
    const parsed = referralAssignmentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Choose a staff member to assign this referral to.' }, { status: 400 });
    const referral = await db.referral.findFirst({ where: { id: params.id, organisationId: actor.organisationId }, include: { assignments: { orderBy: { assignedAt: 'desc' }, take: 1 } } });
    if (!referral) return NextResponse.json({ error: 'Referral not found.' }, { status: 404 });
    const target = await db.user.findFirst({
      where: {
        id: parsed.data.assignedToId,
        organisationId: actor.organisationId,
        active: true
      },
    });
    if (!target) return NextResponse.json({ error: 'Choose an active staff member from this organisation.' }, { status: 400 });
    const assignment = await db.referralAssignment.create({ data: { referralId: referral.id, userId: target.id } });
    await audit({ organisationId: actor.organisationId, actorId: actor.id, action: 'REFERRAL_ASSIGNED', resourceType: 'Referral', resourceId: referral.id, before: { assignedToId: referral.assignments[0]?.userId ?? null }, after: { assignedToId: target.id, assignedToName: target.name } });
    return NextResponse.json({ ok: true, assignment: { id: assignment.id, assignedToId: target.id, assignedToName: target.name } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to assign the referral.' : message }, { status });
  }
}
