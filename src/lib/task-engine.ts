import { db } from './db';
import { audit } from './audit';
import { daysBetween, endOfDay, isWithinDays } from './dates';
import { contactComplianceState, nextContactDueAt } from './contact-tracking';
import { nextSafeWellDueAt, safeWellDueState } from './safe-well';
import { riskReviewDueAt, riskReviewState } from './risk-domain';
import { nextPenPortraitReviewDue, penPortraitReviewState } from './pen-portrait';
import { normaliseContactFrequency, normaliseSafeWellFrequency } from './support-domain';
import { CLOSED_TASK_STATUSES, defaultTaskDueAt, isTaskClosed, taskAutomationKey, type TaskSource } from './task-workflow';

/** The task automation engine. Every piece of recurring support work (planned contact, Safe & Well
 * checks, risk reviews, support plan reviews, PEN portrait reviews) is generated here from the
 * service user's own profile and records, so the work queue reflects policy without anyone having to
 * remember it. Generation is idempotent: each draft carries a deterministic `automationKey`, and at
 * most one open automated task per client and category is ever tracked. The planning half of this
 * module is pure and unit tested; only `runTaskAutomation` touches the database. */

/** Automation deliberately only looks at service users who are currently in a placement. Waitlisted
 * or archived records are not yet owed routine support, so no work is raised for them. */
export const AUTOMATION_CLIENT_STATUSES: readonly string[] = ['CURRENT'];

export type AutomationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type AutomationCategory = 'CONTACT_DUE' | 'SAFE_WELL_DUE' | 'RISK_REVIEW' | 'SUPPORT_PLAN_REVIEW' | 'PEN_PORTRAIT';

export const AUTOMATION_CATEGORY_LABELS: Record<AutomationCategory, string> = {
  CONTACT_DUE: 'Planned contact',
  SAFE_WELL_DUE: 'Safe & Well check',
  RISK_REVIEW: 'Risk assessment review',
  SUPPORT_PLAN_REVIEW: 'Support plan review',
  PEN_PORTRAIT: 'PEN portrait review'
};

/** A single unit of generated work, ready to be written to the Task table. */
export type AutomationTaskDraft = {
  automationKey: string;
  title: string;
  description: string;
  priority: AutomationPriority;
  dueAt: Date;
  status: 'OPEN';
  department: 'SUPPORT';
  category: AutomationCategory;
  source: Extract<TaskSource, 'AUTOMATION'>;
  clientId: string;
  assignedToId: string | null;
  relatedType: string;
  relatedId: string | null;
};

/** Everything the engine needs to know about one service user. Assembled from the profile, case
 * notes, Safe & Well checks, risk assessments, support plan, and PEN portrait. */
export type ClientAutomationSnapshot = {
  clientId: string;
  clientName: string;
  restricted: boolean;
  assignedToId: string | null;
  contactFrequencyDays: number | null;
  safeWellFrequencyDays: number | null;
  lastSupportContactAt: Date | null;
  lastSafeWellCompletedAt: Date | null;
  riskLevel: string | null;
  riskAssessment: { id: string; assessmentType: string; level: string; status: string; assessedAt: Date; reviewDueAt: Date | null } | null;
  supportPlan: { id: string; reviewDate: Date | null } | null;
  penPortrait: { id: string; status: string; completedAt: Date | null; reviewDueAt: Date | null } | null;
};

/** Reviews are surfaced a fortnight before they fall due, matching the risk review window. */
export const AUTOMATION_REVIEW_WINDOW_DAYS = 14;
/** Support plan reviews are planned further ahead because they need goal progress first. */
export const SUPPORT_PLAN_REVIEW_WINDOW_DAYS = 30;

/** How the label for a service user reads on generated work. Restricted records never carry the
 * person's name on a task title, in line with the safeguarding storage rules. */
function subjectLabel(snapshot: ClientAutomationSnapshot): string {
  return snapshot.restricted ? 'restricted service user' : snapshot.clientName;
}

/** Overdue work is high priority; anything critical or high risk escalates to urgent so it is worked
 * the same day. Work that is merely due soon sits at medium. */
function automationPriority(input: { overdue: boolean; riskLevel?: string | null }): AutomationPriority {
  const level = (input.riskLevel ?? '').toUpperCase();
  const elevated = level === 'HIGH' || level === 'CRITICAL';
  if (input.overdue) return elevated ? 'URGENT' : 'HIGH';
  return 'MEDIUM';
}

function draft(input: {
  snapshot: ClientAutomationSnapshot;
  category: AutomationCategory;
  summary: string;
  priority: AutomationPriority;
  dueAt: Date;
  relatedType: string;
  relatedId: string | null;
  now: Date;
}): AutomationTaskDraft {
  const dueAt = endOfDay(input.dueAt);
  const overdue = dueAt.getTime() < input.now.getTime();
  return {
    automationKey: taskAutomationKey({ category: input.category, scopeId: input.snapshot.clientId, dueAt: input.dueAt }),
    title: `${AUTOMATION_CATEGORY_LABELS[input.category]} — ${subjectLabel(input.snapshot)}`,
    description: `${input.summary} ${overdue ? 'This is already overdue.' : 'Due by the date shown.'}`.trim(),
    priority: input.priority,
    dueAt,
    status: 'OPEN',
    department: 'SUPPORT',
    category: input.category,
    source: 'AUTOMATION',
    clientId: input.snapshot.clientId,
    assignedToId: input.snapshot.assignedToId,
    relatedType: input.relatedType,
    relatedId: input.relatedId
  };
}

/** Plans the work a single service user is owed right now. Returns nothing when the profile is on
 * track, so a routine run only ever creates work that policy actually requires. */
export function planClientAutomation(snapshot: ClientAutomationSnapshot, now = new Date()): AutomationTaskDraft[] {
  const drafts: AutomationTaskDraft[] = [];
  const contactFrequency = normaliseContactFrequency(snapshot.contactFrequencyDays);
  const safeWellFrequency = normaliseSafeWellFrequency(snapshot.safeWellFrequencyDays);

  if (!snapshot.lastSupportContactAt) {
    drafts.push(draft({
      snapshot,
      category: 'CONTACT_DUE',
      summary: 'No meaningful contact has been recorded yet, so the first planned contact is due.',
      priority: 'HIGH',
      dueAt: defaultTaskDueAt('HIGH', now),
      relatedType: 'CLIENT',
      relatedId: null,
      now
    }));
  } else {
    const state = contactComplianceState({ lastContactAt: snapshot.lastSupportContactAt, frequencyDays: contactFrequency, now });
    if (state === 'OVERDUE' || state === 'DUE_SOON') {
      const dueAt = nextContactDueAt(snapshot.lastSupportContactAt, contactFrequency) as Date;
      const daysSince = daysBetween(snapshot.lastSupportContactAt, now);
      drafts.push(draft({
        snapshot,
        category: 'CONTACT_DUE',
        summary: `Planned contact is set at every ${contactFrequency} day${contactFrequency === 1 ? '' : 's'}; the last meaningful contact was ${daysSince} day${daysSince === 1 ? '' : 's'} ago.`,
        priority: automationPriority({ overdue: state === 'OVERDUE', riskLevel: snapshot.riskLevel }),
        dueAt,
        relatedType: 'CLIENT',
        relatedId: null,
        now
      }));
    }
  }

  if (!snapshot.lastSafeWellCompletedAt) {
    drafts.push(draft({
      snapshot,
      category: 'SAFE_WELL_DUE',
      summary: 'No Safe & Well check has been recorded yet, so the first check is due.',
      priority: 'HIGH',
      dueAt: defaultTaskDueAt('HIGH', now),
      relatedType: 'CLIENT',
      relatedId: null,
      now
    }));
  } else {
    const dueAt = nextSafeWellDueAt(snapshot.lastSafeWellCompletedAt, safeWellFrequency) as Date;
    const state = safeWellDueState({ lastCompletedAt: snapshot.lastSafeWellCompletedAt, frequencyDays: safeWellFrequency, nextDueAt: dueAt, now });
    if (state === 'OVERDUE' || state === 'DUE_SOON') {
      drafts.push(draft({
        snapshot,
        category: 'SAFE_WELL_DUE',
        summary: `A Safe & Well check is required every ${safeWellFrequency} day${safeWellFrequency === 1 ? '' : 's'} using the frequency on the service user profile.`,
        priority: automationPriority({ overdue: state === 'OVERDUE', riskLevel: snapshot.riskLevel }),
        dueAt,
        relatedType: 'CLIENT',
        relatedId: null,
        now
      }));
    }
  }

  const assessment = snapshot.riskAssessment;
  if (assessment && ['ACTIVE', 'REVIEW_DUE'].includes(assessment.status)) {
    const dueAt = assessment.reviewDueAt ?? riskReviewDueAt(assessment.assessedAt, assessment.level);
    const state = riskReviewState(dueAt, now);
    if (state === 'OVERDUE' || state === 'DUE_SOON') {
      drafts.push(draft({
        snapshot,
        category: 'RISK_REVIEW',
        summary: `The ${assessment.assessmentType} risk assessment is at ${assessment.level} and its review date has arrived.`,
        priority: automationPriority({ overdue: state === 'OVERDUE', riskLevel: assessment.level }),
        dueAt,
        relatedType: 'RISK_ASSESSMENT',
        relatedId: assessment.id,
        now
      }));
    }
  }

  const plan = snapshot.supportPlan;
  if (plan?.reviewDate) {
    const overdue = plan.reviewDate.getTime() < now.getTime();
    const dueSoon = isWithinDays(plan.reviewDate, SUPPORT_PLAN_REVIEW_WINDOW_DAYS, now);
    if (overdue || dueSoon) {
      drafts.push(draft({
        snapshot,
        category: 'SUPPORT_PLAN_REVIEW',
        summary: 'The active support plan is due for review with the service user.',
        priority: automationPriority({ overdue, riskLevel: snapshot.riskLevel }),
        dueAt: plan.reviewDate,
        relatedType: 'SUPPORT_PLAN',
        relatedId: plan.id,
        now
      }));
    }
  }

  const portrait = snapshot.penPortrait;
  if (portrait) {
    const dueAt = portrait.reviewDueAt ?? (portrait.completedAt ? nextPenPortraitReviewDue(portrait.completedAt) : null);
    if (dueAt) {
      const state = penPortraitReviewState({ reviewDueAt: dueAt, completedAt: portrait.completedAt, now });
      if (state === 'OVERDUE' || state === 'DUE_SOON') {
        drafts.push(draft({
          snapshot,
          category: 'PEN_PORTRAIT',
          summary: 'The PEN portrait is reviewed at least annually and is due to be refreshed with the service user.',
          priority: automationPriority({ overdue: state === 'OVERDUE', riskLevel: snapshot.riskLevel }),
          dueAt,
          relatedType: 'PEN_PORTRAIT',
          relatedId: portrait.id,
          now
        }));
      }
    }
  }

  return drafts.sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime() || left.automationKey.localeCompare(right.automationKey));
}

/** Plans work for a whole caseload in a stable due-date order. */
export function planAutomationTasks(snapshots: ClientAutomationSnapshot[], now = new Date()): AutomationTaskDraft[] {
  return snapshots
    .flatMap((snapshot) => planClientAutomation(snapshot, now))
    .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime() || left.automationKey.localeCompare(right.automationKey));
}

/** The minimum Task shape needed to decide whether generated work is already being tracked. */
export type TrackedTask = { category: string; clientId: string | null; status: string; automationKey: string | null };

/** Idempotency guard. A draft is dropped when its automation key already exists (the run has been
 * done before) or when an open task of the same category already points at the same service user,
 * so a change of frequency cannot spawn a second request for work someone is already doing. */
export function filterNewAutomationTasks(drafts: AutomationTaskDraft[], tracked: TrackedTask[]) {
  const knownKeys = new Set(tracked.map((task) => task.automationKey).filter((key): key is string => !!key));
  const openScopes = new Set(tracked
    .filter((task) => !isTaskClosed(task.status) && !!task.clientId)
    .map((task) => `${task.category.toUpperCase()}:${task.clientId}`));
  const fresh: AutomationTaskDraft[] = [];
  const existing: AutomationTaskDraft[] = [];
  for (const candidate of drafts) {
    if (knownKeys.has(candidate.automationKey) || openScopes.has(`${candidate.category}:${candidate.clientId}`)) existing.push(candidate);
    else fresh.push(candidate);
  }
  return { fresh, existing };
}

/** Assembles the snapshot the planner needs for one service user from a Prisma client row. */
export type ClientAutomationRow = {
  id: string;
  displayName: string;
  restricted: boolean;
  keyWorkerId: string | null;
  supportWorkerId: string | null;
  contactFrequencyDays: number;
  safeWellFrequencyDays: number;
  riskLevel: string;
  caseNotes: Array<{ occurredAt: Date }>;
  safeWellChecks: Array<{ completedAt: Date | null }>;
  riskAssessments: Array<{ id: string; assessmentType: string; level: string; status: string; assessedAt: Date; reviewDueAt: Date | null }>;
  supportPlans: Array<{ id: string; reviewDate: Date | null }>;
  penPortrait: { id: string; status: string; completedAt: Date | null; reviewDueAt: Date | null } | null;
};

export function snapshotFromClientRow(client: ClientAutomationRow): ClientAutomationSnapshot {
  return {
    clientId: client.id,
    clientName: client.displayName,
    restricted: client.restricted,
    assignedToId: client.keyWorkerId ?? client.supportWorkerId ?? null,
    contactFrequencyDays: client.contactFrequencyDays,
    safeWellFrequencyDays: client.safeWellFrequencyDays,
    lastSupportContactAt: client.caseNotes[0]?.occurredAt ?? null,
    lastSafeWellCompletedAt: client.safeWellChecks[0]?.completedAt ?? null,
    riskLevel: client.riskLevel,
    riskAssessment: client.riskAssessments[0] ?? null,
    supportPlan: client.supportPlans[0] ?? null,
    penPortrait: client.penPortrait
  };
}

export type TaskAutomationResult = {
  evaluatedClients: number;
  planned: number;
  created: number;
  skipped: number;
  failed: number;
  byCategory: Record<string, number>;
};

/** Generates the recurring support work an organisation is owed right now and writes it into the
 * work queue. Safe to run repeatedly: only work that is not already tracked is created. */
export async function runTaskAutomation(input: { organisationId: string; now?: Date }): Promise<TaskAutomationResult> {
  const now = input.now ?? new Date();
  const clients = await db.client.findMany({
    where: { organisationId: input.organisationId, status: { in: [...AUTOMATION_CLIENT_STATUSES] } },
    select: {
      id: true,
      displayName: true,
      restricted: true,
      keyWorkerId: true,
      supportWorkerId: true,
      contactFrequencyDays: true,
      safeWellFrequencyDays: true,
      riskLevel: true,
      caseNotes: { where: { completed: true, meaningful: true }, orderBy: { occurredAt: 'desc' }, take: 1, select: { occurredAt: true } },
      safeWellChecks: { where: { status: { in: ['COMPLETED', 'CONCERN_RAISED'] } }, orderBy: { completedAt: 'desc' }, take: 1, select: { completedAt: true } },
      riskAssessments: { where: { status: { in: ['ACTIVE', 'REVIEW_DUE'] } }, orderBy: { assessedAt: 'desc' }, take: 1, select: { id: true, assessmentType: true, level: true, status: true, assessedAt: true, reviewDueAt: true } },
      supportPlans: { where: { status: 'ACTIVE' }, orderBy: { version: 'desc' }, take: 1, select: { id: true, reviewDate: true } },
      penPortrait: { select: { id: true, status: true, completedAt: true, reviewDueAt: true } }
    }
  });

  const snapshots = clients.map((client) => snapshotFromClientRow(client));
  const planned = planAutomationTasks(snapshots, now);
  const tracked = await db.task.findMany({
    where: {
      organisationId: input.organisationId,
      OR: [{ automationKey: { not: null } }, { status: { notIn: [...CLOSED_TASK_STATUSES] } }]
    },
    select: { category: true, clientId: true, status: true, automationKey: true }
  });
  const { fresh, existing } = filterNewAutomationTasks(planned, tracked);

  const byCategory: Record<string, number> = {};
  let created = 0;
  let failed = 0;
  for (const item of fresh) {
    try {
      await db.task.create({ data: {
        organisationId: input.organisationId,
        title: item.title,
        description: item.description,
        priority: item.priority,
        dueAt: item.dueAt,
        status: item.status,
        assignedToId: item.assignedToId ?? undefined,
        clientId: item.clientId,
        department: item.department,
        category: item.category,
        source: item.source,
        automationKey: item.automationKey,
        relatedType: item.relatedType,
        relatedId: item.relatedId ?? undefined
      } });
      created += 1;
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    } catch {
      /* A concurrent run may have inserted the same automation key first. The unique index makes that
       * harmless — the work is already tracked — so the draft is counted as skipped, never retried. */
      failed += 1;
    }
  }

  const result: TaskAutomationResult = {
    evaluatedClients: snapshots.length,
    planned: planned.length,
    created,
    skipped: existing.length,
    failed,
    byCategory
  };
  await audit({ organisationId: input.organisationId, action: 'TASK_AUTOMATION_RUN', resourceType: 'Task', after: result });
  return result;
}
