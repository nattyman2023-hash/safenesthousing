export const REFERRAL_STATUSES = [
  'NEW', 'ACKNOWLEDGED', 'TRIAGE', 'ASSESSMENT_BOOKED', 'ASSESSING',
  'AWAITING_INFORMATION', 'ELIGIBLE', 'OFFER_MADE', 'OFFER_ACCEPTED',
  'MOVING_IN', 'PLACED', 'WAITLISTED', 'DECLINED', 'WITHDRAWN', 'SIGNPOSTED', 'CLOSED'
] as const;

export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

const transitionMap: Record<ReferralStatus, ReferralStatus[]> = {
  NEW: ['ACKNOWLEDGED', 'TRIAGE', 'WITHDRAWN'],
  ACKNOWLEDGED: ['TRIAGE', 'AWAITING_INFORMATION', 'WITHDRAWN'],
  TRIAGE: ['ASSESSMENT_BOOKED', 'AWAITING_INFORMATION', 'SIGNPOSTED', 'DECLINED', 'WITHDRAWN'],
  ASSESSMENT_BOOKED: ['ASSESSING', 'AWAITING_INFORMATION', 'WITHDRAWN'],
  ASSESSING: ['ELIGIBLE', 'AWAITING_INFORMATION', 'DECLINED', 'SIGNPOSTED', 'WITHDRAWN'],
  AWAITING_INFORMATION: ['TRIAGE', 'ASSESSING', 'DECLINED', 'WITHDRAWN'],
  ELIGIBLE: ['OFFER_MADE', 'WAITLISTED', 'SIGNPOSTED', 'DECLINED'],
  OFFER_MADE: ['OFFER_ACCEPTED', 'WAITLISTED', 'DECLINED', 'WITHDRAWN'],
  OFFER_ACCEPTED: ['MOVING_IN', 'WITHDRAWN'],
  MOVING_IN: ['PLACED', 'WITHDRAWN'],
  PLACED: ['CLOSED'],
  WAITLISTED: ['OFFER_MADE', 'CLOSED', 'WITHDRAWN'],
  DECLINED: ['CLOSED'],
  WITHDRAWN: ['CLOSED'],
  SIGNPOSTED: ['CLOSED'],
  CLOSED: []
};

export function canTransitionReferral(from: string, to: string): boolean {
  return (transitionMap[from as ReferralStatus] ?? []).includes(to as ReferralStatus);
}

export function nextReferralStatuses(status: string): ReferralStatus[] {
  return transitionMap[status as ReferralStatus] ?? [];
}

export function assertReferralTransition(from: string, to: string): void {
  if (!canTransitionReferral(from, to)) throw new Error(`Invalid referral transition: ${from} -> ${to}`);
}

export function isRoomAvailable(status: string, activeOccupancyCount: number): boolean {
  return status === 'AVAILABLE' && activeOccupancyCount === 0;
}

export function hasOccupancyOverlap(records: Array<{ startDate: Date; endDate: Date | null }>, start: Date, end: Date | null): boolean {
  const endTime = end?.getTime() ?? Number.POSITIVE_INFINITY;
  return records.some((record) => {
    const recordEnd = record.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
    return record.startDate.getTime() < endTime && start.getTime() < recordEnd;
  });
}

export function hasRotaOverlap(records: Array<{ startsAt: Date; endsAt: Date }>, start: Date, end: Date): boolean {
  return records.some((record) => record.startsAt.getTime() < end.getTime() && start.getTime() < record.endsAt.getTime());
}

export function isTaskOverdue(task: { dueAt: Date | null; status: string }, now = new Date()): boolean {
  return task.status !== 'DONE' && !!task.dueAt && task.dueAt.getTime() < now.getTime();
}

export function invoiceTotal(items: Array<{ quantity: number; unitMinor: number }>): number {
  return items.reduce((total, item) => total + item.quantity * item.unitMinor, 0);
}

export function invoiceRemaining(totalMinor: number, payments: Array<{ amountMinor: number }>): number {
  return Math.max(0, totalMinor - payments.reduce((total, payment) => total + payment.amountMinor, 0));
}

export function canCloseDataSubjectRequest(status: string, legalHold: boolean): boolean {
  return ['COMPLETED', 'DECLINED'].includes(status) && !legalHold;
}

export function nextStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
