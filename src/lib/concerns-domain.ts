import { addWorkingDays, daysBetween, isPast } from './dates';

/** Concerns and formal complaints: the risk-and-learning side of the CRM. Statutory complaint
 * timescales are counted in working days here, so acknowledgement and response deadlines cannot be
 * calculated differently in two places. Pure logic — persistence happens in the API routes. */

export const CONCERN_CATEGORIES = [
  'WELFARE',
  'SAFEGUARDING',
  'MENTAL_HEALTH',
  'MISSING_RISK',
  'SUBSTANCE_USE',
  'MEDICATION',
  'HEALTH',
  'TENANCY',
  'NEIGHBOUR',
  'PROPERTY',
  'FINANCE',
  'EXPLOITATION',
  'CRIMINAL_JUSTICE',
  'OTHER'
] as const;
export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number];

export const CONCERN_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type ConcernSeverity = (typeof CONCERN_SEVERITIES)[number];

export const CONCERN_STATUSES = ['OPEN', 'IN_PROGRESS', 'MONITORING', 'ESCALATED', 'RESOLVED', 'CLOSED'] as const;
export type ConcernStatus = (typeof CONCERN_STATUSES)[number];

const concernTransitionMap: Record<ConcernStatus, ConcernStatus[]> = {
  OPEN: ['IN_PROGRESS', 'ESCALATED', 'MONITORING', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['MONITORING', 'ESCALATED', 'RESOLVED', 'OPEN'],
  MONITORING: ['IN_PROGRESS', 'ESCALATED', 'RESOLVED'],
  ESCALATED: ['IN_PROGRESS', 'MONITORING', 'RESOLVED'],
  RESOLVED: ['MONITORING', 'CLOSED', 'IN_PROGRESS'],
  CLOSED: ['OPEN']
};

export function canTransitionConcern(from: string, to: string): boolean {
  return (concernTransitionMap[from as ConcernStatus] ?? []).includes(to as ConcernStatus);
}

export function assertConcernTransition(from: string, to: string): void {
  if (!canTransitionConcern(from, to)) throw new Error(`Invalid concern transition: ${from} -> ${to}`);
}

export function isConcernOpen(status: string): boolean {
  return status !== 'RESOLVED' && status !== 'CLOSED';
}

/** Response window for a concern, measured in hours from the moment it was raised. */
export const CONCERN_RESPONSE_HOURS: Record<ConcernSeverity, number> = {
  CRITICAL: 4,
  HIGH: 24,
  MEDIUM: 72,
  LOW: 168
};

export function concernResponseDueAt(raisedAt: Date, severity: string): Date {
  const hours = CONCERN_RESPONSE_HOURS[severity as ConcernSeverity] ?? CONCERN_RESPONSE_HOURS.MEDIUM;
  return new Date(raisedAt.getTime() + hours * 3_600_000);
}

export type ConcernState = 'CLOSED' | 'AWAITING_RESPONSE' | 'RESPONSE_DUE_SOON' | 'OVERDUE';

export function concernState(
  concern: { status: string; raisedAt: Date; severity: string; dueAt?: Date | null },
  now = new Date()
): ConcernState {
  if (!isConcernOpen(concern.status)) return 'CLOSED';
  const dueAt = concern.dueAt ?? concernResponseDueAt(concern.raisedAt, concern.severity);
  if (isPast(dueAt, now)) return 'OVERDUE';
  return dueAt.getTime() <= now.getTime() + 24 * 3_600_000 ? 'RESPONSE_DUE_SOON' : 'AWAITING_RESPONSE';
}

export function concernAgeDays(concern: { raisedAt: Date; resolvedAt?: Date | null }, now = new Date()): number {
  return Math.max(0, daysBetween(concern.raisedAt, concern.resolvedAt ?? now));
}

/** Safeguarding and exploitation concerns always need a referral decision recorded. */
const referralCategories: ConcernCategory[] = ['SAFEGUARDING', 'EXPLOITATION', 'MISSING_RISK', 'CRIMINAL_JUSTICE'];

export function shouldReferConcern(concern: { category: string; severity: string }): boolean {
  if (concern.severity === 'CRITICAL') return true;
  if (referralCategories.includes(concern.category as ConcernCategory)) return concern.severity !== 'LOW';
  return false;
}

export type ConcernSummary = {
  total: number;
  open: number;
  overdue: number;
  escalated: number;
  critical: number;
  resolved: number;
  referralsRequired: number;
  averageResolutionDays: number | null;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
};

export function summariseConcerns(
  concerns: Array<{ status: string; raisedAt: Date; severity: string; category: string; dueAt?: Date | null; resolvedAt?: Date | null }>,
  now = new Date()
): ConcernSummary {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const resolutionDays: number[] = [];
  let open = 0;
  let overdue = 0;
  let escalated = 0;
  let critical = 0;
  let referralsRequired = 0;
  for (const concern of concerns) {
    byCategory[concern.category] = (byCategory[concern.category] ?? 0) + 1;
    bySeverity[concern.severity] = (bySeverity[concern.severity] ?? 0) + 1;
    if (concern.severity === 'CRITICAL') critical += 1;
    if (shouldReferConcern(concern)) referralsRequired += 1;
    if (concern.resolvedAt) resolutionDays.push(concernAgeDays(concern, concern.resolvedAt));
    if (concern.status === 'ESCALATED') escalated += 1;
    if (!isConcernOpen(concern.status)) continue;
    open += 1;
    if (concernState(concern, now) === 'OVERDUE') overdue += 1;
  }
  return {
    total: concerns.length,
    open,
    overdue,
    escalated,
    critical,
    resolved: concerns.filter((concern) => !!concern.resolvedAt).length,
    referralsRequired,
    averageResolutionDays: resolutionDays.length ? Math.round((resolutionDays.reduce((total, days) => total + days, 0) / resolutionDays.length) * 10) / 10 : null,
    byCategory,
    bySeverity
  };
}
