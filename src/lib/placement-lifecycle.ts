/**
 * Placement lifecycle rules.
 *
 * A placement is the record of one person living in one room between two dates. Everything that
 * changes a placement's status, or removes one, goes through the guards here so the register,
 * the service user's profile, the room occupancy and the audit trail cannot disagree.
 *
 * Two ideas do the work:
 *
 *  - a status transition map, so a state can only move somewhere that makes sense (a placement
 *    entered in error is closed for good, because reactivating it would recreate the mistake);
 *  - a removal plan, which decides between deleting a duplicate that never meant anything and
 *    preserving the history of a stay that did. Nothing here deletes anything: the plan is advice
 *    the route handler acts on, so one rule governs the API, the confirmation dialog and the tests.
 */

export const PLACEMENT_STATUSES = ['ACTIVE', 'MOVED_OUT', 'CANCELLED', 'ENTERED_IN_ERROR'] as const;

export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];

const placementTransitionMap: Record<PlacementStatus, PlacementStatus[]> = {
  // ENTERED_IN_ERROR is reachable from every open or ended state: correcting a record that should
  // never have existed is a different act from ending a placement that really ran.
  ACTIVE: ['MOVED_OUT', 'CANCELLED', 'ENTERED_IN_ERROR'],
  MOVED_OUT: ['ACTIVE', 'ENTERED_IN_ERROR'],
  CANCELLED: ['ACTIVE', 'ENTERED_IN_ERROR'],
  // A placement entered in error is closed: the record survives as evidence of the correction.
  ENTERED_IN_ERROR: []
};

export function canTransitionPlacement(from: string, to: string): boolean {
  return (placementTransitionMap[from as PlacementStatus] ?? []).includes(to as PlacementStatus);
}

export function nextPlacementStatuses(status: string): PlacementStatus[] {
  return placementTransitionMap[status as PlacementStatus] ?? [];
}

export function assertPlacementTransition(from: string, to: string): void {
  if (!canTransitionPlacement(from, to)) throw new Error(`Invalid placement transition: ${from} -> ${to}`);
}

/** The stored status values the API accepts. `ENTERED_IN_ERROR` is written by the removal action
 * rather than by the ordinary status control, but it is a legal stored value either way. */
export function isPlacementStatus(value: string): value is PlacementStatus {
  return (PLACEMENT_STATUSES as readonly string[]).includes(value);
}

/** Whether the register and the profile show this placement as where the person lives now. */
export function isCurrentPlacement(status: string): boolean {
  return status === 'ACTIVE';
}

/** A placement recorded as a mistake: kept for the audit trail, never shown as where someone lives. */
export function isEnteredInError(status: string): boolean {
  return status === 'ENTERED_IN_ERROR';
}

export type PlacementLifecycleKind = 'CURRENT' | 'TEMPORARY' | 'ENDED' | 'CANCELLED' | 'ENTERED_IN_ERROR';

/**
 * The register groups placements by what they mean, not by their raw status:
 *
 *  - CURRENT     an open-ended placement with no end date — where the person lives now;
 *  - TEMPORARY   active, but with an end date already agreed (a time-limited or respite stay);
 *  - ENDED       the person moved out, so the placement stays in the history;
 *  - CANCELLED   the placement was cancelled before or after it started;
 *  - ENTERED_IN_ERROR  created by mistake; retained so the correction is auditable.
 */
export function placementLifecycleKind(placement: { status: string; endDate?: Date | null }, now = new Date()): PlacementLifecycleKind {
  if (isEnteredInError(placement.status)) return 'ENTERED_IN_ERROR';
  if (isCurrentPlacement(placement.status)) {
    return placement.endDate && placement.endDate.getTime() > now.getTime() ? 'TEMPORARY' : 'CURRENT';
  }
  return placement.status === 'CANCELLED' ? 'CANCELLED' : 'ENDED';
}

export function placementLifecycleLabel(kind: PlacementLifecycleKind): string {
  if (kind === 'CURRENT') return 'Current placement';
  if (kind === 'TEMPORARY') return 'Temporary placement';
  if (kind === 'ENDED') return 'Ended placement';
  if (kind === 'CANCELLED') return 'Cancelled placement';
  return 'Entered in error';
}

/** Whether a kind belongs under the profile's "Placement history" heading rather than the current card. */
export function isHistoricalPlacementKind(kind: PlacementLifecycleKind): boolean {
  return kind === 'ENDED' || kind === 'CANCELLED' || kind === 'ENTERED_IN_ERROR';
}

/** The register's stage order, so current work reads first and corrections read last. */
export function placementLifecycleStages(): PlacementLifecycleKind[] {
  return ['CURRENT', 'TEMPORARY', 'ENDED', 'CANCELLED', 'ENTERED_IN_ERROR'];
}

/** The badge tone for a lifecycle kind, matching StatusBadge's own palette. */
export function placementLifecycleTone(kind: PlacementLifecycleKind): 'success' | 'warning' | 'danger' | 'neutral' {
  if (kind === 'CURRENT') return 'success';
  if (kind === 'TEMPORARY') return 'warning';
  if (kind === 'ENTERED_IN_ERROR') return 'danger';
  return 'neutral';
}


export type PlacementRetainedRecord = { label: string; count: number };

export type PlacementRemovalInput = {
  status: string;
  /** Occupancy rows carry the placement's own foreign key; they are closed with it. */
  occupancyRecords: number;
  /** Move checklists are worked against a placement, so they are evidence a move really happened. */
  moveChecklists: number;
  /** Records that belong to the service user or the property and are never touched. */
  retained?: PlacementRetainedRecord[];
};

export type PlacementRemovalPlan = {
  /** REMOVE deletes the placement; MARK_IN_ERROR keeps it and closes it as a mistake. */
  mode: 'REMOVE' | 'MARK_IN_ERROR';
  /** Plain language for the confirmation dialog, before anything is changed. */
  explanation: string;
  /** What stays on record either way. */
  retained: string[];
  /** Why a hard delete is refused, if it is. */
  blockedBy: string[];
};

/**
 * The safe-removal policy.
 *
 *  - Nothing worked against the placement: the duplicate was a mistake and can be removed, so the
 *    placement and its own occupancy rows go together and no foreign key is left dangling.
 *  - A move checklist, or a placement that already ran and ended: the record is history. It is
 *    marked entered in error instead, which closes the occupancy and hides it from current
 *    placements while the audit trail and the placement history survive.
 */
export function placementRemovalPlan(input: PlacementRemovalInput): PlacementRemovalPlan {
  const retained = (input.retained ?? [])
    .filter((record) => record.count > 0)
    .map((record) => `${record.count} ${record.label}`);

  if (isEnteredInError(input.status)) {
    return {
      mode: 'MARK_IN_ERROR',
      explanation: 'This placement is already marked as entered in error. Nothing further is needed.',
      retained,
      blockedBy: ['Already marked as entered in error.']
    };
  }

  const blockedBy: string[] = [];
  if (input.moveChecklists > 0) {
    blockedBy.push(input.moveChecklists === 1
      ? '1 move checklist was worked against this placement, so the move is part of the record.'
      : `${input.moveChecklists} move checklists were worked against this placement, so the move is part of the record.`);
  }
  if (!isCurrentPlacement(input.status)) {
    blockedBy.push('This placement is recorded as ended, so it is part of the placement history rather than a mistake.');
  }

  if (blockedBy.length) {
    return {
      mode: 'MARK_IN_ERROR',
      explanation: 'The placement stays on record, marked as entered in error. It is closed on the date it started, the room is released, and it stops appearing as a current placement.',
      retained,
      blockedBy
    };
  }

  return {
    mode: 'REMOVE',
    explanation: input.occupancyRecords > 0
      ? 'The placement and its own room-occupancy rows are deleted, and the room becomes available again. Nothing else is deleted.'
      : 'The placement is deleted. It has no room-occupancy row, so no other record changes.',
    retained,
    blockedBy: []
  };
}
