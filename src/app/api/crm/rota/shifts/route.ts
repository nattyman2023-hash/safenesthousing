import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { hasRole, requirePermission } from '@/lib/auth';
import { rotaShiftSchema } from '@/lib/crm-validation';
import { hasRotaOverlap } from '@/lib/domain';

const overrideRoles = ['super-administrator', 'organisation-administrator', 'service-manager'];

export async function POST(request: Request) {
  try {
    const user = await requirePermission('rota.write');
    const parsed = rotaShiftSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the shift details.' }, { status: 400 });
    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return NextResponse.json({ error: 'Shift end must be after shift start.' }, { status: 400 });
    if (parsed.data.propertyId) {
      const property = await db.property.findFirst({ where: { id: parsed.data.propertyId, organisationId: user.organisationId } });
      if (!property) return NextResponse.json({ error: 'Choose a property from this organisation.' }, { status: 400 });
    }
    if (parsed.data.serviceId) {
      const service = await db.service.findFirst({ where: { id: parsed.data.serviceId, organisationId: user.organisationId } });
      if (!service) return NextResponse.json({ error: 'Choose a service from this organisation.' }, { status: 400 });
    }
    if (parsed.data.assignedUserId) {
      const assignee = await db.user.findFirst({ where: { id: parsed.data.assignedUserId, organisationId: user.organisationId, active: true } });
      if (!assignee) return NextResponse.json({ error: 'Choose an active staff assignee.' }, { status: 400 });
      const existing = await db.rotaAssignment.findMany({ where: { userId: assignee.id, shift: { organisationId: user.organisationId } }, include: { shift: { select: { startsAt: true, endsAt: true } } } });
      if (hasRotaOverlap(existing.map((item) => item.shift), startsAt, endsAt)) {
        if (!parsed.data.overrideReason) return NextResponse.json({ error: 'This assignment overlaps an existing shift. Add an authorised override reason to continue.' }, { status: 409 });
        if (!hasRole(user, overrideRoles)) return NextResponse.json({ error: 'Only an authorised manager may override a rota conflict.' }, { status: 403 });
      }
    }
    const shift = await db.$transaction(async (tx) => {
      const created = await tx.rotaShift.create({ data: { organisationId: user.organisationId, propertyId: parsed.data.propertyId || undefined, serviceId: parsed.data.serviceId || undefined, shiftType: parsed.data.shiftType, startsAt, endsAt, handover: parsed.data.handover, overrideReason: parsed.data.overrideReason } });
      if (parsed.data.assignedUserId) await tx.rotaAssignment.create({ data: { shiftId: created.id, userId: parsed.data.assignedUserId } });
      return created;
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'ROTA_SHIFT_CREATED', resourceType: 'RotaShift', resourceId: shift.id, after: { startsAt, endsAt, assignedUserId: parsed.data.assignedUserId, override: !!parsed.data.overrideReason } });
    return NextResponse.json({ id: shift.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to create the rota shift.' : message }, { status });
  }
}
