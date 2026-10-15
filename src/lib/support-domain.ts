import { addDays, daysBetween, isWithinDays } from './dates';

/** Service-user support statuses: the lifecycle from referral through assessment, active support,
 * move-on, and closure. Status changes must go through `assertSupportTransition` so the CRM cannot
 * move someone straight from referral to closed without the work in between. */

export const SUPPORT_STATUSES = [
  'REFERRAL',
  'ASSESSMENT',
  'WAITING_LIST',
  'PENDING_ALLOCATION',
  'SUPPORT_ACTIVE',
  'SUPPORT_REDUCING',
  'ON_HOLD',
  'MOVE_ON_SUPPORT',
  'CLOSED',
  'WITHDRAWN'
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

const supportTransitionMap: Record<SupportStatus, SupportStatus[]> = {
  REFERRAL: ['ASSESSMENT', 'WAITING_LIST', 'WITHDRAWN'],
  ASSESSMENT: ['WAITING_LIST', 'PENDING_ALLOCATION', 'SUPPORT_ACTIVE', 'WITHDRAWN'],
  WAITING_LIST: ['PENDING_ALLOCATION', 'SUPPORT_ACTIVE', 'WITHDRAWN'],
  PENDING_ALLOCATION: ['SUPPORT_ACTIVE', 'WAITING_LIST', 'WITHDRAWN'],
  SUPPORT_ACTIVE: ['SUPPORT_REDUCING', 'ON_HOLD', 'MOVE_ON_SUPPORT', 'CLOSED', 'WITHDRAWN'],
  SUPPORT_REDUCING: ['SUPPORT_ACTIVE', 'MOVE_ON_SUPPORT', 'CLOSED', 'WITHDRAWN'],
  ON_HOLD: ['SUPPORT_ACTIVE', 'SUPPORT_REDUCING', 'MOVE_ON_SUPPORT', 'CLOSED', 'WITHDRAWN'],
  MOVE_ON_SUPPORT: ['SUPPORT_ACTIVE', 'CLOSED', 'WITHDRAWN'],
  CLOSED: ['REFERRAL', 'SUPPORT_ACTIVE'],
  WITHDRAWN: ['REFERRAL', 'ASSESSMENT']
};

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  REFERRAL: 'Referral received',
  ASSESSMENT: 'In assessment',
  WAITING_LIST: 'On waiting list',
  PENDING_ALLOCATION: 'Awaiting allocation',
  SUPPORT_ACTIVE: 'Support active',
  SUPPORT_REDUCING: 'Support reducing',
  ON_HOLD: 'On hold',
  MOVE_ON_SUPPORT: 'Move-on support',
  CLOSED: 'Closed',
  WITHDRAWN: 'Withdrawn'
};

export function supportStatusLabel(status: string): string {
  return SUPPORT_STATUS_LABELS[status as SupportStatus] ?? status.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function canTransitionSupportStatus(from: string, to: string): boolean {
  return (supportTransitionMap[from as SupportStatus] ?? []).includes(to as SupportStatus);
}

export function assertSupportTransition(from: string, to: string): void {
  if (!canTransitionSupportStatus(from, to)) throw new Error(`Invalid support status transition: ${from} -> ${to}`);
}

export function nextSupportStatuses(from: string): SupportStatus[] {
  return supportTransitionMap[from as SupportStatus] ?? [];
}

/** Closed and withdrawn records no longer need active case management. */
export function isSupportOpen(status: string): boolean {
  return status !== 'CLOSED' && status !== 'WITHDRAWN';
}

export function isActiveSupport(status: string): boolean {
  return status === 'SUPPORT_ACTIVE' || status === 'SUPPORT_REDUCING' || status === 'MOVE_ON_SUPPORT';
}

export type SupportPhase = 'PRE_SUPPORT' | 'SUPPORTED' | 'MOVE_ON' | 'ENDED';

const supportPhaseMap: Record<SupportStatus, SupportPhase> = {
  REFERRAL: 'PRE_SUPPORT',
  ASSESSMENT: 'PRE_SUPPORT',
  WAITING_LIST: 'PRE_SUPPORT',
  PENDING_ALLOCATION: 'PRE_SUPPORT',
  SUPPORT_ACTIVE: 'SUPPORTED',
  SUPPORT_REDUCING: 'SUPPORTED',
  ON_HOLD: 'SUPPORTED',
  MOVE_ON_SUPPORT: 'MOVE_ON',
  CLOSED: 'ENDED',
  WITHDRAWN: 'ENDED'
};

export function supportPhase(status: string): SupportPhase {
  return supportPhaseMap[status as SupportStatus] ?? 'PRE_SUPPORT';
}

export const SUPPORT_PHASE_LABELS: Record<SupportPhase, string> = {
  PRE_SUPPORT: 'Before support',
  SUPPORTED: 'Receiving support',
  MOVE_ON: 'Moving on',
  ENDED: 'Ended'
};

/** Frequency fields are staff-entered, so clamp them into a workable band. */
export const MIN_CONTACT_FREQUENCY_DAYS = 1;
export const MAX_CONTACT_FREQUENCY_DAYS = 90;
export const MIN_SAFE_WELL_FREQUENCY_DAYS = 7;
export const MAX_SAFE_WELL_FREQUENCY_DAYS = 365;

export function normaliseContactFrequency(value: number | null | undefined, fallback = 7): number {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_CONTACT_FREQUENCY_DAYS, Math.max(MIN_CONTACT_FREQUENCY_DAYS, Math.round(value)));
}

export function normaliseSafeWellFrequency(value: number | null | undefined, fallback = 30): number {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_SAFE_WELL_FREQUENCY_DAYS, Math.max(MIN_SAFE_WELL_FREQUENCY_DAYS, Math.round(value)));
}


export const SUPPORT_CHANNELS = ['PHONE', 'TEXT', 'EMAIL', 'IN_PERSON', 'VIDEO', 'LETTER'] as const;
export type SupportChannel = (typeof SUPPORT_CHANNELS)[number];

export type ContactDetailProfile = {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  communicationNeeds?: string | null;
};

/** Which contact routes are actually usable for this person: a missing number cannot be the plan. */
export function availableChannels(profile: ContactDetailProfile): SupportChannel[] {
  const channels: SupportChannel[] = [];
  if (profile.phone?.trim()) channels.push('PHONE', 'TEXT');
  if (profile.email?.trim()) channels.push('EMAIL');
  if (profile.address?.trim()) channels.push('IN_PERSON', 'LETTER');
  return channels;
}

/** Communication needs in the person's own words drive which channel staff should try first. */
export function preferredChannel(profile: ContactDetailProfile): SupportChannel {
  const needs = (profile.communicationNeeds ?? '').toLowerCase();
  const available = availableChannels(profile);
  const pick = (channel: SupportChannel) => (available.includes(channel) ? channel : undefined);
  if (/(sign|bsl|deaf|hearing)/.test(needs)) return pick('TEXT') ?? pick('EMAIL') ?? pick('IN_PERSON') ?? 'IN_PERSON';
  if (/(text|sms|message)/.test(needs)) return pick('TEXT') ?? 'IN_PERSON';
  if (/(email|written|write)/.test(needs)) return pick('EMAIL') ?? 'IN_PERSON';
  if (/(interpreter|eas|translat|language)/.test(needs)) return pick('IN_PERSON') ?? 'PHONE';
  return pick('PHONE') ?? pick('IN_PERSON') ?? available[0] ?? 'IN_PERSON';
}

export function hasUsableContactRoute(profile: ContactDetailProfile): boolean {
  return availableChannels(profile).length > 0;
}

export type MoveInReadinessState = 'NOT_SET' | 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE';

/** Move-in target dates drive the countdown on the profile and the checklist target date. */
export function moveInTargetState(targetDate: Date | null | undefined, now = new Date()): MoveInReadinessState {
  if (!targetDate) return 'NOT_SET';
  if (targetDate.getTime() < now.getTime()) return 'OVERDUE';
  return isWithinDays(targetDate, 7, now) ? 'DUE_SOON' : 'ON_TRACK';
}

export function moveInCountdownLabel(targetDate: Date | null | undefined, now = new Date()): string {
  if (!targetDate) return 'No move-in date set';
  const days = Math.round((targetDate.getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return 'Moving in today';
  if (days > 0) return `Move in ${days} day${days === 1 ? '' : 's'}`;
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} past target`;
}

/** Length of stay, used on the profile header and in the outcome reports. */
export function placementDays(admissionDate: Date | null | undefined, dischargeDate: Date | null | undefined, now = new Date()): number | null {
  if (!admissionDate) return null;
  const end = dischargeDate ?? now;
  return Math.max(0, daysBetween(admissionDate, end));
}

/** Profile gaps drive the "needs attention" list: no key worker means nobody owns the work. */
export type ProfileGap =
  | 'NO_KEY_WORKER'
  | 'NO_SUPPORT_WORKER'
  | 'NO_CONTACT_ROUTE'
  | 'NO_MOVE_IN_DATE'
  | 'NO_DATE_OF_BIRTH'
  | 'NO_PEN_PORTRAIT'
  | 'NO_RISK_ASSESSMENT'
  | 'COMMUNICATION_NEEDS_MISSING';

export type ProfileGapInput = {
  status: string;
  keyWorkerId?: string | null;
  supportWorkerId?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  moveInTargetDate?: Date | null;
  dateOfBirth?: Date | null;
  communicationNeeds?: string | null;
  hasPenPortrait: boolean;
  hasRiskAssessment: boolean;
};

export function profileGaps(profile: ProfileGapInput): ProfileGap[] {
  if (!isSupportOpen(profile.status)) return [];
  const gaps: ProfileGap[] = [];
  if (!profile.keyWorkerId) gaps.push('NO_KEY_WORKER');
  if (!profile.supportWorkerId) gaps.push('NO_SUPPORT_WORKER');
  if (!hasUsableContactRoute(profile)) gaps.push('NO_CONTACT_ROUTE');
  if (!profile.moveInTargetDate && supportPhase(profile.status) === 'PRE_SUPPORT') gaps.push('NO_MOVE_IN_DATE');
  if (!profile.dateOfBirth) gaps.push('NO_DATE_OF_BIRTH');
  if (!profile.hasPenPortrait) gaps.push('NO_PEN_PORTRAIT');
  if (!profile.hasRiskAssessment) gaps.push('NO_RISK_ASSESSMENT');
  if (!profile.communicationNeeds?.trim()) gaps.push('COMMUNICATION_NEEDS_MISSING');
  return gaps;
}

export const PROFILE_GAP_LABELS: Record<ProfileGap, string> = {
  NO_KEY_WORKER: 'No key worker allocated',
  NO_SUPPORT_WORKER: 'No support worker allocated',
  NO_CONTACT_ROUTE: 'No phone, email, or address recorded',
  NO_MOVE_IN_DATE: 'No move-in target date',
  NO_DATE_OF_BIRTH: 'No date of birth recorded',
  NO_PEN_PORTRAIT: 'No PEN portrait started',
  NO_RISK_ASSESSMENT: 'No risk assessment on file',
  COMMUNICATION_NEEDS_MISSING: 'Communication needs not recorded'
};

export function describeProfileGaps(gaps: ProfileGap[]): string[] {
  return gaps.map((gap) => PROFILE_GAP_LABELS[gap]);
}

/** A service user needs a supervisor's attention when several profile gaps stack up. */
export function profileGapScore(gaps: ProfileGap[]): number {
  const weights: Record<ProfileGap, number> = {
    NO_KEY_WORKER: 3,
    NO_RISK_ASSESSMENT: 3,
    NO_CONTACT_ROUTE: 3,
    NO_PEN_PORTRAIT: 2,
    NO_SUPPORT_WORKER: 2,
    NO_MOVE_IN_DATE: 1,
    NO_DATE_OF_BIRTH: 1,
    COMMUNICATION_NEEDS_MISSING: 1
  };
  return gaps.reduce((total, gap) => total + weights[gap], 0);
}


export function placementExitDueAt(admissionDate: Date | null | undefined, plannedSupportDays: number): Date | null {
  if (!admissionDate || plannedSupportDays <= 0) return null;
  return addDays(admissionDate, plannedSupportDays);
}
