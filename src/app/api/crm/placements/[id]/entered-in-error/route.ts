import { NextResponse } from 'next/server';
import { apiErrorResponse, CrmApiError, validationError } from '@/lib/crm-api';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { placementRemovalSchema } from '@/lib/crm-validation';
import { assertPlacementTransition } from '@/lib/domain';
import { db } from '@/lib/db';
import { syncRoomAvailability } from '@/lib/placement-operations';

/**
 * Marks a placement as entered in error.
 *
 * This is the non-destructive half of the safe-removal policy: the record stays, the reason is
 * written to the placement and to the audit trail, and the placement is closed on the day it started
 * so it stops counting as where the person lives. Its occupancy rows are closed with it, and an
 * entered-in-error occupancy row is ignored by every overlap check, so it can never reserve a room
 * or make a service user look double-booked.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser();
    const parsed = placementRemovalSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error.issues, 'Record why this placement is being marked entered in error and confirm it.');
    const placement = await db.placement.findFirst({
      where: { id: params.id, client: { organisationId: user.organisationId } },
      include: { client: { select: { id: true, reference: true } }, occupancyRecords: true }
    });
    if (!placement) throw new CrmApiError('Placement not found.', 404);
    if (placement.status === 'ENTERED_IN_ERROR') return NextResponse.json({ id: placement.id, status: placement.status, mode: 'MARK_IN_ERROR', alreadyMarked: true });

    assertPlacementTransition(placement.status, 'ENTERED_IN_ERROR');
    const closedOn = placement.startDate;
    const updated = await db.$transaction(async (tx) => {
      const next = await tx.placement.update({
        where: { id: placement.id },
        data: { status: 'ENTERED_IN_ERROR', endDate: closedOn, endedReason: parsed.data.reason }
      });
      await tx.occupancyRecord.updateMany({ where: { placementId: placement.id }, data: { endDate: closedOn } });
      await syncRoomAvailability(tx, placement.roomId, closedOn);
      return next;
    });

    await audit({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'PLACEMENT_MARKED_ENTERED_IN_ERROR',
      resourceType: 'Placement',
      resourceId: placement.id,
      before: { status: placement.status, startDate: placement.startDate, endDate: placement.endDate, propertyId: placement.propertyId, roomId: placement.roomId, clientReference: placement.client.reference },
      after: { status: updated.status, endDate: updated.endDate, reason: parsed.data.reason }
    });

    return NextResponse.json({ id: updated.id, status: updated.status, endDate: updated.endDate, mode: 'MARK_IN_ERROR' });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to mark the placement as entered in error.');
  }
}
