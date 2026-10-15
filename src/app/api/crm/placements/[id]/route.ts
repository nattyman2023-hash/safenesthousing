import { NextResponse } from 'next/server';
import { apiErrorResponse, CrmApiError, validationError } from '@/lib/crm-api';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { placementRemovalSchema, placementUpdateSchema } from '@/lib/crm-validation';
import { canTransitionPlacement, hasOccupancyOverlap, isCurrentPlacement } from '@/lib/domain';
import { db } from '@/lib/db';
import { inspectPlacementDependencies, placementBackedOccupancy, syncRoomAvailability } from '@/lib/placement-operations';
import { placementRemovalPlan } from '@/lib/placement-lifecycle';

/**
 * One placement's lifecycle: ordinary corrections, ending it, and removing a placement that was
 * created in error.
 *
 * Every read is scoped by the signed-in user's organisation, so a placement that belongs to another
 * organisation is a genuine 404 rather than a data leak, and an expired session still answers 401.
 * The rules themselves live in lib/placement-lifecycle.ts and lib/placement-operations.ts.
 */

type PlacementParams = { params: Promise<{ id: string }> };

async function loadPlacement(user: { organisationId: string }, id: string) {
  const placement = await db.placement.findFirst({
    where: { id, client: { organisationId: user.organisationId } },
    include: {
      client: { select: { id: true, reference: true, displayName: true } },
      occupancyRecords: true,
      property: { select: { id: true, publicName: true } }
    }
  });
  if (!placement) throw new CrmApiError('Placement not found.', 404);
  return placement;
}

function parseDateValue(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new CrmApiError(`Enter a valid ${label}.`);
  return date;
}

/** Ordinary corrections plus ending, reactivating, or amending the dates of a placement. */
export async function PATCH(request: Request, props: PlacementParams) {
  const params = await props.params;
  try {
    const user = await requireUser();
    const parsed = placementUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues, 'Check the placement details.');
    const placement = await loadPlacement(user, params.id);
    const occupancy = placement.occupancyRecords[0];
    const changes = parsed.data;
    const ending = changes.status !== undefined && changes.status !== 'ACTIVE';
    const reactivating = changes.status === 'ACTIVE' && !isCurrentPlacement(placement.status);
    const nextStart = changes.startDate !== undefined ? parseDateValue(changes.startDate, 'start date') : placement.startDate;

    // A status change has to be one the lifecycle map allows, and a stale page must not be able to
    // push a placement somewhere the current state cannot go.
    if (changes.status !== undefined && !reactivating && changes.status !== placement.status && !canTransitionPlacement(placement.status, changes.status)) {
      throw new Error(`Invalid placement transition: ${placement.status} -> ${changes.status}`);
    }

    let nextEndDate: Date | null = placement.endDate;
    if (changes.endDate !== undefined) {
      if (changes.endDate === '') {
        if (!reactivating && !isCurrentPlacement(placement.status)) throw new CrmApiError('Reopen the placement before clearing its end date.', 409);
        nextEndDate = null;
      } else nextEndDate = parseDateValue(changes.endDate, 'end date');
    }
    if (ending && changes.endDate === undefined) nextEndDate = new Date();
    if (reactivating) nextEndDate = null;
    if (!nextEndDate && !isCurrentPlacement(changes.status ?? placement.status)) nextEndDate = new Date();
    if (nextEndDate && nextEndDate < nextStart) throw new CrmApiError('Enter an end date on or after the placement start date.');
    // The occupancy row is the availability record for the move, so a placement that is missing one
    // is repaired below rather than refused: it would otherwise be impossible to end or correct.

    // Moving a placement to another room or property keeps the occupancy row, the room statuses and
    // the register in step, so both sides are resolved and checked before anything is written.
    let nextPropertyId = placement.propertyId;
    let nextRoomId = placement.roomId;
    if (changes.propertyId !== undefined || changes.roomId !== undefined) {
      nextPropertyId = changes.propertyId ?? placement.propertyId;
      nextRoomId = changes.roomId ?? placement.roomId;
      const property = await db.property.findFirst({ where: { id: nextPropertyId, organisationId: user.organisationId } });
      if (!property) throw new CrmApiError('Choose a property from your organisation.');
      const room = await db.room.findFirst({ where: { id: nextRoomId, propertyId: property.id } });
      if (!room) throw new CrmApiError('Choose a room from the selected property.');
      if (nextRoomId !== placement.roomId) {
        const otherRoomRecords = await db.occupancyRecord.findMany({ where: { roomId: nextRoomId, placement: placementBackedOccupancy }, select: { startDate: true, endDate: true } });
        if (hasOccupancyOverlap(otherRoomRecords, nextStart, nextEndDate)) throw new CrmApiError('That room already has an overlapping occupancy record.', 409);
        const otherClientRecords = await db.occupancyRecord.findMany({ where: { clientId: placement.clientId, placement: placementBackedOccupancy, ...(occupancy ? { id: { not: occupancy.id } } : {}) }, select: { startDate: true, endDate: true } });
        if (hasOccupancyOverlap(otherClientRecords, nextStart, nextEndDate)) throw new CrmApiError('The service user already has an overlapping placement.', 409);
      }
    }

    // Reopening is only possible while the room is still free, exactly as the status promised.
    if (reactivating) {
      const otherRecords = await db.occupancyRecord.findMany({ where: { roomId: nextRoomId, placement: placementBackedOccupancy, ...(occupancy ? { id: { not: occupancy.id } } : {}) }, select: { startDate: true, endDate: true } });
      if (hasOccupancyOverlap(otherRecords, nextStart, null)) throw new CrmApiError('The placement cannot be reopened because the room is occupied.', 409);
    }

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.placement.update({
        where: { id: placement.id },
        data: {
          status: changes.status ?? placement.status,
          startDate: nextStart,
          endDate: nextEndDate,
          tenancyRef: changes.tenancyRef !== undefined ? (changes.tenancyRef || null) : placement.tenancyRef,
          endedReason: changes.endedReason !== undefined ? (changes.endedReason || null) : placement.endedReason,
          propertyId: nextPropertyId,
          roomId: nextRoomId
        }
      });
      // A placement recorded without an occupancy row is repaired here, so the move has a proper
      // availability record from the moment it is corrected.
      const occupancyRecord = occupancy
        ? await tx.occupancyRecord.update({
          where: { id: occupancy.id },
          data: { propertyId: nextPropertyId, roomId: nextRoomId, startDate: nextStart, endDate: reactivating ? null : nextEndDate }
        })
        : await tx.occupancyRecord.create({
          data: { propertyId: nextPropertyId, roomId: nextRoomId, clientId: placement.clientId, placementId: placement.id, startDate: nextStart, endDate: isCurrentPlacement(next.status) ? null : nextEndDate }
        });
      // Room status is derived from the live occupancy rows rather than set by hand: the room the
      // placement left is released only when nothing else still occupies it.
      if (nextRoomId !== placement.roomId) await syncRoomAvailability(tx, placement.roomId, nextStart, occupancyRecord.id);
      if (isCurrentPlacement(next.status)) await tx.room.update({ where: { id: nextRoomId }, data: { status: 'OCCUPIED' } });
      else await syncRoomAvailability(tx, nextRoomId, nextEndDate ?? new Date(), occupancyRecord.id);
      return next;
    });

    const action = reactivating ? 'PLACEMENT_REACTIVATED' : ending ? 'PLACEMENT_ENDED' : 'PLACEMENT_UPDATED';
    await audit({
      organisationId: user.organisationId,
      actorId: user.id,
      action,
      resourceType: 'Placement',
      resourceId: placement.id,
      before: { status: placement.status, startDate: placement.startDate, endDate: placement.endDate, propertyId: placement.propertyId, roomId: placement.roomId, tenancyRef: placement.tenancyRef },
      after: { status: updated.status, startDate: updated.startDate, endDate: updated.endDate, propertyId: updated.propertyId, roomId: updated.roomId, tenancyRef: updated.tenancyRef, reason: changes.endedReason || undefined }
    });
    return NextResponse.json({ id: updated.id, status: updated.status, startDate: updated.startDate, endDate: updated.endDate });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to update the placement.');
  }
}

/**
 * Removes a placement that was created in error.
 *
 * Dependencies are inspected here rather than trusted from the page, and the decision comes from the
 * shared removal plan: a placement with nothing worked against it is deleted together with its own
 * occupancy rows, while one that carries history is refused and pointed at the entered-in-error
 * action. The audit entry is written inside the same transaction as the delete, so an executed
 * removal can never be missing from the trail.
 */
export async function DELETE(request: Request, props: PlacementParams) {
  const params = await props.params;
  try {
    const user = await requireUser();
    const parsed = placementRemovalSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error.issues, 'Record why this placement is being removed and confirm it.');
    const placement = await loadPlacement(user, params.id);
    const dependencies = await inspectPlacementDependencies(placement);
    const plan = placementRemovalPlan({ status: placement.status, occupancyRecords: dependencies.occupancyRecords, moveChecklists: dependencies.moveChecklists, retained: dependencies.retained });

    if (plan.mode === 'MARK_IN_ERROR') {
      if (placement.status === 'ENTERED_IN_ERROR') return NextResponse.json({ id: placement.id, removed: false, mode: 'MARK_IN_ERROR', alreadyMarked: true, plan });
      return NextResponse.json({ error: 'This placement has history attached, so it cannot be deleted. Mark it as entered in error instead.', mode: 'MARK_IN_ERROR', plan }, { status: 409 });
    }

    const roomId = placement.roomId;
    const before = {
      id: placement.id,
      clientId: placement.clientId,
      clientReference: placement.client.reference,
      status: placement.status,
      startDate: placement.startDate,
      endDate: placement.endDate,
      propertyId: placement.propertyId,
      roomId: placement.roomId,
      tenancyRef: placement.tenancyRef
    };
    await db.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          organisationId: user.organisationId,
          actorId: user.id,
          action: 'PLACEMENT_REMOVED_IN_ERROR',
          resourceType: 'Placement',
          resourceId: placement.id,
          beforeJson: JSON.stringify(before),
          afterJson: JSON.stringify({ removed: true, reason: parsed.data.reason, occupiedBy: dependencies.occupancyRecords, moveChecklists: dependencies.moveChecklists }),
          success: true
        }
      });
      // The occupancy rows carry the required foreign key, so they are removed with the placement:
      // no dangling key, and the room is released from the occupancy rows that remain.
      await tx.occupancyRecord.deleteMany({ where: { placementId: placement.id } });
      await tx.placement.delete({ where: { id: placement.id } });
      await syncRoomAvailability(tx, roomId, new Date());
    });

    return NextResponse.json({ id: placement.id, removed: true, mode: 'REMOVE', reason: parsed.data.reason });
  } catch (error) {
    return apiErrorResponse(error, 'Unable to remove the placement.');
  }
}
