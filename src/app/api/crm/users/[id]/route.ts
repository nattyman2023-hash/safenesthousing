import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { userAccessUpdateSchema } from '@/lib/crm-validation';
import { db } from '@/lib/db';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await requireUser();
    const parsed = userAccessUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Choose a valid active state and role.' }, { status: 400 });
    if (params.id === actor.id && !parsed.data.active) return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 400 });
    let role = await db.role.findFirst({ where: { organisationId: actor.organisationId, slug: parsed.data.roleSlug } });
    if (!role && parsed.data.roleSlug === 'organisation-user') role = await db.role.create({ data: { organisationId: actor.organisationId, slug: 'organisation-user', name: 'Organisation user' } });
    if (!role) return NextResponse.json({ error: 'Choose a role label from this organisation.' }, { status: 400 });
    const current = await db.user.findFirst({ where: { id: params.id, organisationId: actor.organisationId }, include: { memberships: { where: { active: true }, include: { role: true } } } });
    if (!current) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    const updated = await db.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id: current.id }, data: { active: parsed.data.active } });
      await tx.membership.updateMany({ where: { organisationId: actor.organisationId, userId: current.id }, data: { active: false } });
      if (parsed.data.active) {
        const membership = await tx.membership.findFirst({ where: { organisationId: actor.organisationId, userId: current.id, roleId: role.id } });
        if (membership) await tx.membership.update({ where: { id: membership.id }, data: { active: true } });
        else await tx.membership.create({ data: { organisationId: actor.organisationId, userId: current.id, roleId: role.id } });
      } else await tx.userSession.updateMany({ where: { userId: current.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return user;
    });
    await audit({ organisationId: actor.organisationId, actorId: actor.id, action: 'USER_ACCESS_UPDATED', resourceType: 'User', resourceId: updated.id, before: { active: current.active, roles: current.memberships.map((membership) => membership.role.slug) }, after: { active: updated.active, role: parsed.data.active ? role.slug : null } });
    return NextResponse.json({ id: updated.id, active: updated.active, role: parsed.data.active ? role.slug : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to update user access.' : message }, { status });
  }
}
