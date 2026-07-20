import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { getScopedIds, hasScopedAccess, requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { referralAssignmentSchema } from '@/lib/crm-validation';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await requirePermission('referrals.write');
    const parsed = referralAssignmentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Choose a staff member to assign this referral to.' }, { status: 400 });
    const serviceIds = getScopedIds(actor, 'serviceIds');
    const referral = await db.referral.findFirst({ where: { id: params.id, organisationId: actor.organisationId, ...(serviceIds.length ? { serviceId: { in: serviceIds } } : {}) }, include: { assignments: { orderBy: { assignedAt: 'desc' }, take: 1 } } });
    if (!referral) return NextResponse.json({ error: 'Referral not found.' }, { status: 404 });
    const target = await db.user.findFirst({
      where: {
        id: parsed.data.assignedToId,
        organisationId: actor.organisationId,
        active: true,
        memberships: { some: { active: true, role: { permissions: { some: { permission: { key: 'referrals.read' } } } } } }
      },
      include: { memberships: { where: { active: true }, select: { serviceIds: true, propertyIds: true, active: true } } }
    });
    if (!target) return NextResponse.json({ error: 'Choose an active staff member who can access referrals.' }, { status: 400 });
    if (!hasScopedAccess(target.memberships, 'serviceIds', referral.serviceId)) return NextResponse.json({ error: 'That staff member is not scoped to this referral service.' }, { status: 400 });
    const assignment = await db.referralAssignment.create({ data: { referralId: referral.id, userId: target.id } });
    await audit({ organisationId: actor.organisationId, actorId: actor.id, action: 'REFERRAL_ASSIGNED', resourceType: 'Referral', resourceId: referral.id, before: { assignedToId: referral.assignments[0]?.userId ?? null }, after: { assignedToId: target.id, assignedToName: target.name } });
    return NextResponse.json({ ok: true, assignment: { id: assignment.id, assignedToId: target.id, assignedToName: target.name } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to assign the referral.' : message }, { status });
  }
}
