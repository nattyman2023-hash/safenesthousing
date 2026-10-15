import { describe, expect, it } from 'vitest';
import {
  assertPlacementTransition,
  canTransitionPlacement,
  isCurrentPlacement,
  isEnteredInError,
  isHistoricalPlacementKind,
  nextPlacementStatuses,
  placementLifecycleKind,
  placementLifecycleLabel,
  placementLifecycleStages,
  placementLifecycleTone,
  placementRemovalPlan
} from '@/lib/placement-lifecycle';
import { isSupportPlanReviewOverdue } from '@/lib/domain';

const now = new Date(2026, 7, 15);

describe('placement lifecycle rules', () => {
  it('allows the transitions staff actually make and refuses the rest', () => {
    expect(canTransitionPlacement('ACTIVE', 'MOVED_OUT')).toBe(true);
    expect(canTransitionPlacement('ACTIVE', 'CANCELLED')).toBe(true);
    expect(canTransitionPlacement('ACTIVE', 'ENTERED_IN_ERROR')).toBe(true);
    expect(canTransitionPlacement('MOVED_OUT', 'ACTIVE')).toBe(true);
    expect(canTransitionPlacement('CANCELLED', 'ACTIVE')).toBe(true);
    // A placement marked as a mistake is never quietly reopened.
    expect(canTransitionPlacement('ENTERED_IN_ERROR', 'ACTIVE')).toBe(false);
    expect(nextPlacementStatuses('ENTERED_IN_ERROR')).toEqual([]);
    expect(nextPlacementStatuses('not-a-status')).toEqual([]);
  });

  it('reports an invalid transition in the wording the API layer maps to a 409', () => {
    expect(() => assertPlacementTransition('ACTIVE', 'PLACED')).toThrow('Invalid placement transition: ACTIVE -> PLACED');
    expect(() => assertPlacementTransition('ACTIVE', 'MOVED_OUT')).not.toThrow();
  });

  it('only counts an active placement as current', () => {
    expect(isCurrentPlacement('ACTIVE')).toBe(true);
    expect(isCurrentPlacement('MOVED_OUT')).toBe(false);
    expect(isCurrentPlacement('CANCELLED')).toBe(false);
    expect(isCurrentPlacement('ENTERED_IN_ERROR')).toBe(false);
    expect(isEnteredInError('ENTERED_IN_ERROR')).toBe(true);
  });

  it('names each stage so the register never leans on colour alone', () => {
    expect(placementLifecycleKind({ status: 'ACTIVE', endDate: null }, now)).toBe('CURRENT');
    expect(placementLifecycleKind({ status: 'ACTIVE', endDate: new Date(2026, 8, 1) }, now)).toBe('TEMPORARY');
    expect(placementLifecycleKind({ status: 'MOVED_OUT', endDate: new Date(2026, 6, 1) }, now)).toBe('ENDED');
    expect(placementLifecycleKind({ status: 'CANCELLED', endDate: new Date(2026, 6, 1) }, now)).toBe('CANCELLED');
    expect(placementLifecycleKind({ status: 'ENTERED_IN_ERROR', endDate: new Date(2026, 6, 1) }, now)).toBe('ENTERED_IN_ERROR');
    // An end date in the past does not by itself demote an active placement: the stored status is
    // what says where someone lives, so a stale date cannot make a current placement look historical.
    expect(placementLifecycleKind({ status: 'ACTIVE', endDate: new Date(2026, 6, 1) }, now)).toBe('CURRENT');
    expect(placementLifecycleLabel('TEMPORARY')).toBe('Temporary placement');
    expect(placementLifecycleLabel('ENTERED_IN_ERROR')).toBe('Entered in error');
    expect(isHistoricalPlacementKind('ENDED')).toBe(true);
    expect(isHistoricalPlacementKind('CURRENT')).toBe(false);
    expect(placementLifecycleStages()[0]).toBe('CURRENT');
    expect(placementLifecycleTone('CURRENT')).toBe('success');
    expect(placementLifecycleTone('ENTERED_IN_ERROR')).toBe('danger');
  });
});

describe('safe removal policy for an incorrect placement', () => {
  it('allows removal when nothing was worked against the placement', () => {
    const plan = placementRemovalPlan({ status: 'ACTIVE', occupancyRecords: 1, moveChecklists: 0 });
    expect(plan.mode).toBe('REMOVE');
    expect(plan.blockedBy).toEqual([]);
    expect(plan.explanation).toContain('room-occupancy rows are deleted');
  });

  it('keeps the history and marks entered in error when a move was worked', () => {
    const plan = placementRemovalPlan({ status: 'ACTIVE', occupancyRecords: 1, moveChecklists: 2 });
    expect(plan.mode).toBe('MARK_IN_ERROR');
    expect(plan.blockedBy[0]).toContain('2 move checklists');
  });

  it('never deletes a placement that already ran and ended', () => {
    const plan = placementRemovalPlan({ status: 'MOVED_OUT', occupancyRecords: 1, moveChecklists: 0 });
    expect(plan.mode).toBe('MARK_IN_ERROR');
    expect(plan.blockedBy.some((reason) => reason.includes('placement history'))).toBe(true);
  });

  it('is idempotent once a placement is already marked', () => {
    const plan = placementRemovalPlan({ status: 'ENTERED_IN_ERROR', occupancyRecords: 0, moveChecklists: 0 });
    expect(plan.mode).toBe('MARK_IN_ERROR');
    expect(plan.explanation).toContain('already marked');
  });

  it('tells the dialog which records stay on file, in plain language', () => {
    // The caller words the label (see inspectPlacementDependencies, which pluralises for its count);
    // the plan only drops the records that do not exist and prefixes each remaining count.
    const plan = placementRemovalPlan({
      status: 'ACTIVE',
      occupancyRecords: 1,
      moveChecklists: 0,
      retained: [{ count: 1, label: 'document filed against the service user' }, { count: 3, label: 'tasks' }, { count: 0, label: 'invoices' }]
    });
    expect(plan.retained).toEqual(['1 document filed against the service user', '3 tasks']);
  });
});

describe('support plan review presentation', () => {
  it('flags a review as overdue only once its date has passed', () => {
    expect(isSupportPlanReviewOverdue(new Date(2026, 6, 28), now)).toBe(true);
    expect(isSupportPlanReviewOverdue(new Date(2026, 8, 1), now)).toBe(false);
    expect(isSupportPlanReviewOverdue(null, now)).toBe(false);
  });
});
