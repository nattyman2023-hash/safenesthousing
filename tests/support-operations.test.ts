import { describe, expect, it } from 'vitest';
import { addDays, addMonths, addWorkingDays, countWorkingDays, dayKey, fromDayKey, toLocalDateInput } from '@/lib/dates';
import { contactComplianceRate, contactComplianceState, contactCountsAsSupport, isContactLogNote, requiresContactEscalation, summariseContacts } from '@/lib/contact-tracking';
import { assertSafeWellTransition, canTransitionSafeWellCheck, requiresMaintenanceReferral, safeWellActionAreas, safeWellCompletionRate, safeWellDueState, safeWellOutcome } from '@/lib/safe-well';
import { advanceTaskDueAt, sortTasksForQueue, summariseTaskQueue, taskAutomationKey, taskDueLabel, taskEscalationLevel, taskMatchesOwnerScope, taskQueueBucket } from '@/lib/task-workflow';
import { assertSupportTransition, canTransitionSupportStatus, describeProfileGaps, hasUsableContactRoute, moveInTargetState, normaliseContactFrequency, normaliseSafeWellFrequency, placementDays, placementExitDueAt, preferredChannel, profileGaps, profileGapScore } from '@/lib/support-domain';
import { buildChecklistItems, canCompleteChecklist, checklistBlocking, checklistProgress, checklistStatusFromItems, groupChecklistItems, MOVE_IN_TEMPLATE, nextChecklistItemDue, overdueChecklistItems } from '@/lib/move-checklist';
import { overallRiskLevel, requiresSafeguardingReferral, riskLevelFromScore, riskReviewDueAt, riskReviewState, riskScore, safeguardingTriggerReasons } from '@/lib/risk-domain';
import { buildMaintenanceReference, effectiveMaintenancePriority, maintenanceEscalationRequired, maintenanceSlaHours, maintenanceSlaState, maintenanceTargetFixAt, summariseMaintenance } from '@/lib/operations-domain';
import { appointmentNeedsOutcome, appointmentTiming, appointmentsClash, appointmentsOnDay, findAppointmentClashes, groupAppointmentsByDay, summariseAppointments, type CalendarAppointment } from '@/lib/appointments';
import { concernState, shouldReferConcern, summariseConcerns } from '@/lib/concerns-domain';
import { complaintComplianceState, complaintTimescales, effectiveComplaintDeadlines, nextComplaintStage, summariseComplaints } from '@/lib/complaints-domain';
import { complianceDueLabel, complianceDueState, complianceIntervalMonths, isPolicyLive, missingComplianceTypes, nextComplianceDueAt, nextPolicyReviewDue, policyReviewState, summariseCompliance, summarisePolicies } from '@/lib/compliance-domain';
import { AUTOMATION_CATEGORY_LABELS, filterNewAutomationTasks, planAutomationTasks, planClientAutomation, snapshotFromClientRow, type ClientAutomationSnapshot, type ClientAutomationRow } from '@/lib/task-engine';
import { buildCalendarEntries, buildCalendarWeek, buildDashboardMetrics, buildServiceUserAttention, buildWorkQueue, DASHBOARD_LIST_LIMIT, DASHBOARD_SCOPE_LABELS, groupTasksByOwner, scopeTasks, summariseAttention, summariseCalendarWeek } from '@/lib/dashboard-domain';
import { buildServiceUserTimeline, groupTimelineByDay, summariseTimeline, timelineDayLabel, timelineKindLabel, type TimelineEntryInput } from '@/lib/su-timeline';
import { caseNoteTimelineKind } from '@/lib/client-profile';

describe('date helpers', () => {
  it('skips weekends when adding working days', () => expect(dayKey(addWorkingDays(new Date(2026, 0, 16), 1))).toBe('2026-01-19'));
  it('counts working days between two dates', () => expect(countWorkingDays(new Date(2026, 0, 16), new Date(2026, 0, 20))).toBe(2));
  it('builds day keys in local time rather than UTC', () => expect(dayKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05'));
  it('round-trips a day key back to local midnight', () => expect(fromDayKey('2026-03-09').getTime()).toBe(new Date(2026, 2, 9).getTime()));
  it('clamps to the last day of the target month', () => expect(dayKey(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-28'));
  it('renders date inputs without a UTC shift', () => expect(toLocalDateInput(new Date(2026, 10, 1, 22, 0))).toBe('2026-11-01'));
});

describe('planned contact compliance', () => {
  const now = new Date(2026, 5, 15, 9, 0);
  it('only counts completed, meaningful contact as support', () => {
    expect(contactCountsAsSupport({ completed: true, meaningful: true })).toBe(true);
    expect(contactCountsAsSupport({ completed: false, meaningful: true })).toBe(false);
    expect(contactCountsAsSupport({ completed: true, meaningful: false })).toBe(false);
  });
  it('flags overdue, due-soon, on-track, and never-contacted service users', () => {
    expect(contactComplianceState({ lastContactAt: new Date(2026, 5, 1), frequencyDays: 7, now })).toBe('OVERDUE');
    expect(contactComplianceState({ lastContactAt: new Date(2026, 5, 10), frequencyDays: 7, now })).toBe('DUE_SOON');
    expect(contactComplianceState({ lastContactAt: new Date(2026, 5, 13), frequencyDays: 7, now })).toBe('ON_TRACK');
    expect(contactComplianceState({ lastContactAt: null, frequencyDays: 7, now })).toBe('NOT_STARTED');
  });
  it('counts a missed-contact streak and proposes escalation', () => {
    const summary = summariseContacts([
      { occurredAt: new Date(2026, 5, 14), completed: false, attempted: true, meaningful: false },
      { occurredAt: new Date(2026, 5, 12), completed: false, attempted: true, meaningful: false },
      { occurredAt: new Date(2026, 5, 2), completed: true, attempted: false, meaningful: true, method: 'PHONE', durationMinutes: 20 }
    ], 7, now);
    expect(summary.missedStreak).toBe(2);
    expect(summary.meaningful).toBe(1);
    expect(summary.dueAt?.getTime()).toBe(new Date(2026, 5, 9).getTime());
    expect(requiresContactEscalation(summary)).toBe(true);
  });
  it('measures contact delivery against the planned frequency', () => {
    const notes = [
      { occurredAt: new Date(2026, 5, 10), completed: true, attempted: false, meaningful: true },
      { occurredAt: new Date(2026, 4, 20), completed: true, attempted: false, meaningful: true }
    ];
    expect(contactComplianceRate(notes, 7, 28, now)).toBe(50);
  });
  it('tells a contact log apart from a structured case note', () => {
    expect(isContactLogNote({ method: 'HOME_VISIT' })).toBe(true);
    expect(isContactLogNote({ method: 'OTHER', nextContactDueAt: new Date(2026, 5, 20) })).toBe(true);
    expect(isContactLogNote({ attempted: true, completed: false })).toBe(true);
    expect(isContactLogNote({ method: 'OTHER', attempted: false, completed: true, nextContactDueAt: null })).toBe(false);
    expect(isContactLogNote({ attempted: false, completed: true })).toBe(false);
    expect(isContactLogNote({})).toBe(false);
  });
  it('agrees with the profile timeline on what a contact is', () => {
    const log = { method: 'PHONE', attempted: false, completed: true, nextContactDueAt: null };
    const structured = { method: null, attempted: false, completed: true, nextContactDueAt: null };
    expect(caseNoteTimelineKind(log)).toBe('CONTACT');
    expect(caseNoteTimelineKind(structured)).toBe('CASE_NOTE');
    expect(isContactLogNote(log)).toBe(caseNoteTimelineKind(log) === 'CONTACT');
    expect(isContactLogNote(structured)).toBe(caseNoteTimelineKind(structured) === 'CONTACT');
  });
  it('keeps a structured case note out of the planned-contact clock', () => {
    // A safeguarding note recorded on a person who has never been contacted: counting it would
    // report the planned contact as delivered and move the next-due date past the real one.
    const notes = [
      { occurredAt: new Date(2026, 5, 14), completed: true, attempted: false, meaningful: true, method: null, nextContactDueAt: null },
      { occurredAt: new Date(2026, 5, 2), completed: true, attempted: false, meaningful: true, method: 'HOME_VISIT' }
    ];
    const summary = summariseContacts(notes.filter((note) => isContactLogNote(note)), 7, now);
    expect(summary.lastSupportContactAt?.getTime()).toBe(new Date(2026, 5, 2).getTime());
    expect(summary.state).toBe('OVERDUE');
    expect(contactComplianceState({ lastContactAt: new Date(2026, 5, 14), frequencyDays: 7, now })).toBe('ON_TRACK');
  });
});

describe('Safe & Well checks', () => {
  const now = new Date(2026, 5, 15, 9, 0);
  it('escalates urgent answers and raises actions for property concerns', () => {
    expect(safeWellOutcome({ HEATING: 'OK', GAS: 'OK' })).toBe('SATISFACTORY');
    expect(safeWellOutcome({ HEATING: 'ACTION', GAS: 'OK' })).toBe('ACTIONS_REQUIRED');
    expect(safeWellOutcome({ HEATING: 'OK', GAS: 'URGENT' })).toBe('URGENT_ESCALATION');
    expect(requiresMaintenanceReferral({ HEATING: 'ACTION' })).toBe(true);
    expect(requiresMaintenanceReferral({ WELLBEING: 'ACTION' })).toBe(false);
    expect(safeWellActionAreas({ SMOKE_ALARMS: 'OK', DAMP_MOULD: 'URGENT' }).map((area) => area.key)).toEqual(['DAMP_MOULD']);
  });
  it('derives the next check from the recorded frequency', () => {
    expect(safeWellDueState({ lastCompletedAt: new Date(2026, 4, 1), frequencyDays: 30, now })).toBe('OVERDUE');
    expect(safeWellDueState({ lastCompletedAt: new Date(2026, 4, 23), frequencyDays: 30, now })).toBe('DUE_SOON');
    expect(safeWellDueState({ lastCompletedAt: new Date(2026, 5, 10), frequencyDays: 30, now })).toBe('ON_TRACK');
    expect(safeWellDueState({ lastCompletedAt: null, frequencyDays: 30, now })).toBe('NOT_STARTED');
  });
  it('only allows checks to move through valid statuses', () => {
    expect(canTransitionSafeWellCheck('SCHEDULED', 'COMPLETED')).toBe(true);
    expect(canTransitionSafeWellCheck('COMPLETED', 'SCHEDULED')).toBe(false);
    expect(canTransitionSafeWellCheck('MISSED', 'SCHEDULED')).toBe(true);
    expect(() => assertSafeWellTransition('COMPLETED', 'MISSED')).toThrow();
  });
  it('reports completion against the required frequency', () => {
    const checks = [{ status: 'COMPLETED', completedAt: new Date(2026, 4, 20) }];
    expect(safeWellCompletionRate(checks, 30, 90, now)).toBe(33);
  });

describe('task workflow queue', () => {
  const now = new Date(2026, 5, 17, 10, 0);
  it('buckets work by urgency relative to the working week', () => {
    expect(taskQueueBucket({ dueAt: new Date(2026, 5, 16, 12, 0), status: 'OPEN' }, now)).toBe('OVERDUE');
    expect(taskQueueBucket({ dueAt: new Date(2026, 5, 17, 8, 0), status: 'OPEN' }, now)).toBe('DUE_TODAY');
    expect(taskQueueBucket({ dueAt: new Date(2026, 5, 19, 8, 0), status: 'OPEN' }, now)).toBe('DUE_THIS_WEEK');
    expect(taskQueueBucket({ dueAt: new Date(2026, 5, 22, 8, 0), status: 'OPEN' }, now)).toBe('LATER');
    expect(taskQueueBucket({ dueAt: null, status: 'OPEN' }, now)).toBe('NO_DATE');
    expect(taskQueueBucket({ dueAt: new Date(2020, 0, 1), status: 'CANCELLED' }, now)).toBe('CLOSED');
  });
  it('summarises the queue and counts unassigned open work', () => {
    const summary = summariseTaskQueue([
      { dueAt: new Date(2026, 5, 16), status: 'OPEN', assignedToId: 'u1' },
      { dueAt: new Date(2026, 5, 17), status: 'BLOCKED', assignedToId: null },
      { dueAt: null, status: 'DONE', assignedToId: null }
    ], now);
    expect(summary.total).toBe(3);
    expect(summary.overdue).toBe(1);
    expect(summary.dueToday).toBe(1);
    expect(summary.blocked).toBe(1);
    expect(summary.unassigned).toBe(1);
    expect(summary.closed).toBe(1);
  });
  it('sorts overdue work ahead of later work regardless of priority', () => {
    const sorted = sortTasksForQueue([
      { id: 'later', dueAt: new Date(2026, 5, 25), status: 'OPEN', priority: 'URGENT' },
      { id: 'overdue', dueAt: new Date(2026, 5, 15), status: 'OPEN', priority: 'LOW' }
    ], now);
    expect(sorted.map((task) => task.id)).toEqual(['overdue', 'later']);
  });
  it('escalates work that is three or more days late', () => {
    expect(taskEscalationLevel({ status: 'OPEN', dueAt: new Date(2026, 5, 16) }, now)).toBe('OVERDUE');
    expect(taskEscalationLevel({ status: 'OPEN', dueAt: new Date(2026, 5, 10) }, now)).toBe('BREACHED');
    expect(taskEscalationLevel({ status: 'DONE', dueAt: new Date(2026, 5, 1) }, now)).toBe('NONE');
  });
  it('scopes work to the viewer, their team, or everything', () => {
    expect(taskMatchesOwnerScope({ assignedToId: 'u1' }, 'MINE', 'u1')).toBe(true);
    expect(taskMatchesOwnerScope({ assignedToId: 'u2' }, 'MINE', 'u1')).toBe(false);
    expect(taskMatchesOwnerScope({ assignedToId: 'u3' }, 'TEAM', 'u1', ['u3'])).toBe(true);
    expect(taskMatchesOwnerScope({ assignedToId: null }, 'ALL', 'u1')).toBe(true);
  });
  it('never duplicates generated work for the same scope and day', () => {
    expect(taskAutomationKey({ category: 'CONTACT_DUE', scopeId: 'su1', dueAt: new Date(2026, 5, 17, 9, 0) }))
      .toBe(taskAutomationKey({ category: 'CONTACT_DUE', scopeId: 'su1', dueAt: new Date(2026, 5, 17, 21, 0) }));
    expect(taskAutomationKey({ category: 'CONTACT_DUE', scopeId: 'su1', dueAt: new Date(2026, 5, 17) }))
      .not.toBe(taskAutomationKey({ category: 'SAFE_WELL_DUE', scopeId: 'su1', dueAt: new Date(2026, 5, 17) }));
  });
  it('advances recurring work and refuses to schedule an interval without a length', () => {
    expect(dayKey(advanceTaskDueAt(new Date(2026, 5, 17), 'WEEKLY') as Date)).toBe('2026-06-24');
    expect(dayKey(advanceTaskDueAt(new Date(2026, 5, 17), 'MONTHLY') as Date)).toBe('2026-07-17');
    expect(advanceTaskDueAt(new Date(2026, 5, 17), 'INTERVAL_DAYS', null)).toBeNull();
    expect(advanceTaskDueAt(new Date(2026, 5, 17), 'NONE')).toBeNull();
  });
  it('labels due dates in plain language', () => {
    expect(taskDueLabel({ status: 'OPEN', dueAt: new Date(2026, 5, 17, 23, 0) }, now)).toBe('Due today');
    expect(taskDueLabel({ status: 'OPEN', dueAt: new Date(2026, 5, 15) }, now)).toBe('2 days overdue');
    expect(taskDueLabel({ status: 'OPEN', dueAt: null }, now)).toBe('No due date');
  });
});


describe('service user support profile', () => {
  const now = new Date(2026, 5, 17, 10, 0);
  it('blocks illegal support status jumps', () => {
    expect(canTransitionSupportStatus('REFERRAL', 'SUPPORT_ACTIVE')).toBe(false);
    expect(canTransitionSupportStatus('SUPPORT_ACTIVE', 'MOVE_ON_SUPPORT')).toBe(true);
    expect(canTransitionSupportStatus('CLOSED', 'SUPPORT_ACTIVE')).toBe(true);
    expect(() => assertSupportTransition('REFERRAL', 'CLOSED')).toThrow();
  });
  it('clamps staff-entered contact frequencies into a workable band', () => {
    expect(normaliseContactFrequency(500)).toBe(90);
    expect(normaliseContactFrequency(0)).toBe(7);
    expect(normaliseSafeWellFrequency(3)).toBe(7);
    expect(normaliseSafeWellFrequency(400)).toBe(365);
  });
  it('picks a channel the person can actually use', () => {
    expect(preferredChannel({ phone: '01234 000000', communicationNeeds: 'Prefers BSL' })).toBe('TEXT');
    expect(preferredChannel({ email: 'person@example.test', communicationNeeds: 'Deaf, uses sign language' })).toBe('EMAIL');
    expect(preferredChannel({ phone: '01234 000000', communicationNeeds: 'Wants everything by email' })).toBe('IN_PERSON');
    expect(preferredChannel({})).toBe('IN_PERSON');
    expect(hasUsableContactRoute({ address: 'Fictional House, Example Street' })).toBe(true);
    expect(hasUsableContactRoute({ phone: '   ' })).toBe(false);
  });
  it('lists profile gaps for open service users only', () => {
    const gaps = profileGaps({
      status: 'SUPPORT_ACTIVE',
      keyWorkerId: null,
      supportWorkerId: null,
      phone: null,
      email: null,
      address: null,
      moveInTargetDate: null,
      dateOfBirth: null,
      hasPenPortrait: false,
      hasRiskAssessment: false
    });
    expect(gaps).toHaveLength(7);
    expect(gaps).not.toContain('NO_MOVE_IN_DATE');
    expect(profileGapScore(gaps)).toBe(15);
    expect(describeProfileGaps(gaps)).toContain('No key worker allocated');
    expect(profileGaps({ status: 'CLOSED', hasPenPortrait: false, hasRiskAssessment: false })).toEqual([]);
  });
  it('tracks move-in readiness and length of stay', () => {
    expect(moveInTargetState(new Date(2026, 5, 20), now)).toBe('DUE_SOON');
    expect(moveInTargetState(new Date(2026, 5, 1), now)).toBe('OVERDUE');
    expect(moveInTargetState(null, now)).toBe('NOT_SET');
    expect(placementDays(new Date(2026, 5, 1), null, now)).toBe(16);
    expect(dayKey(placementExitDueAt(new Date(2026, 5, 1), 30) as Date)).toBe('2026-07-01');

describe('move checklists', () => {
  it('expands the move-in template against the target date', () => {
    const items = buildChecklistItems('MOVE_IN', new Date(2026, 5, 20));
    expect(items).toHaveLength(15);
    expect(items[0].sortOrder).toBe(1);
    expect(dayKey(items[0].dueAt as Date)).toBe('2026-05-30');
    expect(items.every((item) => item.status === 'PENDING')).toBe(true);
  });
  it('derives progress and blocks completion while required steps are open', () => {
    const items = MOVE_IN_TEMPLATE.map((template) => ({
      label: template.label,
      category: template.category,
      required: template.required,
      status: template.required ? 'DONE' : 'PENDING',
      dueAt: new Date(2026, 5, 20)
    }));
    const progress = checklistProgress(items);
    expect(progress.requiredIncomplete).toHaveLength(0);
    expect(canCompleteChecklist(items)).toBe(true);
    expect(progress.status).toBe('IN_PROGRESS');
    const blocked = items.map((item, index) => (index === 0 ? { ...item, status: 'BLOCKED' } : item));
    expect(checklistProgress(blocked).blocked).toBe(1);
    expect(checklistBlocking(blocked)[0]).toContain('(blocked)');
    expect(checklistStatusFromItems(items.map((item) => ({ ...item, status: 'DONE' })))).toBe('COMPLETED');
    expect(checklistStatusFromItems([])).toBe('NOT_STARTED');
  });
  it('flags overdue checklist steps and groups them for review', () => {
    const items = buildChecklistItems('MOVE_OUT', new Date(2026, 5, 10));
    const now = new Date(2026, 5, 20);
    expect(overdueChecklistItems(items, now).length).toBeGreaterThan(0);
    expect(nextChecklistItemDue(items, now)?.dueAt?.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(groupChecklistItems(items)[0].category).toBe('TENANCY');
  });
});

describe('risk assessment scoring', () => {
  it('bands the 1-25 scale into levels', () => {
    expect(riskScore(2, 2)).toBe(4);
    expect(riskLevelFromScore(4)).toBe('LOW');
    expect(riskLevelFromScore(9)).toBe('MEDIUM');
    expect(riskLevelFromScore(16)).toBe('HIGH');
    expect(riskLevelFromScore(25)).toBe('CRITICAL');
    expect(riskScore(9, 9)).toBe(25);
  });
  it('drives the overall level from the highest open factor', () => {
    expect(overallRiskLevel([
      { category: 'TENANCY', score: 4 },
      { category: 'HEALTH', score: 12 }
    ])).toBe('HIGH');
    expect(overallRiskLevel([{ category: 'TENANCY', score: 20, status: 'CLOSED' }])).toBe('LOW');
    expect(overallRiskLevel([])).toBe('LOW');
  });
  it('expects a safeguarding referral for critical factors and high trigger categories', () => {
    expect(requiresSafeguardingReferral([{ category: 'SAFEGUARDING', score: 18 }])).toBe(true);
    expect(safeguardingTriggerReasons([{ category: 'SAFEGUARDING', score: 18 }]).length).toBe(1);
    expect(requiresSafeguardingReferral([{ category: 'SAFEGUARDING', score: 6 }])).toBe(false);
    expect(requiresSafeguardingReferral([{ category: 'TENANCY', score: 20 }])).toBe(true);
  });
  it('sets the review cadence from the risk level', () => {
    expect(dayKey(riskReviewDueAt(new Date(2026, 0, 1), 'CRITICAL'))).toBe('2026-01-31');
    expect(dayKey(riskReviewDueAt(new Date(2026, 0, 1), 'LOW'))).toBe('2027-01-01');
    expect(riskReviewState(new Date(2026, 0, 1), new Date(2026, 5, 1))).toBe('OVERDUE');
    expect(riskReviewState(null)).toBe('CURRENT');
  });
});

    expect(placementExitDueAt(null, 30)).toBeNull();
  });
});


describe('maintenance SLA', () => {
  it('shortens the window for safety-critical categories', () => {
    expect(maintenanceSlaHours('LOW', 'GENERAL')).toBe(168);
    expect(maintenanceSlaHours('HIGH', 'GENERAL')).toBe(24);
    expect(maintenanceSlaHours('LOW', 'GAS')).toBe(4);
    expect(effectiveMaintenancePriority('LOW', 'GENERAL', true)).toBe('URGENT');
  });
  it('targets the fix from the reported time', () => {
    const reportedAt = new Date(2026, 5, 17, 9, 0);
    expect(maintenanceTargetFixAt(reportedAt, 'HIGH', 'PLUMBING').getTime()).toBe(reportedAt.getTime() + 24 * 3_600_000);
  });
  it('flags breached, due-soon, and closed jobs', () => {
    const now = new Date(2026, 5, 17, 12, 0);
    expect(maintenanceSlaState({ status: 'IN_PROGRESS', reportedAt: new Date(2026, 5, 12), priority: 'MEDIUM', category: 'GENERAL' }, now)).toBe('BREACHED');
    expect(maintenanceSlaState({ status: 'IN_PROGRESS', reportedAt: new Date(2026, 5, 17, 9, 0), priority: 'HIGH', category: 'PLUMBING' }, now)).toBe('DUE_SOON');
    expect(maintenanceSlaState({ status: 'COMPLETED', reportedAt: new Date(2026, 5, 1), priority: 'LOW', category: 'GENERAL' }, now)).toBe('CLOSED');
  });
  it('escalates breached jobs but not closed ones', () => {
    const now = new Date(2026, 5, 17, 12, 0);
    expect(maintenanceEscalationRequired({ status: 'IN_PROGRESS', reportedAt: new Date(2026, 5, 1), priority: 'MEDIUM', category: 'GENERAL' }, now)).toBe(true);
    expect(maintenanceEscalationRequired({ status: 'COMPLETED', reportedAt: new Date(2026, 4, 1), priority: 'LOW', category: 'GENERAL' }, now)).toBe(false);
  });
  it('summarises the open maintenance workload', () => {
    const summary = summariseMaintenance([
      { status: 'IN_PROGRESS', reportedAt: addDays(new Date(), -3), priority: 'MEDIUM', category: 'PLUMBING' },
      { status: 'NEW', reportedAt: addDays(new Date(), -1), priority: 'LOW', category: 'GENERAL', safetyRisk: true },
      { status: 'COMPLETED', reportedAt: addDays(new Date(), -9), completedAt: addDays(new Date(), -8), priority: 'HIGH', category: 'HEATING' }
    ]);
    expect(summary.total).toBe(3);
    expect(summary.open).toBe(2);
    expect(summary.safetyRisks).toBe(1);
    expect(summary.averageFixDays).toBe(1);
    expect(buildMaintenanceReference(7, new Date(2026, 5, 17))).toBe('MT-2026-0007');
  });
});

describe('appointments and calendar', () => {
  const base = new Date(2026, 5, 17, 10, 0);
  const appointment = (overrides: Partial<CalendarAppointment> & { id: string; startsAt: Date }) => ({
    title: 'Support visit',
    status: 'SCHEDULED',
    ownerId: 'u1',
    clientId: 'su1',
    ...overrides
  });
  it('detects clashes that share a worker, service user, or property', () => {
    const clashes = findAppointmentClashes([
      appointment({ id: 'a', startsAt: base }),
      appointment({ id: 'b', startsAt: new Date(2026, 5, 17, 10, 30), ownerId: 'u2', clientId: 'su2' }),
      appointment({ id: 'c', startsAt: new Date(2026, 5, 17, 10, 30), ownerId: 'u3', clientId: 'su2', propertyId: 'p1' }),
      appointment({ id: 'd', startsAt: new Date(2026, 5, 17, 14, 0), ownerId: 'u4', clientId: 'su4' })
    ]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].reason).toBe('SERVICE_USER');
  });
  it('does not clash when appointments are adjacent or cancelled', () => {
    expect(appointmentsClash(
      appointment({ id: 'a', startsAt: new Date(2026, 5, 17, 10, 0) }),
      appointment({ id: 'b', startsAt: new Date(2026, 5, 17, 11, 0) })
    )).toBe(false);
    expect(findAppointmentClashes([
      appointment({ id: 'a', startsAt: base }),
      appointment({ id: 'b', startsAt: base, status: 'CANCELLED' })
    ])).toHaveLength(0);
  });
  it('prompts for an outcome once an appointment has ended', () => {
    expect(appointmentNeedsOutcome({ status: 'SCHEDULED', startsAt: new Date(2026, 5, 16, 8, 0), endsAt: new Date(2026, 5, 16, 9, 0) }, base)).toBe(true);
    expect(appointmentNeedsOutcome({ status: 'COMPLETED', startsAt: new Date(2026, 5, 16, 8, 0), completedAt: base }, base)).toBe(false);
    expect(appointmentTiming({ status: 'CONFIRMED', startsAt: new Date(2026, 5, 17, 10, 30) }, base)).toBe('STARTING_SOON');
  });
  it('groups the calendar into days', () => {
    const days = groupAppointmentsByDay([appointment({ id: 'a', startsAt: new Date(2026, 5, 18, 9, 0) })], base, 7);
    expect(days).toHaveLength(7);
    expect(days[1].appointments).toHaveLength(1);
    expect(appointmentsOnDay([appointment({ id: 'a', startsAt: new Date(2026, 5, 18, 9, 0) })], new Date(2026, 5, 18))).toHaveLength(1);
  });
});


describe('concerns and complaints', () => {
  const now = new Date(2026, 5, 17, 12, 0);
  it('tracks the concern response window', () => {
    expect(concernState({ status: 'OPEN', raisedAt: new Date(2026, 5, 15, 8, 0), severity: 'HIGH' }, now)).toBe('OVERDUE');
    expect(concernState({ status: 'OPEN', raisedAt: new Date(2026, 5, 17, 12, 0), severity: 'HIGH' }, now)).toBe('RESPONSE_DUE_SOON');
    expect(concernState({ status: 'OPEN', raisedAt: new Date(2026, 5, 17, 12, 0), severity: 'MEDIUM' }, now)).toBe('AWAITING_RESPONSE');
    expect(concernState({ status: 'RESOLVED', raisedAt: new Date(2026, 5, 1), severity: 'CRITICAL' }, now)).toBe('CLOSED');
  });
  it('requires a referral decision for safeguarding and exploitation concerns', () => {
    expect(shouldReferConcern({ category: 'TENANCY', severity: 'CRITICAL' })).toBe(true);
    expect(shouldReferConcern({ category: 'SAFEGUARDING', severity: 'MEDIUM' })).toBe(true);
    expect(shouldReferConcern({ category: 'SAFEGUARDING', severity: 'LOW' })).toBe(false);
    expect(shouldReferConcern({ category: 'NOISE', severity: 'HIGH' })).toBe(false);
  });
  it('summarises the open concern register', () => {
    const summary = summariseConcerns([
      { status: 'OPEN', raisedAt: new Date(2026, 5, 15, 8, 0), severity: 'HIGH', category: 'SAFEGUARDING' },
      { status: 'IN_PROGRESS', raisedAt: new Date(2026, 5, 16), severity: 'MEDIUM', category: 'TENANCY' },
      { status: 'RESOLVED', raisedAt: new Date(2026, 5, 1), resolvedAt: new Date(2026, 5, 6), severity: 'LOW', category: 'NOISE' }
    ], now);
    expect(summary.total).toBe(3);
    expect(summary.open).toBe(2);
    expect(summary.overdue).toBe(1);
    expect(summary.referralsRequired).toBe(1);
    expect(summary.averageResolutionDays).toBe(5);
    expect(summary.bySeverity.MEDIUM).toBe(1);
  });
  it('counts complaint timescales in working days', () => {
    const timescales = complaintTimescales(new Date(2026, 5, 12), 'STAGE_1');
    expect(dayKey(timescales.acknowledgeBy)).toBe('2026-06-19');
    expect(dayKey(timescales.responseDueAt)).toBe('2026-06-26');
    expect(timescales.responseWorkingDays).toBe(10);
    expect(effectiveComplaintDeadlines({ receivedAt: new Date(2026, 5, 12), stage: 'STAGE_1', dueAt: new Date(2026, 6, 10) }).responseDueAt.getTime())
      .toBe(new Date(2026, 6, 10).getTime());
    expect(nextComplaintStage('STAGE_1')).toBe('STAGE_2');
    expect(nextComplaintStage('OMBUDSMAN')).toBe('OMBUDSMAN');
  });
  it('polices the complaint response deadlines', () => {
    const receivedAt = new Date(2026, 5, 12);
    expect(complaintComplianceState({ status: 'OPEN', receivedAt, stage: 'STAGE_1' }, new Date(2026, 5, 22))).toBe('ACKNOWLEDGEMENT_OVERDUE');
    expect(complaintComplianceState({ status: 'OPEN', receivedAt, stage: 'STAGE_1', acknowledgedAt: new Date(2026, 5, 15) }, new Date(2026, 5, 29))).toBe('RESPONSE_OVERDUE');
    expect(complaintComplianceState({ status: 'OPEN', receivedAt, stage: 'STAGE_1', acknowledgedAt: new Date(2026, 5, 15) }, new Date(2026, 5, 24))).toBe('RESPONSE_DUE_SOON');
    expect(complaintComplianceState({ status: 'CLOSED', receivedAt, stage: 'STAGE_1' }, new Date(2026, 5, 24))).toBe('CLOSED');
  });
  it('summarises the complaint register and outstanding learning', () => {
    const summary = summariseComplaints([
      { status: 'OPEN', receivedAt: new Date(2026, 5, 1), stage: 'STAGE_1', category: 'SAFETY' },
      { status: 'IN_PROGRESS', receivedAt: new Date(2026, 5, 1), stage: 'STAGE_2', category: 'SAFETY', acknowledgedAt: new Date(2026, 5, 3), dueAt: new Date(2026, 5, 10) },
      { status: 'IN_PROGRESS', receivedAt: new Date(2026, 5, 1), stage: 'STAGE_1', category: 'SAFETY', acknowledgedAt: new Date(2026, 5, 2), respondedAt: new Date(2026, 5, 5), outcome: 'UPHELD' }
    ], new Date(2026, 5, 17));
    expect(summary.total).toBe(3);
    expect(summary.open).toBe(3);
    expect(summary.acknowledgementOverdue).toBe(1);
    expect(summary.responseOverdue).toBe(1);
    expect(summary.upheld).toBe(1);
    expect(summary.averageResponseDays).toBe(4);
    expect(summary.byStage.STAGE_1).toBe(2);
    expect(summary.byCategory.SAFETY).toBe(3);
    expect(summary.learningOutstanding).toBe(1);
  });
});


describe('property compliance and policy library', () => {
  const now = new Date(2026, 5, 17, 12, 0);
  it('rolls certificates onto their own renewal cycle', () => {
    expect(dayKey(nextComplianceDueAt('GAS_SAFETY', new Date(2025, 5, 30)))).toBe('2026-06-30');
    expect(dayKey(nextComplianceDueAt('ELECTRICAL_EICR', new Date(2022, 0, 10)))).toBe('2027-01-10');
    expect(complianceIntervalMonths('LIFT')).toBe(6);
  });
  it('flags overdue, due-soon, exempt, and unrecorded certificates', () => {
    expect(complianceDueState({ status: 'COMPLETED', complianceType: 'GAS_SAFETY', nextDueAt: new Date(2026, 5, 1) }, now)).toBe('OVERDUE');
    expect(complianceDueState({ status: 'COMPLETED', complianceType: 'GAS_SAFETY', nextDueAt: new Date(2026, 6, 5) }, now)).toBe('DUE_SOON');
    expect(complianceDueState({ status: 'EXEMPT', complianceType: 'LIFT' }, now)).toBe('EXEMPT');
    expect(complianceDueState({ status: 'DUE', complianceType: 'GAS_SAFETY' }, now)).toBe('NOT_STARTED');
    expect(complianceDueLabel({ status: 'COMPLETED', complianceType: 'GAS_SAFETY', lastCheckedAt: new Date(2025, 0, 1) }, now)).toContain('overdue');
  });
  it('lists the compliance gaps an audit would find', () => {
    expect(missingComplianceTypes([])).toHaveLength(5);
    expect(missingComplianceTypes([{ complianceType: 'GAS_SAFETY', status: 'COMPLETED' }])).not.toContain('Gas safety certificate');
    const summary = summariseCompliance([
      { complianceType: 'GAS_SAFETY', status: 'COMPLETED', nextDueAt: new Date(2026, 5, 1) },
      { complianceType: 'FIRE_ALARM', status: 'DUE', nextDueAt: new Date(2026, 6, 5) },
      { complianceType: 'LIFT', status: 'DUE' }
    ], now);
    expect(summary.total).toBe(3);
    expect(summary.overdue).toBe(1);
    expect(summary.dueSoon).toBe(1);
    expect(summary.missing).toBe(1);
    expect(summary.complianceRate).toBe(33);
    expect(summary.overdueTypes).toContain('Gas safety certificate');
  });
  it('tracks policy review dates and status', () => {
    expect(policyReviewState({ status: 'ACTIVE', effectiveFrom: new Date(2024, 0, 1) }, now)).toBe('OVERDUE');
    expect(isPolicyLive({ status: 'ACTIVE', effectiveFrom: new Date(2024, 0, 1) }, now)).toBe(false);
    expect(policyReviewState({ status: 'DRAFT', effectiveFrom: new Date(2026, 0, 1) }, now)).toBe('DRAFT');
    expect(policyReviewState({ status: 'ACTIVE' }, now)).toBe('NOT_SET');
    expect(dayKey(nextPolicyReviewDue(new Date(2026, 0, 1)))).toBe('2027-01-01');
  });
  it('summarises the policy library for the compliance report', () => {
    const summary = summarisePolicies([
      { status: 'ACTIVE', category: 'POLICY', effectiveFrom: new Date(2025, 11, 1), requiresRead: true },
      { status: 'ACTIVE', category: 'PROCEDURE', effectiveFrom: new Date(2024, 0, 1) },
      { status: 'DRAFT', category: 'GUIDANCE' }
    ], now);
    expect(summary.total).toBe(3);
    expect(summary.active).toBe(2);
    expect(summary.drafts).toBe(1);
    expect(summary.overdue).toBe(1);
    expect(summary.requiresRead).toBe(1);
    expect(summary.byCategory.PROCEDURE).toBe(1);
  });
});


describe('task automation engine', () => {
  const now = new Date(2026, 5, 17, 12, 0);

  function clientSnapshot(overrides: Partial<ClientAutomationSnapshot> = {}): ClientAutomationSnapshot {
    return {
      clientId: 'client-1',
      clientName: 'Amelia Morgan',
      restricted: false,
      assignedToId: 'user-1',
      contactFrequencyDays: 7,
      safeWellFrequencyDays: 30,
      lastSupportContactAt: new Date(2026, 5, 16),
      lastSafeWellCompletedAt: new Date(2026, 5, 15),
      riskLevel: 'Medium',
      riskAssessment: null,
      supportPlan: null,
      penPortrait: null,
      ...overrides
    };
  }

  it('raises no work when contact, checks, and reviews are all on track', () => {
    expect(planClientAutomation(clientSnapshot(), now)).toEqual([]);
  });

  it('raises the planned contact, check, and review work that policy requires', () => {
    const drafts = planClientAutomation(clientSnapshot({
      riskLevel: 'High',
      lastSupportContactAt: new Date(2026, 5, 1),
      lastSafeWellCompletedAt: new Date(2026, 4, 1),
      riskAssessment: { id: 'risk-1', assessmentType: 'SAFEGUARDING', level: 'HIGH', status: 'ACTIVE', assessedAt: new Date(2026, 0, 1), reviewDueAt: null },
      supportPlan: { id: 'plan-1', reviewDate: new Date(2026, 5, 5) },
      penPortrait: { id: 'portrait-1', status: 'COMPLETE', completedAt: new Date(2025, 5, 20), reviewDueAt: new Date(2026, 5, 20) }
    }), now);

    expect(drafts.map((item) => item.category)).toEqual(['RISK_REVIEW', 'SAFE_WELL_DUE', 'SUPPORT_PLAN_REVIEW', 'CONTACT_DUE', 'PEN_PORTRAIT']);
    const [risk, safeWell, plan, contact, portrait] = drafts;
    expect(risk.automationKey).toBe('RISK_REVIEW:client-1:2026-04-01');
    expect(risk.relatedType).toBe('RISK_ASSESSMENT');
    expect(risk.relatedId).toBe('risk-1');
    expect(risk.priority).toBe('URGENT');
    expect(safeWell.automationKey).toBe('SAFE_WELL_DUE:client-1:2026-05-31');
    expect(safeWell.priority).toBe('URGENT');
    expect(plan.automationKey).toBe('SUPPORT_PLAN_REVIEW:client-1:2026-06-05');
    expect(plan.relatedId).toBe('plan-1');
    expect(contact.automationKey).toBe('CONTACT_DUE:client-1:2026-06-08');
    expect(contact.title).toContain('Amelia Morgan');
    expect(contact.description).toContain('16 days ago');
    expect(portrait.priority).toBe('MEDIUM');
    expect(portrait.relatedType).toBe('PEN_PORTRAIT');
    expect(drafts.every((item) => item.source === 'AUTOMATION' && item.department === 'SUPPORT' && item.assignedToId === 'user-1')).toBe(true);
  });

  it('asks for the first contact and first check when nothing has been recorded yet', () => {
    const drafts = planClientAutomation(clientSnapshot({ lastSupportContactAt: null, lastSafeWellCompletedAt: null, assignedToId: null }), now);
    expect(drafts.map((item) => item.category)).toEqual(['CONTACT_DUE', 'SAFE_WELL_DUE']);
    expect(drafts.every((item) => item.priority === 'HIGH' && item.assignedToId === null)).toBe(true);
    expect(dayKey(drafts[0].dueAt)).toBe('2026-06-18');
    expect(drafts[0].description).toContain('first planned contact');
  });

  it('keeps the person off restricted work and flags overdue work as overdue', () => {
    const [draft] = planClientAutomation(clientSnapshot({ restricted: true, riskLevel: 'CRITICAL', lastSupportContactAt: new Date(2026, 5, 1) }), now);
    expect(draft.title).not.toContain('Amelia Morgan');
    expect(draft.title).toContain('restricted service user');
    expect(draft.priority).toBe('URGENT');
    expect(draft.description).toContain('already overdue');
  });

  it('plans the whole caseload in due-date order', () => {
    const drafts = planAutomationTasks([
      clientSnapshot({ clientId: 'client-a', lastSupportContactAt: new Date(2026, 5, 12) }),
      clientSnapshot({ clientId: 'client-b', lastSupportContactAt: new Date(2026, 5, 1) })
    ], now);
    expect(drafts.map((item) => item.clientId)).toEqual(['client-b', 'client-a']);
    expect(drafts[0].dueAt.getTime()).toBeLessThanOrEqual(drafts[1].dueAt.getTime());
  });

  it('bases the contact clock on the newest contact-log note, not a structured note', () => {
    const row: ClientAutomationRow = {
      id: 'client-1',
      displayName: 'Amelia Morgan',
      restricted: false,
      keyWorkerId: 'user-1',
      supportWorkerId: null,
      contactFrequencyDays: 7,
      safeWellFrequencyDays: 30,
      riskLevel: 'Medium',
      caseNotes: [
        { occurredAt: new Date(2026, 5, 14), method: null, attempted: false, nextContactDueAt: null },
        { occurredAt: new Date(2026, 5, 2), method: 'HOME_VISIT', attempted: false, nextContactDueAt: new Date(2026, 5, 9) }
      ],
      safeWellChecks: [],
      riskAssessments: [],
      supportPlans: [],
      penPortrait: null
    };
    // The structured note is newer, but only the home visit was ever a contact. Reading the newest
    // note whatever it was found this person on track and raised no planned-contact work at all.
    const snapshot = snapshotFromClientRow(row);
    expect(snapshot.lastSupportContactAt?.getTime()).toBe(new Date(2026, 5, 2).getTime());
    const contact = planClientAutomation(snapshot, now).find((item) => item.category === 'CONTACT_DUE');
    expect(contact?.automationKey).toBe('CONTACT_DUE:client-1:2026-06-09');
    expect(contact?.description).toContain('15 days ago');
  });

  it('never tracks the same work twice', () => {
    const drafts = planClientAutomation(clientSnapshot({ lastSupportContactAt: new Date(2026, 5, 1), lastSafeWellCompletedAt: new Date(2026, 4, 1) }), now);
    expect(drafts).toHaveLength(2);
    const { fresh, existing } = filterNewAutomationTasks(drafts, [
      { category: 'CONTACT_DUE', clientId: 'client-1', status: 'OPEN', automationKey: 'CONTACT_DUE:client-1:2026-06-08' },
      { category: 'CONTACT_DUE', clientId: 'client-1', status: 'DONE', automationKey: null }
    ]);
    expect(existing.map((item) => item.category)).toEqual(['CONTACT_DUE']);
    expect(fresh.map((item) => item.category)).toEqual(['SAFE_WELL_DUE']);
  });

  it('treats an open task in the same scope as already-tracked work', () => {
    const drafts = planClientAutomation(clientSnapshot({ lastSupportContactAt: new Date(2026, 5, 1), lastSafeWellCompletedAt: new Date(2026, 4, 1) }), now);
    const { fresh, existing } = filterNewAutomationTasks(drafts, [
      { category: 'SAFE_WELL_DUE', clientId: 'client-1', status: 'IN_PROGRESS', automationKey: null },
      { category: 'CONTACT_DUE', clientId: 'client-1', status: 'CANCELLED', automationKey: null }
    ]);
    expect(existing.map((item) => item.category)).toEqual(['SAFE_WELL_DUE']);
    expect(fresh.map((item) => item.category)).toEqual(['CONTACT_DUE']);
  });
});
});


describe('dashboard work queue', () => {
  const now = new Date(2026, 5, 15, 9, 0);
  const tasks = [
    { id: 't1', title: 'Overdue contact', status: 'OPEN', priority: 'HIGH', dueAt: new Date(2026, 5, 10), assignedToId: 'u1', department: 'SUPPORT', category: 'CONTACT', clientId: 'c1' },
    { id: 't2', title: 'Visit note', status: 'IN_PROGRESS', priority: 'MEDIUM', dueAt: new Date(2026, 5, 15, 17, 0), assignedToId: 'u1', department: 'SUPPORT', category: 'APPOINTMENT', clientId: 'c1' },
    { id: 't3', title: 'Fire door check', status: 'BLOCKED', priority: 'HIGH', dueAt: new Date(2026, 5, 17), assignedToId: null, department: 'MAINTENANCE', category: 'SAFETY', clientId: null },
    { id: 't4', title: 'Support plan review', status: 'OPEN', priority: 'LOW', dueAt: new Date(2026, 6, 20), assignedToId: 'u2', department: 'SUPPORT', category: 'PLAN', clientId: 'c2' },
    { id: 't5', title: 'Closed contact', status: 'DONE', priority: 'LOW', dueAt: new Date(2026, 5, 1), assignedToId: 'u1', department: 'SUPPORT', category: 'CONTACT', clientId: 'c1' },
    { id: 't6', title: 'Undated admin', status: 'OPEN', priority: 'MEDIUM', dueAt: null, assignedToId: null, department: 'ADMIN', category: 'OTHER', clientId: null }
  ];

  it('scopes the queue to my work, my team, or everything', () => {
    expect(scopeTasks(tasks, { scope: 'MINE', viewerId: 'u1' }).map((task) => task.id)).toEqual(['t1', 't2', 't5']);
    expect(scopeTasks(tasks, { scope: 'TEAM', viewerId: 'u1', teamMemberIds: ['u2'] }).map((task) => task.id)).toEqual(['t1', 't2', 't4', 't5']);
    expect(scopeTasks(tasks, { scope: 'ALL', viewerId: 'u1' })).toHaveLength(6);
  });

  it('labels the three queue scopes the same way everywhere', () => {
    expect(DASHBOARD_SCOPE_LABELS).toEqual({ MINE: 'My work', TEAM: 'My team', ALL: 'All work' });
  });

  it('summarises the queue and orders open work by urgency', () => {
    const board = buildWorkQueue(tasks, { scope: 'ALL', viewerId: 'u1', now });
    expect(board.summary).toMatchObject({ total: 6, overdue: 1, dueToday: 1, dueThisWeek: 1, later: 1, noDate: 1, closed: 1, blocked: 1, unassigned: 2 });
    expect(board.open.map((task) => task.id)).toEqual(['t1', 't2', 't3', 't4', 't6']);
    expect(board.overdue.map((task) => task.id)).toEqual(['t1']);
    expect(board.breached.map((task) => task.id)).toEqual(['t1']);
    expect(board.unassigned.map((task) => task.id)).toEqual(['t3', 't6']);
    expect(board.byDepartment).toEqual([
      { key: 'SUPPORT', count: 3 },
      { key: 'ADMIN', count: 1 },
      { key: 'MAINTENANCE', count: 1 }
    ]);
    expect(board.byCategory).toEqual([
      { key: 'APPOINTMENT', count: 1 },
      { key: 'CONTACT', count: 1 },
      { key: 'OTHER', count: 1 },
      { key: 'PLAN', count: 1 },
      { key: 'SAFETY', count: 1 }
    ]);
  });

  it('caps the attention lists but never the open list', () => {
    const many = Array.from({ length: DASHBOARD_LIST_LIMIT + 3 }, (_unused, index) => ({
      ...tasks[0],
      id: `overdue-${index}`,
      title: `Overdue ${index}`,
      dueAt: new Date(2026, 5, 1)
    }));
    const board = buildWorkQueue(many, { scope: 'ALL', viewerId: 'u1', now });
    expect(board.open).toHaveLength(DASHBOARD_LIST_LIMIT + 3);
    expect(board.overdue).toHaveLength(DASHBOARD_LIST_LIMIT);
    expect(buildWorkQueue(many, { scope: 'ALL', viewerId: 'u1', now, limit: 2 }).overdue).toHaveLength(2);
  });

  it('shows the load per owner with unassigned work last', () => {
    const loads = groupTasksByOwner(tasks, now);
    expect(loads.map((load) => load.ownerId)).toEqual(['u1', 'u2', null]);
    expect(loads[0]).toMatchObject({ open: 2, overdue: 1, blocked: 0, dueThisWeek: 1, nextDueLabel: '5 days overdue' });
    expect(dayKey(loads[0].nextDueAt as Date)).toBe('2026-06-10');
    expect(loads[1]).toMatchObject({ open: 1, overdue: 0, nextDueLabel: 'Due in 35 days' });
    expect(loads[2]).toMatchObject({ open: 2, blocked: 1, nextDueLabel: 'Due in 2 days' });
  });
});

describe('dashboard attention list', () => {
  const now = new Date(2026, 5, 15, 9, 0);
  const clients = [
    { clientId: 'c1', displayName: 'Amelia Morgan', status: 'CURRENT', keyWorkerId: 'u1', riskLevel: 'HIGH', contactFrequencyDays: 7, safeWellFrequencyDays: 30, lastSupportContactAt: new Date(2026, 5, 1), lastSafeWellCompletedAt: new Date(2026, 5, 1), openTasks: 4, overdueTasks: 2 },
    { clientId: 'c2', displayName: 'Ben Carter', status: 'CURRENT', keyWorkerId: 'u2', riskLevel: 'LOW', contactFrequencyDays: 7, safeWellFrequencyDays: 30, lastSupportContactAt: new Date(2026, 5, 13), lastSafeWellCompletedAt: new Date(2026, 5, 10), openTasks: 1, overdueTasks: 0 },
    { clientId: 'c3', displayName: 'Chloe Dean', status: 'CURRENT', keyWorkerId: null, riskLevel: 'MEDIUM', contactFrequencyDays: 14, safeWellFrequencyDays: 30, lastSupportContactAt: null, lastSafeWellCompletedAt: null, openTasks: 0, overdueTasks: 0 },
    { clientId: 'c4', displayName: 'Dylan Evans', restricted: true, status: 'CURRENT', keyWorkerId: 'u2', riskLevel: 'CRITICAL', contactFrequencyDays: 7, safeWellFrequencyDays: 30, lastSupportContactAt: new Date(2026, 4, 1), lastSafeWellCompletedAt: new Date(2026, 4, 1), openTasks: 0, overdueTasks: 0 },
    { clientId: 'c5', displayName: 'Former resident', status: 'FORMER', keyWorkerId: null, contactFrequencyDays: 7, safeWellFrequencyDays: 30, lastSupportContactAt: null, lastSafeWellCompletedAt: null }
  ];

  it('lists who is out of step with policy, worst first', () => {
    const rows = buildServiceUserAttention(clients, now);
    expect(rows.map((row) => row.clientId)).toEqual(['c1', 'c4', 'c3']);
    expect(rows[0]).toMatchObject({
      label: 'Amelia Morgan',
      restricted: false,
      severity: 'URGENT',
      contactState: 'OVERDUE',
      contactDueAt: new Date(2026, 5, 8),
      safeWellState: 'ON_TRACK',
      openTasks: 4,
      overdueTasks: 2
    });
    expect(rows[0].reasons).toEqual(['Planned contact is overdue', '2 overdue tasks']);
    expect(rows[1]).toMatchObject({ label: 'Restricted service user', restricted: true, severity: 'URGENT' });
    expect(rows[1].reasons).toEqual(['Planned contact is overdue', 'Safe & Well check is overdue']);
    expect(rows[2]).toMatchObject({ severity: 'HIGH', contactState: 'NOT_STARTED', contactDueAt: null, safeWellState: 'NOT_STARTED' });
    expect(rows[2].reasons).toEqual(['No meaningful contact recorded yet', 'No Safe & Well check recorded yet', 'No key worker assigned']);
  });

  it('leaves out service users who are fully up to date or no longer in placement', () => {
    const rows = buildServiceUserAttention(clients, now);
    expect(rows.map((row) => row.clientId)).not.toContain('c2');
    expect(rows.map((row) => row.clientId)).not.toContain('c5');
  });

  it('counts the list for the metric badge before any display cap', () => {
    expect(summariseAttention(buildServiceUserAttention(clients, now))).toEqual({ total: 3, urgent: 2, high: 1, medium: 0 });
  });
});

describe('dashboard calendar', () => {
  const now = new Date(2026, 5, 15, 9, 0);
  const appointments: CalendarAppointment[] = [
    { id: 'a1', title: 'Key work session', startsAt: new Date(2026, 5, 14, 10, 0), status: 'COMPLETED', category: 'KEY_WORK', ownerId: 'u1', clientId: 'c1' },
    { id: 'a2', title: 'Safe & Well check', startsAt: new Date(2026, 5, 15, 14, 0), status: 'CONFIRMED', category: 'SAFE_WELL', ownerId: 'u2', clientId: 'c2' },
    { id: 'a3', title: 'Mediation meeting', startsAt: new Date(2026, 5, 17, 11, 0), status: 'SCHEDULED', category: 'MEDIATION', ownerId: 'u1', clientId: 'c1' }
  ];
  const tasks = [
    { id: 't1', title: 'Overdue contact', status: 'OPEN', priority: 'HIGH', dueAt: new Date(2026, 5, 10), assignedToId: 'u1', department: 'SUPPORT', category: 'CONTACT', clientId: 'c1' },
    { id: 't2', title: 'Undated admin', status: 'OPEN', priority: 'LOW', dueAt: null, assignedToId: 'u2', department: 'ADMIN', category: 'OTHER', clientId: null }
  ];

  it('merges appointments with dated tasks and drops undated work', () => {
    const entries = buildCalendarEntries({ appointments, tasks, now });
    expect(entries.map((entry) => entry.id)).toEqual(['t1', 'a2', 'a3']);
    expect(entries[0]).toMatchObject({ kind: 'TASK', allDay: true, overdue: true, needsOutcome: false, clientId: 'c1' });
    expect(entries[1]).toMatchObject({ kind: 'APPOINTMENT', allDay: false, overdue: false, needsOutcome: false, ownerId: 'u2' });
    expect(buildCalendarEntries({ appointments, tasks, now, includeClosed: true }).map((entry) => entry.id)).toEqual(['t1', 'a1', 'a2', 'a3']);
  });

  it('builds a Monday week strip with per-day counts', () => {
    const entries = buildCalendarEntries({ appointments, tasks, now });
    const week = buildCalendarWeek(entries, now, 7, now);
    expect(week.map((day) => day.key)).toEqual(['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21']);
    expect(week[0].isToday).toBe(true);
    expect(week[0].entries.map((entry) => entry.id)).toEqual(['a2']);
    expect(week[0]).toMatchObject({ appointments: 1, tasks: 0, overdue: 0 });
    expect(summariseCalendarWeek(week)).toEqual({ total: 2, appointments: 2, tasks: 0, overdue: 0, needsOutcome: 0, busiestDayKey: '2026-06-15', busiestDayCount: 1 });

    const earlierWeek = buildCalendarWeek(entries, new Date(2026, 5, 8), 7, now);
    expect(earlierWeek[0].key).toBe('2026-06-08');
    expect(earlierWeek[2]).toMatchObject({ tasks: 1, overdue: 1 });
    expect(summariseCalendarWeek(earlierWeek)).toEqual({ total: 1, appointments: 0, tasks: 1, overdue: 1, needsOutcome: 0, busiestDayKey: '2026-06-10', busiestDayCount: 1 });
  });

  it('keeps a week aligned to Monday when it starts mid-week', () => {
    const week = buildCalendarWeek(buildCalendarEntries({ appointments, tasks, now }), new Date(2026, 5, 18), 7, now);
    expect(week[0].key).toBe('2026-06-15');
  });
});

describe('dashboard metric cards', () => {
  const now = new Date(2026, 5, 15, 9, 0);
  const metrics = buildDashboardMetrics({
    tasks: summariseTaskQueue(
      [
        { dueAt: new Date(2026, 5, 10), status: 'OPEN', assignedToId: 'u1' },
        { dueAt: null, status: 'OPEN', assignedToId: 'u2' },
        { dueAt: new Date(2026, 5, 3), status: 'DONE', assignedToId: 'u1' }
      ],
      now
    ),
    appointments: summariseAppointments(
      [
        { id: 'a1', title: 'Key work', startsAt: new Date(2026, 5, 15, 14, 0), status: 'CONFIRMED' },
        { id: 'a2', title: 'Mediation', startsAt: new Date(2026, 5, 17, 11, 0), status: 'SCHEDULED' },
        { id: 'a3', title: 'Home visit', startsAt: new Date(2026, 5, 13, 11, 0), status: 'MISSED' }
      ],
      now
    ),
    maintenance: summariseMaintenance(
      [{ status: 'IN_PROGRESS', reportedAt: new Date(2026, 5, 1), priority: 'HIGH', category: 'PLUMBING', safetyRisk: true }],
      now
    ),
    concerns: summariseConcerns(
      [{ status: 'OPEN', raisedAt: new Date(2026, 5, 14), severity: 'CRITICAL', category: 'SAFEGUARDING' }],
      now
    ),
    complaints: summariseComplaints(
      [{ status: 'OPEN', receivedAt: new Date(2026, 4, 1), stage: 'STAGE_1', category: 'COMMUNICATION' }],
      now
    ),
    compliance: summariseCompliance([{ status: 'VALID', complianceType: 'GAS_SAFETY', lastCheckedAt: new Date(2025, 0, 1) }], now),
    attention: summariseAttention(
      buildServiceUserAttention(
        [{ clientId: 'c1', displayName: 'Amelia Morgan', status: 'CURRENT', keyWorkerId: 'u1', riskLevel: 'LOW', contactFrequencyDays: 7, lastSupportContactAt: new Date(2026, 5, 1) }],
        now
      )
    )
  });

  it('keeps a stable card order and links each card to the page behind it', () => {
    expect(metrics.map((metric) => metric.key)).toEqual(['open-work', 'appointments', 'outcomes', 'repairs', 'concerns', 'complaints', 'compliance', 'attention']);
    expect(metrics.map((metric) => metric.href)).toEqual(['/crm/tasks', '/crm/calendar', '/crm/appointments', '/crm/maintenance', '/crm/concerns', '/crm/complaints', '/crm/compliance', '/crm/clients']);
  });

  it('counts open work rather than every task row', () => {
    expect(metrics[0]).toMatchObject({ value: 2, tone: 'red', detail: '1 overdue · 0 unassigned' });
  });

  it('counts the week ahead and the outcomes still to record', () => {
    expect(metrics[1]).toMatchObject({ value: 2, tone: 'blue' });
    expect(metrics[1].detail).toBe('1 today · next booked');
    expect(metrics[2]).toMatchObject({ key: 'outcomes', value: 0, tone: 'teal', detail: '1 missed visit' });
  });

  it('escalates the colour of a card the moment a deadline is missed', () => {
    expect(metrics[3]).toMatchObject({ key: 'repairs', value: 1, tone: 'red' });
    expect(metrics[4]).toMatchObject({ key: 'concerns', value: 1, tone: 'red' });
    expect(metrics[4].detail).toBe('1 critical · 1 referral required');
    expect(metrics[5]).toMatchObject({ key: 'complaints', value: 1, tone: 'red' });
    expect(metrics[6]).toMatchObject({ key: 'compliance', value: 0, tone: 'red', detail: '1 overdue · 0 due soon' });
    expect(metrics[7]).toMatchObject({ key: 'attention', value: 1, tone: 'gold' });
  });
});

describe('service user timeline', () => {
  const now = new Date(2026, 5, 15, 9, 0);
  const entries: TimelineEntryInput[] = [
    { kind: 'CASE_NOTE', id: 'n1', occurredAt: new Date(2026, 5, 12, 10, 0), title: 'Weekly key work note', detail: 'Discussed budgeting and benefits.', status: 'FINALISED', authorName: 'Priya Shah' },
    { kind: 'CONTACT', id: 'c1', occurredAt: new Date(2026, 5, 14, 9, 0), title: 'Phone contact', detail: 'Completed a 20 minute call.', status: 'COMPLETED', authorName: 'Priya Shah' },
    { kind: 'APPOINTMENT', id: 'a1', occurredAt: new Date(2026, 5, 17, 11, 0), title: 'Mediation meeting', status: 'SCHEDULED' },
    { kind: 'TASK', id: 't1', occurredAt: new Date(2026, 5, 10, 0, 0), title: 'Overdue contact', status: 'OPEN', href: '/crm/tasks/t1' },
    { kind: 'SAFE_WELL', id: 's1', occurredAt: new Date(2026, 5, 1, 14, 0), title: 'Safe & Well check', status: 'COMPLETED' }
  ];

  it('puts what is coming up first, then the newest history', () => {
    const timeline = buildServiceUserTimeline({ entries, now });
    expect(timeline.map((entry) => entry.id)).toEqual(['a1', 'c1', 'n1', 't1', 's1']);
    expect(timeline[0]).toMatchObject({ kindLabel: 'Appointment', dayKey: '2026-06-17', redacted: false, href: null });
    expect(timeline[3]).toMatchObject({ kindLabel: 'Task', href: '/crm/tasks/t1' });
  });

  it('withholds the narrative on a restricted profile but keeps the chronology', () => {
    const timeline = buildServiceUserTimeline({ entries, restricted: true, now });
    expect(timeline.map((entry) => entry.id)).toEqual(['a1', 'c1', 'n1', 't1', 's1']);
    expect(timeline.every((entry) => entry.detail === null && entry.redacted)).toBe(true);
  });

  it('filters by kind, by date, and by length', () => {
    expect(buildServiceUserTimeline({ entries, kinds: ['CONTACT', 'CASE_NOTE'], now }).map((entry) => entry.id)).toEqual(['c1', 'n1']);
    expect(buildServiceUserTimeline({ entries, since: new Date(2026, 5, 12), now }).map((entry) => entry.id)).toEqual(['a1', 'c1', 'n1']);
    expect(buildServiceUserTimeline({ entries, limit: 2, now }).map((entry) => entry.id)).toEqual(['a1', 'c1']);
  });

  it('groups the timeline into days without reordering it', () => {
    const groups = groupTimelineByDay(buildServiceUserTimeline({ entries, now }));
    expect(groups.map((group) => group.key)).toEqual(['2026-06-17', '2026-06-14', '2026-06-12', '2026-06-10', '2026-06-01']);
    expect(groups[1].entries.map((entry) => entry.id)).toEqual(['c1']);
    expect(dayKey(groups[1].date)).toBe('2026-06-14');
  });

  it('summarises the history behind the profile header', () => {
    const summary = summariseTimeline(buildServiceUserTimeline({ entries, now }), now);
    expect(summary.total).toBe(5);
    expect(summary.upcoming).toBe(1);
    expect(summary.last30Days).toBe(4);
    expect(dayKey(summary.lastActivityAt as Date)).toBe('2026-06-14');
    expect(summary.byKind[0]).toEqual({ key: 'APPOINTMENT', label: 'Appointment', count: 1 });
  });

  it('labels days and record types in plain language', () => {
    expect(timelineDayLabel(new Date(2026, 5, 15, 20, 0), now)).toBe('Today');
    expect(timelineDayLabel(new Date(2026, 5, 14), now)).toBe('Yesterday');
    expect(timelineDayLabel(new Date(2026, 5, 16), now)).toBe('Tomorrow');
    expect(timelineDayLabel(new Date(2026, 5, 12), now)).toBe('12 June 2026');
    expect(timelineKindLabel('SUPPORT_PLAN_REVIEW')).toBe('Support plan review');
    expect(timelineKindLabel('SOMETHING_NEW')).toBe('Something New');
  });
});

