import type { Prisma } from '@prisma/client';
import { db } from './db';
import type { PlacementRetainedRecord } from './placement-lifecycle';

/**
 * Server-side placement plumbing shared by the detail page and the lifecycle route handlers.
 *
 * Only two tables can point at a placement: `OccupancyRecord.placementId` (a required foreign key)
 * and `MoveChecklist.placementId`. Everything else the organisation holds about a stay — documents,
 * incidents, Safe & Well checks, tasks, appointments, repairs and invoices — belongs to the service
 * user, so it is never touched when a placement is corrected. The inspection below records both
 * halves of that truth so the confirmation dialog can say exactly what will and will not change.
 */

export type PlacementDependencyInspection = {
  /** Rows that carry this placement's own foreign key. */
  occupancyRecords: number;
  moveChecklists: number;
  /** Records about the service user that stay on file whatever happens to the placement. */
  retained: PlacementRetainedRecord[];
};

const counted = (count: number, label: string): PlacementRetainedRecord => ({ count, label: `${label}${count === 1 ? '' : 's'}` });

export async function inspectPlacementDependencies(placement: { id: string; clientId: string }): Promise<PlacementDependencyInspection> {
  const [occupancyRecords, moveChecklists, documents, incidents, safeWellChecks, tasks, appointments, maintenanceTickets, invoices] = await Promise.all([
    db.occupancyRecord.count({ where: { placementId: placement.id } }),
    db.moveChecklist.count({ where: { placementId: placement.id } }),
    db.document.count({ where: { clientId: placement.clientId } }),
    db.incident.count({ where: { clientId: placement.clientId } }),
    db.safeWellCheck.count({ where: { clientId: placement.clientId } }),
    db.task.count({ where: { clientId: placement.clientId } }),
    db.appointment.count({ where: { clientId: placement.clientId } }),
    db.maintenanceTicket.count({ where: { clientId: placement.clientId } }),
    db.invoice.count({ where: { clientId: placement.clientId } })
  ]);
  return {
    occupancyRecords,
    moveChecklists,
    retained: [
      counted(documents, 'document filed against the service user'),
      counted(incidents, 'incident about the service user'),
      counted(safeWellChecks, 'Safe & Well check'),
      counted(tasks, 'task'),
      counted(appointments, 'appointment'),
      counted(maintenanceTickets, 'maintenance ticket'),
      counted(invoices, 'invoice')
    ]
  };
}

/**
 * A placement entered in error is a correction, not a stay, so its occupancy row must not reserve a
 * room or make the person look double-booked. Every overlap and availability check passes this as the
 * related-placement filter.
 */
export const placementBackedOccupancy: Prisma.PlacementWhereInput = { status: { not: 'ENTERED_IN_ERROR' } };

type Tx = Prisma.TransactionClient;

/** Occupancy rows for a room that had not ended by `at`. The source of truth for room availability. */
export async function countLiveRoomOccupancy(tx: Tx, roomId: string, at: Date, excludeOccupancyId?: string): Promise<number> {
  return tx.occupancyRecord.count({
    where: {
      roomId,
      placement: placementBackedOccupancy,
      ...(excludeOccupancyId ? { id: { not: excludeOccupancyId } } : {}),
      OR: [{ endDate: null }, { endDate: { gt: at } }]
    }
  });
}

/**
 * Room status follows the occupancy records rather than the other way round: when the last live
 * occupancy for a room has ended, the room is available again; if another live occupancy remains
 * (a back-to-back placement), the room stays occupied.
 */
export async function syncRoomAvailability(tx: Tx, roomId: string, at: Date, excludeOccupancyId?: string): Promise<'AVAILABLE' | 'OCCUPIED'> {
  const remaining = await countLiveRoomOccupancy(tx, roomId, at, excludeOccupancyId);
  const status = remaining === 0 ? 'AVAILABLE' : 'OCCUPIED';
  await tx.room.update({ where: { id: roomId }, data: { status } });
  return status;
}
