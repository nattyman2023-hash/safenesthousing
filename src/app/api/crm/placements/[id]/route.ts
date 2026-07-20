import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { canViewRestricted, requirePermission } from '@/lib/auth';
import { placementStatusSchema } from '@/lib/crm-validation';
import { hasOccupancyOverlap } from '@/lib/domain';
import { db } from '@/lib/db';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('placements.write');
    const parsed = placementStatusSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Choose a valid placement status.' }, { status: 400 });
    const placement = await db.placement.findFirst({ where: { id: params.id, client: { organisationId: user.organisationId } }, include: { client: true, occupancyRecords: true } });
    if (!placement) return NextResponse.json({ error: 'Placement not found.' }, { status: 404 });
    if (placement.client.restricted && !canViewRestricted(user)) return NextResponse.json({ error: 'You are not authorised to update this restricted placement.' }, { status: 403 });
    if (parsed.data.status === 'ACTIVE' && placement.status === 'ACTIVE') return NextResponse.json({ id: placement.id, status: placement.status });
    const occupancy = placement.occupancyRecords[0];
    if (!occupancy) return NextResponse.json({ error: 'Occupancy record not found.' }, { status: 409 });
    let endDate: Date | null = null;
    if (parsed.data.status !== 'ACTIVE') {
      endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : new Date();
      if (Number.isNaN(endDate.getTime()) || endDate < placement.startDate) return NextResponse.json({ error: 'Enter an end date on or after the placement start date.' }, { status: 400 });
    } else {
      const otherRecords = await db.occupancyRecord.findMany({ where: { roomId: placement.roomId, id: { not: occupancy.id } }, select: { startDate: true, endDate: true } });
      if (hasOccupancyOverlap(otherRecords, placement.startDate, null)) return NextResponse.json({ error: 'The placement cannot be reactivated because the room is occupied.' }, { status: 409 });
    }
    const updated = await db.$transaction(async (tx) => {
      const next = await tx.placement.update({ where: { id: placement.id }, data: { status: parsed.data.status, endDate } });
      await tx.occupancyRecord.update({ where: { id: occupancy.id }, data: { endDate } });
      if (parsed.data.status !== 'ACTIVE') {
        const otherActive = await tx.occupancyRecord.count({ where: { roomId: placement.roomId, id: { not: occupancy.id }, OR: [{ endDate: null }, { endDate: { gt: endDate ?? new Date() } }] } });
        if (!otherActive) await tx.room.update({ where: { id: placement.roomId }, data: { status: 'AVAILABLE' } });
      } else await tx.room.update({ where: { id: placement.roomId }, data: { status: 'OCCUPIED' } });
      return next;
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: updated.status === 'ACTIVE' ? 'PLACEMENT_REACTIVATED' : 'PLACEMENT_ENDED', resourceType: 'Placement', resourceId: placement.id, before: { status: placement.status, endDate: placement.endDate }, after: { status: updated.status, endDate: updated.endDate } });
    return NextResponse.json({ id: updated.id, status: updated.status, endDate: updated.endDate });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to update the placement.' : message }, { status });
  }
}
