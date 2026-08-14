import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { roomCreateSchema } from '@/lib/crm-validation';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = roomCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the room details.' }, { status: 400 });
    const property = await db.property.findFirst({ where: { id: parsed.data.propertyId, organisationId: user.organisationId } });
    if (!property) return NextResponse.json({ error: 'Choose a property from your organisation.' }, { status: 400 });
    const duplicate = await db.room.findUnique({ where: { propertyId_label: { propertyId: property.id, label: parsed.data.label } } });
    if (duplicate) return NextResponse.json({ error: 'A room with that label already exists for this property.' }, { status: 409 });
    const room = await db.room.create({ data: { propertyId: property.id, label: parsed.data.label, status: parsed.data.status, notes: parsed.data.notes } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'ROOM_CREATED', resourceType: 'Room', resourceId: room.id, after: { propertyId: property.id, label: room.label, status: room.status } });
    return NextResponse.json({ id: room.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to add the room.' : message }, { status });
  }
}
