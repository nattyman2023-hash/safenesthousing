import { addDays, daysBetween, isWithinDays } from './dates';

/** Safe & Well checks: the recurring in-person safety and wellbeing check for each service user.
 * The profile stores how often a check is required; this module decides whether a check is due
 * and what the recorded answers mean. Pure logic — writing checks is handled elsewhere. */

export const SAFE_WELL_STATUSES = ['SCHEDULED', 'COMPLETED', 'CONCERN_RAISED', 'MISSED', 'DECLINED', 'CANCELLED'] as const;
export type SafeWellStatus = (typeof SAFE_WELL_STATUSES)[number];

const checkTransitionMap: Record<SafeWellStatus, SafeWellStatus[]> = {
  SCHEDULED: ['COMPLETED', 'CONCERN_RAISED', 'MISSED', 'DECLINED', 'CANCELLED'],
  COMPLETED: ['CONCERN_RAISED'],
  CONCERN_RAISED: ['COMPLETED'],
  MISSED: ['SCHEDULED'],
  DECLINED: ['SCHEDULED'],
  CANCELLED: ['SCHEDULED']
};

export function canTransitionSafeWellCheck(from: string, to: string): boolean {
  return (checkTransitionMap[from as SafeWellStatus] ?? []).includes(to as SafeWellStatus);
}

export function assertSafeWellTransition(from: string, to: string): void {
  if (!canTransitionSafeWellCheck(from, to)) throw new Error(`Invalid Safe & Well transition: ${from} -> ${to}`);
}

export const SAFE_WELL_METHODS = ['IN_PERSON', 'HOME_VISIT', 'PHONE', 'VIDEO', 'OFFICE_VISIT'] as const;

export type SafeWellAnswer = 'OK' | 'ACTION' | 'URGENT' | 'NOT_CHECKED';

/** The areas a check covers. Health & safety items first, then tenancy conditions, then wellbeing. */
export const SAFE_WELL_AREAS: ReadonlyArray<{ key: string; label: string; group: string }> = [
  { key: 'SMOKE_ALARMS', label: 'Smoke and heat alarms tested', group: 'Safety' },
  { key: 'FIRE_ESCAPE', label: 'Fire escape routes clear', group: 'Safety' },
  { key: 'GAS', label: 'Gas appliances safe and in date', group: 'Safety' },
  { key: 'ELECTRICAL', label: 'Electrical items and sockets safe', group: 'Safety' },
  { key: 'WATER', label: 'Hot water and legionella controls', group: 'Safety' },
  { key: 'HEATING', label: 'Heating and hot water working', group: 'Property' },
  { key: 'DAMP_MOULD', label: 'No damp, mould, or leaks', group: 'Property' },
  { key: 'CLEANLINESS', label: 'Home clean and safe to live in', group: 'Property' },
  { key: 'SECURITY', label: 'Doors, windows, and entry secure', group: 'Property' },
  { key: 'HOARDING', label: 'No accumulation or hoarding risk', group: 'Property' },
  { key: 'MEDICATION', label: 'Medication stored and taken safely', group: 'Wellbeing' },
  { key: 'WELLBEING', label: 'Emotional and mental wellbeing discussed', group: 'Wellbeing' },
  { key: 'FOOD', label: 'Food, money, and essentials in place', group: 'Wellbeing' },
  { key: 'SUPPORT_NETWORK', label: 'Support network and contacts current', group: 'Wellbeing' },
  { key: 'PET_SAFETY', label: 'Any pets safe and provided for', group: 'Wellbeing' }
];

export function safeWellAreaKeys(): string[] {
  return SAFE_WELL_AREAS.map((area) => area.key);
}

export function safeWellAreasByGroup(): Array<{ group: string; areas: Array<{ key: string; label: string }> }> {
  const groups: Array<{ group: string; areas: Array<{ key: string; label: string }> }> = [];
  for (const area of SAFE_WELL_AREAS) {
    const existing = groups.find((entry) => entry.group === area.group);
    if (existing) existing.areas.push({ key: area.key, label: area.label });
    else groups.push({ group: area.group, areas: [{ key: area.key, label: area.label }] });
  }
  return groups;
}

export type SafeWellOutcome = 'SATISFACTORY' | 'ACTIONS_REQUIRED' | 'URGENT_ESCALATION';

/** Any urgent answer escalates the whole check; otherwise actions create follow-up work. */
export function safeWellOutcome(answers: Record<string, SafeWellAnswer | undefined>): SafeWellOutcome {
  const values = Object.values(answers).filter((value): value is SafeWellAnswer => !!value);
  if (values.includes('URGENT')) return 'URGENT_ESCALATION';
  if (values.includes('ACTION')) return 'ACTIONS_REQUIRED';
  return 'SATISFACTORY';
}

export function safeWellActionAreas(answers: Record<string, SafeWellAnswer | undefined>): Array<{ key: string; label: string; answer: SafeWellAnswer }> {
  return SAFE_WELL_AREAS
    .filter((area) => answers[area.key] === 'ACTION' || answers[area.key] === 'URGENT')
    .map((area) => ({ key: area.key, label: area.label, answer: answers[area.key] as SafeWellAnswer }));
}

export function requiresMaintenanceReferral(answers: Record<string, SafeWellAnswer | undefined>): boolean {
  const propertyKeys = SAFE_WELL_AREAS.filter((area) => area.group === 'Property').map((area) => area.key);
  return propertyKeys.some((key) => answers[key] === 'ACTION' || answers[key] === 'URGENT');
}


export type SafeWellDueState = 'NOT_STARTED' | 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE';

export const SAFE_WELL_DUE_SOON_DAYS = 7;
export const DEFAULT_SAFE_WELL_FREQUENCY_DAYS = 30;

export function nextSafeWellDueAt(lastCompletedAt: Date | null | undefined, frequencyDays: number): Date | null {
  if (!lastCompletedAt) return null;
  const frequency = frequencyDays > 0 ? frequencyDays : DEFAULT_SAFE_WELL_FREQUENCY_DAYS;
  return addDays(lastCompletedAt, frequency);
}

export function safeWellDueState(
  input: { lastCompletedAt: Date | null | undefined; frequencyDays: number; nextDueAt?: Date | null; now?: Date }
): SafeWellDueState {
  const now = input.now ?? new Date();
  const dueAt = input.nextDueAt ?? nextSafeWellDueAt(input.lastCompletedAt, input.frequencyDays);
  if (!dueAt) return 'NOT_STARTED';
  if (dueAt.getTime() < now.getTime()) return 'OVERDUE';
  return isWithinDays(dueAt, SAFE_WELL_DUE_SOON_DAYS, now) ? 'DUE_SOON' : 'ON_TRACK';
}

export type SafeWellCheckRecord = {
  status: string;
  completedAt: Date | null;
  scheduledFor?: Date | null;
  concernRaised?: boolean;
};

export type SafeWellSummary = {
  lastCompletedAt: Date | null;
  lastConcernAt: Date | null;
  completedCount: number;
  missedCount: number;
  concernCount: number;
  dueAt: Date | null;
  state: SafeWellDueState;
  daysSinceCheck: number | null;
};

export function summariseSafeWellChecks(
  checks: SafeWellCheckRecord[],
  frequencyDays: number,
  now = new Date()
): SafeWellSummary {
  const completed = checks.filter((check) => check.status === 'COMPLETED' || check.status === 'CONCERN_RAISED');
  const lastCompleted = completed
    .map((check) => check.completedAt)
    .filter((value): value is Date => !!value)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const concerns = checks.filter((check) => check.concernRaised || check.status === 'CONCERN_RAISED');
  return {
    lastCompletedAt: lastCompleted,
    lastConcernAt: concerns.length ? concerns[concerns.length - 1].completedAt : null,
    completedCount: completed.length,
    missedCount: checks.filter((check) => check.status === 'MISSED').length,
    concernCount: concerns.length,
    dueAt: nextSafeWellDueAt(lastCompleted, frequencyDays),
    state: safeWellDueState({ lastCompletedAt: lastCompleted, frequencyDays, now }),
    daysSinceCheck: lastCompleted ? daysBetween(lastCompleted, now) : null
  };
}

/** Percentage of required checks completed in the window — used by the compliance dashboard. */
export function safeWellCompletionRate(checks: SafeWellCheckRecord[], frequencyDays: number, windowDays: number, now = new Date()): number {
  const frequency = frequencyDays > 0 ? frequencyDays : DEFAULT_SAFE_WELL_FREQUENCY_DAYS;
  const expected = Math.max(1, Math.floor(windowDays / frequency));
  const windowStart = addDays(now, -windowDays);
  const delivered = checks.filter((check) => (check.status === 'COMPLETED' || check.status === 'CONCERN_RAISED')
    && !!check.completedAt && check.completedAt.getTime() >= windowStart.getTime()).length;
  return Math.min(100, Math.round((delivered / expected) * 100));
}
