import { addDays, daysBetween, isWithinDays } from './dates';

/** Risk assessments: scored likelihood x impact factors, the level a factor or assessment lands in,
 * and how often it must be reviewed. Scoring lives here so a risk level can never be set by hand
 * somewhere in the UI without the same rules being applied. */

export const RISK_ASSESSMENT_TYPES = ['SUPPORT', 'SAFEGUARDING', 'ENVIRONMENTAL', 'TENANCY', 'HEALTH_SAFETY', 'SUBSTANCE_USE'] as const;
export type RiskAssessmentType = (typeof RISK_ASSESSMENT_TYPES)[number];

export const RISK_ASSESSMENT_STATUSES = ['DRAFT', 'ACTIVE', 'REVIEW_DUE', 'SUPERSEDED', 'CLOSED'] as const;
export type RiskAssessmentStatus = (typeof RISK_ASSESSMENT_STATUSES)[number];

const assessmentTransitionMap: Record<RiskAssessmentStatus, RiskAssessmentStatus[]> = {
  DRAFT: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['REVIEW_DUE', 'SUPERSEDED', 'CLOSED'],
  REVIEW_DUE: ['ACTIVE', 'SUPERSEDED', 'CLOSED'],
  SUPERSEDED: ['CLOSED'],
  CLOSED: ['ACTIVE']
};

export function canTransitionRiskAssessment(from: string, to: string): boolean {
  return (assessmentTransitionMap[from as RiskAssessmentStatus] ?? []).includes(to as RiskAssessmentStatus);
}

export function assertRiskAssessmentTransition(from: string, to: string): void {
  if (!canTransitionRiskAssessment(from, to)) throw new Error(`Invalid risk assessment transition: ${from} -> ${to}`);
}

export const RISK_FACTOR_STATUSES = ['OPEN', 'CONTROLLED', 'MONITORING', 'CLOSED'] as const;
export type RiskFactorStatus = (typeof RISK_FACTOR_STATUSES)[number];

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Categories staff must be able to record. Safeguarding trigger categories force a referral. */
export const RISK_FACTOR_CATEGORIES: ReadonlyArray<{ key: string; label: string; safeguardingTrigger: boolean }> = [
  { key: 'SELF_HARM', label: 'Self-harm', safeguardingTrigger: true },
  { key: 'SUICIDAL_IDEATION', label: 'Suicidal ideation', safeguardingTrigger: true },
  { key: 'MENTAL_HEALTH', label: 'Mental health', safeguardingTrigger: false },
  { key: 'SUBSTANCE_USE', label: 'Substance use', safeguardingTrigger: false },
  { key: 'ALCOHOL_USE', label: 'Alcohol use', safeguardingTrigger: false },
  { key: 'PHYSICAL_HEALTH', label: 'Physical health', safeguardingTrigger: false },
  { key: 'MEDICATION', label: 'Medication', safeguardingTrigger: false },
  { key: 'DOMESTIC_ABUSE', label: 'Domestic abuse', safeguardingTrigger: true },
  { key: 'EXPLOITATION', label: 'Criminal or financial exploitation', safeguardingTrigger: true },
  { key: 'TRAFFICKING', label: 'Modern slavery or trafficking', safeguardingTrigger: true },
  { key: 'SEXUAL_EXPLOITATION', label: 'Sexual exploitation', safeguardingTrigger: true },
  { key: 'AGGRESSION', label: 'Aggression towards others', safeguardingTrigger: false },
  { key: 'VICTIMISATION', label: 'Victimisation or hate crime', safeguardingTrigger: true },
  { key: 'TENANCY', label: 'Tenancy or rent risk', safeguardingTrigger: false },
  { key: 'NEIGHBOUR_CONFLICT', label: 'Neighbour conflict', safeguardingTrigger: false },
  { key: 'HOARDING', label: 'Hoarding', safeguardingTrigger: false },
  { key: 'FIRE', label: 'Fire risk', safeguardingTrigger: false },
  { key: 'FALLS', label: 'Falls or mobility', safeguardingTrigger: false },
  { key: 'WANDERING', label: 'Going missing or wandering', safeguardingTrigger: true },
  { key: 'FINANCES', label: 'Financial difficulty', safeguardingTrigger: false },
  { key: 'ONLINE_SAFETY', label: 'Online safety', safeguardingTrigger: false },
  { key: 'DISCRIMINATION', label: 'Discrimination', safeguardingTrigger: true }
];

export function riskCategoryLabel(category: string): string {
  const match = RISK_FACTOR_CATEGORIES.find((entry) => entry.key === category);
  return match?.label ?? category.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function isSafeguardingTriggerCategory(category: string): boolean {
  return RISK_FACTOR_CATEGORIES.find((entry) => entry.key === category)?.safeguardingTrigger ?? false;
}

export const RISK_SCALE_MIN = 1;
export const RISK_SCALE_MAX = 5;

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return RISK_SCALE_MIN;
  return Math.min(RISK_SCALE_MAX, Math.max(RISK_SCALE_MIN, Math.round(value)));
}

export function riskScore(likelihood: number, impact: number): number {
  return clampScale(likelihood) * clampScale(impact);
}

/** Bands over the 1–25 scale: 1–4 low, 5–9 medium, 10–16 high, 17–25 critical. */
export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 17) return 'CRITICAL';
  if (score >= 10) return 'HIGH';
  if (score >= 5) return 'MEDIUM';
  return 'LOW';
}

export function normaliseRiskFactor(factor: { likelihood: number; impact: number }): { likelihood: number; impact: number; score: number; level: RiskLevel } {
  const likelihood = clampScale(factor.likelihood);
  const impact = clampScale(factor.impact);
  const score = likelihood * impact;
  return { likelihood, impact, score, level: riskLevelFromScore(score) };
}


export type RiskFactorRecord = { category: string; score: number; status?: string | null };

/** The overall level is driven by the highest open factor, never by an average. */
export function overallRiskLevel(factors: RiskFactorRecord[]): RiskLevel {
  const open = factors.filter((factor) => (factor.status ?? 'OPEN') !== 'CLOSED');
  if (!open.length) return 'LOW';
  return open.reduce<RiskLevel>((highest, factor) => {
    const level = riskLevelFromScore(factor.score);
    return RISK_LEVELS.indexOf(level) > RISK_LEVELS.indexOf(highest) ? level : highest;
  }, 'LOW');
}

/** A safeguarding referral is expected for a high-scoring trigger category, or any critical factor. */
export function requiresSafeguardingReferral(factors: RiskFactorRecord[]): boolean {
  return factors.some((factor) => {
    if ((factor.status ?? 'OPEN') === 'CLOSED') return false;
    if (riskLevelFromScore(factor.score) === 'CRITICAL') return true;
    return isSafeguardingTriggerCategory(factor.category) && factor.score >= 15;
  });
}

export function safeguardingTriggerReasons(factors: RiskFactorRecord[]): string[] {
  return factors
    .filter((factor) => (factor.status ?? 'OPEN') !== 'CLOSED')
    .filter((factor) => riskLevelFromScore(factor.score) === 'CRITICAL' || (isSafeguardingTriggerCategory(factor.category) && factor.score >= 15))
    .map((factor) => riskCategoryLabel(factor.category));
}

/** Review cadence by level: critical monthly, high quarterly, medium six-monthly, low annually. */
const reviewIntervalDays: Record<RiskLevel, number> = { CRITICAL: 30, HIGH: 90, MEDIUM: 182, LOW: 365 };

export function riskReviewDueAt(assessedAt: Date, level: string): Date {
  return addDays(assessedAt, reviewIntervalDays[level as RiskLevel] ?? reviewIntervalDays.MEDIUM);
}

export type RiskReviewState = 'CURRENT' | 'DUE_SOON' | 'OVERDUE';

export function riskReviewState(reviewDueAt: Date | null | undefined, now = new Date()): RiskReviewState {
  if (!reviewDueAt) return 'CURRENT';
  if (reviewDueAt.getTime() < now.getTime()) return 'OVERDUE';
  return isWithinDays(reviewDueAt, 14, now) ? 'DUE_SOON' : 'CURRENT';
}

export type RiskAssessmentSummary = {
  level: RiskLevel;
  openFactors: number;
  highestScore: number;
  dueAt: Date;
  reviewState: RiskReviewState;
  safeguardingReferralRequired: boolean;
  reasons: string[];
  daysSinceAssessment: number;
};

export function riskAssessmentSummary(factors: RiskFactorRecord[], assessedAt: Date, now = new Date()): RiskAssessmentSummary {
  const level = overallRiskLevel(factors);
  const open = factors.filter((factor) => (factor.status ?? 'OPEN') !== 'CLOSED');
  const dueAt = riskReviewDueAt(assessedAt, level);
  return {
    level,
    openFactors: open.length,
    highestScore: open.reduce((highest, factor) => Math.max(highest, factor.score), 0),
    dueAt,
    reviewState: riskReviewState(dueAt, now),
    safeguardingReferralRequired: requiresSafeguardingReferral(factors),
    reasons: safeguardingTriggerReasons(factors),
    daysSinceAssessment: daysBetween(assessedAt, now)
  };
}
