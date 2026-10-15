import { addWorkingDays, countWorkingDays, daysBetween, isPast } from './dates';

/** Formal complaints, including the statutory-style timescales used in social housing: a five
 * working-day acknowledgement and a stage-dependent response window. Working-day arithmetic lives
 * in `dates.ts`; this module only decides the deadlines and whether they have been met. */

export const COMPLAINT_STATUSES = ['LOGGED', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESPONDED', 'ESCALATED', 'CLOSED', 'WITHDRAWN'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

const complaintTransitionMap: Record<ComplaintStatus, ComplaintStatus[]> = {
  LOGGED: ['ACKNOWLEDGED', 'INVESTIGATING', 'RESPONDED', 'WITHDRAWN'],
  ACKNOWLEDGED: ['INVESTIGATING', 'RESPONDED', 'ESCALATED', 'WITHDRAWN'],
  INVESTIGATING: ['RESPONDED', 'ESCALATED', 'WITHDRAWN'],
  RESPONDED: ['CLOSED', 'ESCALATED'],
  ESCALATED: ['INVESTIGATING', 'RESPONDED', 'CLOSED'],
  CLOSED: ['LOGGED'],
  WITHDRAWN: ['LOGGED']
};

export function canTransitionComplaint(from: string, to: string): boolean {
  return (complaintTransitionMap[from as ComplaintStatus] ?? []).includes(to as ComplaintStatus);
}

export function assertComplaintTransition(from: string, to: string): void {
  if (!canTransitionComplaint(from, to)) throw new Error(`Invalid complaint transition: ${from} -> ${to}`);
}

export function isComplaintOpen(status: string): boolean {
  return status !== 'CLOSED' && status !== 'WITHDRAWN';
}

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  LOGGED: 'Logged',
  ACKNOWLEDGED: 'Acknowledged',
  INVESTIGATING: 'Investigating',
  RESPONDED: 'Response sent',
  ESCALATED: 'Escalated',
  CLOSED: 'Closed',
  WITHDRAWN: 'Withdrawn'
};

export const COMPLAINT_STAGES = ['STAGE_1', 'STAGE_2', 'STAGE_3', 'OMBUDSMAN'] as const;
export type ComplaintStage = (typeof COMPLAINT_STAGES)[number];

export const COMPLAINT_STAGE_LABELS: Record<ComplaintStage, string> = {
  STAGE_1: 'Stage 1 — service manager',
  STAGE_2: 'Stage 2 — head of service',
  STAGE_3: 'Stage 3 — panel review',
  OMBUDSMAN: 'Ombudsman referral'
};

export const COMPLAINT_OUTCOMES = ['UPHELD', 'PARTIALLY_UPHELD', 'NOT_UPHELD', 'WITHDRAWN', 'SETTLED'] as const;
export type ComplaintOutcome = (typeof COMPLAINT_OUTCOMES)[number];

export const COMPLAINT_CATEGORIES = [
  'SERVICE',
  'STAFF_CONDUCT',
  'COMMUNICATION',
  'PROPERTY',
  'SAFETY',
  'PRIVACY',
  'DISCRIMINATION',
  'FINANCE',
  'TIMELINESS',
  'OTHER'
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_RAISED_BY = ['SERVICE_USER', 'FAMILY', 'ADVOCATE', 'PROFESSIONAL', 'STAFF', 'ANONYMOUS'] as const;
export type ComplaintRaisedBy = (typeof COMPLAINT_RAISED_BY)[number];

export const COMPLAINT_ACKNOWLEDGE_WORKING_DAYS = 5;

/** Response windows in working days per stage, based on the organisation's published procedure. */
export const COMPLAINT_RESPONSE_WORKING_DAYS: Record<ComplaintStage, number> = {
  STAGE_1: 10,
  STAGE_2: 20,
  STAGE_3: 20,
  OMBUDSMAN: 40
};

export type ComplaintTimescales = {
  acknowledgeBy: Date;
  responseDueAt: Date;
  responseWorkingDays: number;
  escalateAfterAt: Date;
};

export function complaintTimescales(receivedAt: Date, stage: string, holidays: Date[] = []): ComplaintTimescales {
  const resolvedStage = (COMPLAINT_STAGES.includes(stage as ComplaintStage) ? stage : 'STAGE_1') as ComplaintStage;
  const responseWorkingDays = COMPLAINT_RESPONSE_WORKING_DAYS[resolvedStage];
  return {
    acknowledgeBy: addWorkingDays(receivedAt, COMPLAINT_ACKNOWLEDGE_WORKING_DAYS, holidays),
    responseDueAt: addWorkingDays(receivedAt, responseWorkingDays, holidays),
    responseWorkingDays,
    escalateAfterAt: addWorkingDays(receivedAt, responseWorkingDays + 5, holidays)
  };
}

export function nextComplaintStage(stage: string): ComplaintStage {
  const index = COMPLAINT_STAGES.indexOf(stage as ComplaintStage);
  if (index === -1) return 'STAGE_1';
  return COMPLAINT_STAGES[Math.min(COMPLAINT_STAGES.length - 1, index + 1)];
}


/** Resolves the deadlines for a complaint, honouring any date a manager set manually. */
export function effectiveComplaintDeadlines(
  complaint: { receivedAt: Date; stage: string; acknowledgedAt?: Date | null; dueAt?: Date | null },
  holidays: Date[] = []
): ComplaintTimescales {
  const timescales = complaintTimescales(complaint.receivedAt, complaint.stage, holidays);
  return { ...timescales, responseDueAt: complaint.dueAt ?? timescales.responseDueAt };
}

export type ComplaintComplianceState =
  | 'CLOSED'
  | 'ON_TRACK'
  | 'ACKNOWLEDGEMENT_OVERDUE'
  | 'RESPONSE_DUE_SOON'
  | 'RESPONSE_OVERDUE';

export function complaintComplianceState(
  complaint: { status: string; receivedAt: Date; stage: string; acknowledgedAt?: Date | null; dueAt?: Date | null; respondedAt?: Date | null; closedAt?: Date | null },
  now = new Date(),
  holidays: Date[] = []
): ComplaintComplianceState {
  if (!isComplaintOpen(complaint.status)) return 'CLOSED';
  const deadlines = effectiveComplaintDeadlines(complaint, holidays);
  if (!complaint.acknowledgedAt && isPast(deadlines.acknowledgeBy, now)) return 'ACKNOWLEDGEMENT_OVERDUE';
  if (isPast(deadlines.responseDueAt, now) && !complaint.respondedAt) return 'RESPONSE_OVERDUE';
  return deadlines.responseDueAt.getTime() <= now.getTime() + 3 * 86_400_000 ? 'RESPONSE_DUE_SOON' : 'ON_TRACK';
}

export function complaintDeadlineLabel(
  complaint: { status: string; receivedAt: Date; stage: string; acknowledgedAt?: Date | null; dueAt?: Date | null; respondedAt?: Date | null },
  now = new Date(),
  holidays: Date[] = []
): string {
  const state = complaintComplianceState(complaint, now, holidays);
  if (state === 'CLOSED') return 'Closed';
  const deadlines = effectiveComplaintDeadlines(complaint, holidays);
  if (state === 'ACKNOWLEDGEMENT_OVERDUE') return `${countWorkingDays(deadlines.acknowledgeBy, now, holidays) || 1} working day(s) late to acknowledge`;
  if (state === 'RESPONSE_OVERDUE') return `${countWorkingDays(deadlines.responseDueAt, now, holidays) || 1} working day(s) past the response date`;
  const workingDaysLeft = countWorkingDays(now, deadlines.responseDueAt, holidays);
  return `${workingDaysLeft} working day${workingDaysLeft === 1 ? '' : 's'} to respond`;
}

export function complaintAgeDays(complaint: { receivedAt: Date; closedAt?: Date | null }, now = new Date()): number {
  return Math.max(0, daysBetween(complaint.receivedAt, complaint.closedAt ?? now));
}

export function complaintOutcomeLabel(outcome: string | null | undefined): string {
  if (!outcome) return 'Outcome not recorded';
  if (outcome === 'UPHELD') return 'Upheld';
  if (outcome === 'PARTIALLY_UPHELD') return 'Partially upheld';
  if (outcome === 'NOT_UPHELD') return 'Not upheld';
  if (outcome === 'SETTLED') return 'Settled before response';
  if (outcome === 'WITHDRAWN') return 'Withdrawn';
  return outcome.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}


export type ComplaintSummary = {
  total: number;
  open: number;
  acknowledgementOverdue: number;
  responseOverdue: number;
  dueSoon: number;
  upheld: number;
  learningOutstanding: number;
  averageResponseDays: number | null;
  byStage: Record<string, number>;
  byCategory: Record<string, number>;
};

export type ComplaintRecord = {
  status: string;
  receivedAt: Date;
  stage: string;
  category: string;
  acknowledgedAt?: Date | null;
  dueAt?: Date | null;
  respondedAt?: Date | null;
  closedAt?: Date | null;
  outcome?: string | null;
  learning?: string | null;
};

export function summariseComplaints(complaints: ComplaintRecord[], now = new Date(), holidays: Date[] = []): ComplaintSummary {
  const byStage: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const responseDurations: number[] = [];
  let open = 0;
  let acknowledgementOverdue = 0;
  let responseOverdue = 0;
  let dueSoon = 0;
  let upheld = 0;
  let learningOutstanding = 0;
  for (const complaint of complaints) {
    byStage[complaint.stage] = (byStage[complaint.stage] ?? 0) + 1;
    byCategory[complaint.category] = (byCategory[complaint.category] ?? 0) + 1;
    if (complaint.outcome === 'UPHELD' || complaint.outcome === 'PARTIALLY_UPHELD') upheld += 1;
    if (complaint.respondedAt) responseDurations.push(Math.max(0, daysBetween(complaint.receivedAt, complaint.respondedAt)));
    if (requiresLearningRecord(complaint) && !complaint.learning?.trim()) learningOutstanding += 1;
    if (!isComplaintOpen(complaint.status)) continue;
    open += 1;
    const state = complaintComplianceState(complaint, now, holidays);
    if (state === 'ACKNOWLEDGEMENT_OVERDUE') acknowledgementOverdue += 1;
    if (state === 'RESPONSE_OVERDUE') responseOverdue += 1;
    if (state === 'RESPONSE_DUE_SOON') dueSoon += 1;
  }
  return {
    total: complaints.length,
    open,
    acknowledgementOverdue,
    responseOverdue,
    dueSoon,
    upheld,
    learningOutstanding,
    averageResponseDays: responseDurations.length
      ? Math.round((responseDurations.reduce((total, days) => total + days, 0) / responseDurations.length) * 10) / 10
      : null,
    byStage,
    byCategory
  };
}

/** Learning is only recorded when a complaint was upheld to some degree. */
export function requiresLearningRecord(complaint: { status: string; outcome?: string | null }): boolean {
  if (!isComplaintOpen(complaint.status)) return false;
  return complaint.outcome === 'UPHELD' || complaint.outcome === 'PARTIALLY_UPHELD';
}
