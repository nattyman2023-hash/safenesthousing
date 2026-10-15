import { addMonths, daysBetween, isPast, isWithinDays } from './dates';

/** Property compliance and policy resources: the evidence that the organisation is safe and
 * well-governed. Certificate cycles are held as data here so a renewed record automatically gets the
 * right next-due date, and overdue certificates surface in the same way as overdue tasks. */

export const PROPERTY_COMPLIANCE_TYPES = [
  'GAS_SAFETY',
  'ELECTRICAL_EICR',
  'LEGIONELLA',
  'FIRE_RISK_ASSESSMENT',
  'FIRE_ALARM',
  'EMERGENCY_LIGHTING',
  'SMOKE_CO_DETECTORS',
  'ASBESTOS',
  'PAT_TESTING',
  'LIFT',
  'WATER_TANK',
  'PEST_CONTROL',
  'ENERGY_PERFORMANCE',
  'INSURANCE'
] as const;
export type PropertyComplianceType = (typeof PROPERTY_COMPLIANCE_TYPES)[number];

/** Standard renewal cycle in months for each certificate type. */
export const COMPLIANCE_INTERVAL_MONTHS: Record<PropertyComplianceType, number> = {
  GAS_SAFETY: 12,
  ELECTRICAL_EICR: 60,
  LEGIONELLA: 24,
  FIRE_RISK_ASSESSMENT: 12,
  FIRE_ALARM: 12,
  EMERGENCY_LIGHTING: 12,
  SMOKE_CO_DETECTORS: 12,
  ASBESTOS: 60,
  PAT_TESTING: 12,
  LIFT: 6,
  WATER_TANK: 12,
  PEST_CONTROL: 12,
  ENERGY_PERFORMANCE: 120,
  INSURANCE: 12
};

export const COMPLIANCE_TYPE_LABELS: Record<PropertyComplianceType, string> = {
  GAS_SAFETY: 'Gas safety certificate',
  ELECTRICAL_EICR: 'Electrical installation condition report',
  LEGIONELLA: 'Legionella risk assessment',
  FIRE_RISK_ASSESSMENT: 'Fire risk assessment',
  FIRE_ALARM: 'Fire alarm service',
  EMERGENCY_LIGHTING: 'Emergency lighting test',
  SMOKE_CO_DETECTORS: 'Smoke and CO detector check',
  ASBESTOS: 'Asbestos survey',
  PAT_TESTING: 'Portable appliance testing',
  LIFT: 'Lift inspection',
  WATER_TANK: 'Water tank inspection',
  PEST_CONTROL: 'Pest control visit',
  ENERGY_PERFORMANCE: 'Energy performance certificate',
  INSURANCE: 'Building insurance renewal'
};

export function complianceTypeLabel(type: string): string {
  return COMPLIANCE_TYPE_LABELS[type as PropertyComplianceType] ?? type.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export const COMPLIANCE_STATUSES = ['DUE', 'BOOKED', 'COMPLETED', 'OVERDUE', 'EXEMPT', 'NOT_APPLICABLE'] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

const complianceTransitionMap: Record<ComplianceStatus, ComplianceStatus[]> = {
  DUE: ['BOOKED', 'COMPLETED', 'EXEMPT', 'NOT_APPLICABLE'],
  BOOKED: ['COMPLETED', 'DUE', 'OVERDUE'],
  COMPLETED: ['DUE', 'OVERDUE'],
  OVERDUE: ['BOOKED', 'COMPLETED', 'EXEMPT'],
  EXEMPT: ['DUE'],
  NOT_APPLICABLE: ['DUE']
};

export function canTransitionCompliance(from: string, to: string): boolean {
  return (complianceTransitionMap[from as ComplianceStatus] ?? []).includes(to as ComplianceStatus);
}

export function assertComplianceTransition(from: string, to: string): void {
  if (!canTransitionCompliance(from, to)) throw new Error(`Invalid compliance transition: ${from} -> ${to}`);
}

export function complianceIntervalMonths(type: string): number {
  return COMPLIANCE_INTERVAL_MONTHS[type as PropertyComplianceType] ?? 12;
}

/** Next due date after a check was completed, based on the certificate's own cycle. */
export function nextComplianceDueAt(type: string, lastCheckedAt: Date): Date {
  return addMonths(lastCheckedAt, complianceIntervalMonths(type));
}

export const COMPLIANCE_DUE_SOON_DAYS = 30;

export type ComplianceDueState = 'NOT_STARTED' | 'CURRENT' | 'DUE_SOON' | 'OVERDUE' | 'EXEMPT';

export function complianceDueState(
  record: { status: string; complianceType: string; lastCheckedAt?: Date | null; nextDueAt?: Date | null },
  now = new Date()
): ComplianceDueState {
  if (record.status === 'EXEMPT' || record.status === 'NOT_APPLICABLE') return 'EXEMPT';
  const dueAt = record.nextDueAt ?? (record.lastCheckedAt ? nextComplianceDueAt(record.complianceType, record.lastCheckedAt) : null);
  if (!dueAt) return 'NOT_STARTED';
  if (isPast(dueAt, now)) return 'OVERDUE';
  return isWithinDays(dueAt, COMPLIANCE_DUE_SOON_DAYS, now) ? 'DUE_SOON' : 'CURRENT';
}

export function complianceDueLabel(record: { status: string; complianceType: string; lastCheckedAt?: Date | null; nextDueAt?: Date | null }, now = new Date()): string {
  const state = complianceDueState(record, now);
  if (state === 'EXEMPT') return 'Exempt';
  if (state === 'NOT_STARTED') return 'No certificate on file';
  const dueAt = (record.nextDueAt ?? nextComplianceDueAt(record.complianceType, record.lastCheckedAt as Date)) as Date;
  const days = Math.round((dueAt.getTime() - now.getTime()) / 86_400_000);
  if (state === 'OVERDUE') return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days} day${days === 1 ? '' : 's'}`;
}

export function complianceAgeDays(record: { lastCheckedAt?: Date | null }, now = new Date()): number | null {
  return record.lastCheckedAt ? Math.max(0, daysBetween(record.lastCheckedAt, now)) : null;
}


export type ComplianceSummary = {
  total: number;
  overdue: number;
  dueSoon: number;
  exempt: number;
  missing: number;
  complianceRate: number;
  overdueTypes: string[];
};

export function summariseCompliance(
  records: Array<{ id?: string; propertyId?: string; status: string; complianceType: string; lastCheckedAt?: Date | null; nextDueAt?: Date | null }>,
  now = new Date()
): ComplianceSummary {
  let overdue = 0;
  let dueSoon = 0;
  let exempt = 0;
  let missing = 0;
  const overdueTypes: string[] = [];
  for (const record of records) {
    const state = complianceDueState(record, now);
    if (state === 'OVERDUE') {
      overdue += 1;
      overdueTypes.push(complianceTypeLabel(record.complianceType));
    } else if (state === 'DUE_SOON') dueSoon += 1;
    else if (state === 'EXEMPT') exempt += 1;
    else if (state === 'NOT_STARTED') missing += 1;
  }
  const assessable = records.length - exempt;
  return {
    total: records.length,
    overdue,
    dueSoon,
    exempt,
    missing,
    complianceRate: assessable > 0 ? Math.round(((assessable - overdue - missing) / assessable) * 100) : 100,
    overdueTypes
  };
}

/** Certificate types a property must hold, so gaps are visible before an audit finds them. */
export const REQUIRED_PROPERTY_COMPLIANCE_TYPES: readonly PropertyComplianceType[] = [
  'GAS_SAFETY',
  'ELECTRICAL_EICR',
  'FIRE_RISK_ASSESSMENT',
  'SMOKE_CO_DETECTORS',
  'LEGIONELLA'
];

export function missingComplianceTypes(records: Array<{ complianceType: string; status: string }>): string[] {
  const exempt = new Set(records.filter((record) => record.status === 'EXEMPT' || record.status === 'NOT_APPLICABLE').map((record) => record.complianceType));
  const held = new Set(records.map((record) => record.complianceType));
  return REQUIRED_PROPERTY_COMPLIANCE_TYPES.filter((type) => !held.has(type) && !exempt.has(type)).map((type) => complianceTypeLabel(type));
}

// ---------------------------------------------------------------------------
// Policy and resource library
// ---------------------------------------------------------------------------

export const POLICY_CATEGORIES = ['POLICY', 'PROCEDURE', 'GUIDANCE', 'FORM', 'LEGAL', 'TRAINING', 'CONTRACT', 'RESOURCE'] as const;
export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

export const POLICY_CATEGORY_LABELS: Record<PolicyCategory, string> = {
  POLICY: 'Policy',
  PROCEDURE: 'Procedure',
  GUIDANCE: 'Guidance',
  FORM: 'Form',
  LEGAL: 'Legal or regulatory',
  TRAINING: 'Training material',
  CONTRACT: 'Contract or agreement',
  RESOURCE: 'Resource'
};

export const POLICY_STATUSES = ['DRAFT', 'ACTIVE', 'UNDER_REVIEW', 'SUPERSEDED', 'ARCHIVED'] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

const policyTransitionMap: Record<PolicyStatus, PolicyStatus[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['UNDER_REVIEW', 'SUPERSEDED', 'ARCHIVED'],
  UNDER_REVIEW: ['ACTIVE', 'SUPERSEDED', 'ARCHIVED'],
  SUPERSEDED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT']
};

export function canTransitionPolicy(from: string, to: string): boolean {
  return (policyTransitionMap[from as PolicyStatus] ?? []).includes(to as PolicyStatus);
}

export function assertPolicyTransition(from: string, to: string): void {
  if (!canTransitionPolicy(from, to)) throw new Error(`Invalid policy transition: ${from} -> ${to}`);
}

/** Policies are reviewed annually unless the record states otherwise. */
export const POLICY_REVIEW_MONTHS = 12;

export function nextPolicyReviewDue(effectiveFrom: Date, months = POLICY_REVIEW_MONTHS): Date {
  return addMonths(effectiveFrom, months);
}

export type PolicyReviewState = 'DRAFT' | 'ARCHIVED' | 'CURRENT' | 'DUE_SOON' | 'OVERDUE' | 'NOT_SET';

export function policyReviewState(
  policy: { status: string; effectiveFrom?: Date | null; reviewDueAt?: Date | null },
  now = new Date()
): PolicyReviewState {
  if (policy.status === 'DRAFT') return 'DRAFT';
  if (policy.status === 'ARCHIVED') return 'ARCHIVED';
  const dueAt = policy.reviewDueAt ?? (policy.effectiveFrom ? nextPolicyReviewDue(policy.effectiveFrom) : null);
  if (!dueAt) return 'NOT_SET';
  if (isPast(dueAt, now)) return 'OVERDUE';
  return isWithinDays(dueAt, 60, now) ? 'DUE_SOON' : 'CURRENT';
}

export function isPolicyLive(policy: { status: string; reviewDueAt?: Date | null; effectiveFrom?: Date | null }, now = new Date()): boolean {
  if (policy.status !== 'ACTIVE' && policy.status !== 'UNDER_REVIEW') return false;
  return policyReviewState(policy, now) !== 'OVERDUE';
}

export type PolicySummary = {
  total: number;
  active: number;
  drafts: number;
  dueSoon: number;
  overdue: number;
  requiresRead: number;
  byCategory: Record<string, number>;
};

export function summarisePolicies(
  policies: Array<{ status: string; category: string; effectiveFrom?: Date | null; reviewDueAt?: Date | null; requiresRead?: boolean }>,
  now = new Date()
): PolicySummary {
  const byCategory: Record<string, number> = {};
  let active = 0;
  let drafts = 0;
  let dueSoon = 0;
  let overdue = 0;
  let requiresRead = 0;
  for (const policy of policies) {
    byCategory[policy.category] = (byCategory[policy.category] ?? 0) + 1;
    if (policy.requiresRead) requiresRead += 1;
    if (policy.status === 'DRAFT') drafts += 1;
    if (policy.status === 'ACTIVE') active += 1;
    const state = policyReviewState(policy, now);
    if (state === 'OVERDUE') overdue += 1;
    else if (state === 'DUE_SOON') dueSoon += 1;
  }
  return { total: policies.length, active, drafts, dueSoon, overdue, requiresRead, byCategory };
}
