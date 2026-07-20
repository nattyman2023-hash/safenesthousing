import { audit } from './audit';
import { db } from './db';

export const OPEN_SUBJECT_REQUEST_STATUSES = ['OPEN', 'IN_REVIEW', 'ACTION_REQUIRED', 'ON_HOLD'] as const;

type SubjectRequestReference = { subjectRef: string; legalHold: boolean };
type Candidate = { identities: string[]; createdAt: Date; retentionUntil?: Date | null };

export type RetentionRuleReview = {
  resourceType: string;
  retentionDays: number;
  candidates: number;
  excludedByLegalHold: number;
  excludedByOpenRequest: number;
  excludedByBoth: number;
  reviewableCandidates: number;
  policyReferencePresent: boolean;
};

export type RetentionReviewSummary = {
  mode: 'DRY_RUN';
  asOf: string;
  rulesEvaluated: number;
  invalidRules: string[];
  totalCandidates: number;
  totalReviewableCandidates: number;
  totalExcludedByLegalHold: number;
  totalExcludedByOpenRequest: number;
  totalExcludedByBoth: number;
  openSubjectRequests: number;
  rules: RetentionRuleReview[];
};

export function isRetentionDue(createdAt: Date, retentionDays: number, now: Date, retentionUntil?: Date | null) {
  if (retentionUntil && retentionUntil.getTime() > now.getTime()) return false;
  return createdAt.getTime() <= now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
}

function hasReference(candidate: Candidate, requests: SubjectRequestReference[]) {
  return requests.some((request) => candidate.identities.includes(request.subjectRef));
}

function getDueCandidates(candidates: Candidate[], retentionDays: number, now: Date) {
  return candidates.filter((candidate) => isRetentionDue(candidate.createdAt, retentionDays, now, candidate.retentionUntil));
}

async function candidatesFor(resourceType: string, organisationId: string): Promise<Candidate[]> {
  switch (resourceType) {
    case 'ContactSubmission': {
      const rows = await db.contactSubmission.findMany({ where: { organisationId }, select: { id: true, createdAt: true, retentionUntil: true } });
      return rows.map((row) => ({ identities: [row.id], createdAt: row.createdAt, retentionUntil: row.retentionUntil }));
    }
    case 'Referral': {
      const rows = await db.referral.findMany({ where: { organisationId }, select: { id: true, reference: true, createdAt: true } });
      return rows.map((row) => ({ identities: [row.id, row.reference], createdAt: row.createdAt }));
    }
    case 'Client': {
      const rows = await db.client.findMany({ where: { organisationId }, select: { id: true, reference: true, createdAt: true } });
      return rows.map((row) => ({ identities: [row.id, row.reference], createdAt: row.createdAt }));
    }
    case 'CaseNote': {
      const rows = await db.caseNote.findMany({ where: { client: { organisationId } }, select: { id: true, createdAt: true, client: { select: { reference: true } } } });
      return rows.map((row) => ({ identities: [row.id, row.client.reference], createdAt: row.createdAt }));
    }
    case 'Incident': {
      const rows = await db.incident.findMany({ where: { organisationId }, select: { id: true, reference: true, createdAt: true, client: { select: { reference: true } } } });
      return rows.map((row) => ({ identities: [row.id, row.reference, ...(row.client ? [row.client.reference] : [])], createdAt: row.createdAt }));
    }
    case 'Document': {
      const rows = await db.document.findMany({ where: { organisationId }, select: { id: true, createdAt: true, referralLinks: { select: { referral: { select: { reference: true } } } } } });
      return rows.map((row) => ({ identities: [row.id, ...row.referralLinks.map((link) => link.referral.reference)], createdAt: row.createdAt }));
    }
    case 'AuditLog': {
      const rows = await db.auditLog.findMany({ where: { organisationId }, select: { id: true, resourceId: true, createdAt: true } });
      return rows.map((row) => ({ identities: [row.id, ...(row.resourceId ? [row.resourceId] : [])], createdAt: row.createdAt }));
    }
    default:
      return [];
  }
}

export async function runRetentionReview(input: { organisationId: string; triggeredBy?: string; now?: Date }) {
  const startedAt = input.now ?? new Date();
  const [rules, requests] = await Promise.all([
    db.dataRetentionRule.findMany({ where: { organisationId: input.organisationId, active: true }, orderBy: { resourceType: 'asc' } }),
    db.dataSubjectRequest.findMany({ where: { organisationId: input.organisationId, status: { in: [...OPEN_SUBJECT_REQUEST_STATUSES] } }, select: { subjectRef: true, legalHold: true } })
  ]);
  const openRequests = requests.filter((request) => !request.legalHold);
  const legalHoldRequests = requests.filter((request) => request.legalHold);
  const reviewedRules: RetentionRuleReview[] = [];
  const invalidRules: string[] = [];
  for (const rule of rules) {
    if (!rule.legalBasisNote?.trim()) {
      invalidRules.push(rule.resourceType);
      continue;
    }
    const dueCandidates = getDueCandidates(await candidatesFor(rule.resourceType, input.organisationId), rule.retentionDays, startedAt);
    let excludedByLegalHold = 0;
    let excludedByOpenRequest = 0;
    let excludedByBoth = 0;
    let reviewableCandidates = 0;
    for (const candidate of dueCandidates) {
      const legalHold = hasReference(candidate, legalHoldRequests);
      const openRequest = hasReference(candidate, openRequests);
      if (legalHold) excludedByLegalHold++;
      if (openRequest) excludedByOpenRequest++;
      if (legalHold && openRequest) excludedByBoth++;
      if (!legalHold && !openRequest) reviewableCandidates++;
    }
    reviewedRules.push({ resourceType: rule.resourceType, retentionDays: rule.retentionDays, candidates: dueCandidates.length, excludedByLegalHold, excludedByOpenRequest, excludedByBoth, reviewableCandidates, policyReferencePresent: true });
  }
  const summary: RetentionReviewSummary = {
    mode: 'DRY_RUN',
    asOf: startedAt.toISOString(),
    rulesEvaluated: reviewedRules.length,
    invalidRules,
    totalCandidates: reviewedRules.reduce((total, rule) => total + rule.candidates, 0),
    totalReviewableCandidates: reviewedRules.reduce((total, rule) => total + rule.reviewableCandidates, 0),
    totalExcludedByLegalHold: reviewedRules.reduce((total, rule) => total + rule.excludedByLegalHold, 0),
    totalExcludedByOpenRequest: reviewedRules.reduce((total, rule) => total + rule.excludedByOpenRequest, 0),
    totalExcludedByBoth: reviewedRules.reduce((total, rule) => total + rule.excludedByBoth, 0),
    openSubjectRequests: requests.length,
    rules: reviewedRules
  };
  const completedAt = new Date();
  const run = await db.dataRetentionReviewRun.create({ data: { organisationId: input.organisationId, triggeredBy: input.triggeredBy, mode: 'DRY_RUN', status: 'COMPLETED', startedAt, completedAt, summaryJson: JSON.stringify(summary) } });
  await audit({ organisationId: input.organisationId, actorId: input.triggeredBy, action: 'RETENTION_REVIEW_RUN', resourceType: 'DataRetentionReviewRun', resourceId: run.id, after: { mode: summary.mode, rulesEvaluated: summary.rulesEvaluated, invalidRules: summary.invalidRules, totalCandidates: summary.totalCandidates, totalReviewableCandidates: summary.totalReviewableCandidates, totalExcludedByLegalHold: summary.totalExcludedByLegalHold, totalExcludedByOpenRequest: summary.totalExcludedByOpenRequest, openSubjectRequests: summary.openSubjectRequests } });
  return { run, summary };
}

export function parseRetentionReviewSummary(summaryJson: string): RetentionReviewSummary | null {
  try {
    const parsed = JSON.parse(summaryJson) as RetentionReviewSummary;
    return parsed.mode === 'DRY_RUN' && Array.isArray(parsed.rules) ? parsed : null;
  } catch {
    return null;
  }
}
