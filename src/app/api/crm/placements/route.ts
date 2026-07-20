import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { canViewRestricted, getScopedIds, requirePermission } from '@/lib/auth';
import { placementCreateSchema } from '@/lib/crm-validation';
import { hasOccupancyOverlap } from '@/lib/domain';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const user = await requirePermission('placements.write');
    const parsed = placementCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the placement details.' }, { status: 400 });
    const startDate = new Date(parsed.data.startDate);
    if (Number.isNaN(startDate.getTime())) return NextResponse.json({ error: 'Enter a valid start date.' }, { status: 400 });
    const serviceIds = getScopedIds(user, 'serviceIds');
    const propertyIds = getScopedIds(user, 'propertyIds');
    const client = await db.client.findFirst({ where: { id: parsed.data.clientId, organisationId: user.organisationId, ...(serviceIds.length ? { serviceId: { in: serviceIds } } : {}) } });
    if (!client) return NextResponse.json({ error: 'Choose a client from your organisation scope.' }, { status: 400 });
    if (client.restricted && !canViewRestricted(user)) return NextResponse.json({ error: 'You are not authorised to place this restricted client.' }, { status: 403 });
    const property = await db.property.findFirst({ where: { id: parsed.data.propertyId, organisationId: user.organisationId, ...(propertyIds.length ? { id: { in: propertyIds } } : {}) } });
    if (!property) return NextResponse.json({ error: 'Choose a property from your organisation scope.' }, { status: 400 });
    const room = await db.room.findFirst({ where: { id: parsed.data.roomId, propertyId: property.id } });
    if (!room) return NextResponse.json({ error: 'Choose a room from the selected property.' }, { status: 400 });
    const existingRoomRecords = await db.occupancyRecord.findMany({ where: { roomId: room.id }, select: { startDate: true, endDate: true } });
    const existingClientRecords = await db.occupancyRecord.findMany({ where: { clientId: client.id }, select: { startDate: true, endDate: true } });
    if (hasOccupancyOverlap(existingRoomRecords, startDate, null)) return NextResponse.json({ error: 'This room already has an overlapping occupancy record.' }, { status: 409 });
    if (hasOccupancyOverlap(existingClientRecords, startDate, null)) return NextResponse.json({ error: 'This client already has an overlapping placement.' }, { status: 409 });
    const result = await db.$transaction(async (tx) => {
      const placement = await tx.placement.create({ data: { clientId: client.id, propertyId: property.id, roomId: room.id, startDate, tenancyRef: parsed.data.tenancyRef, status: 'ACTIVE' } });
      await tx.occupancyRecord.create({ data: { propertyId: property.id, roomId: room.id, clientId: client.id, placementId: placement.id, startDate } });
      await tx.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
      return placement;
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'PLACEMENT_CREATED', resourceType: 'Placement', resourceId: result.id, after: { clientId: client.id, propertyId: property.id, roomId: room.id, startDate } });
    return NextResponse.json({ id: result.id, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to create the placement.' : message }, { status });
  }
}
