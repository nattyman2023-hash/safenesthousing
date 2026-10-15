import { DAY_MS, addDays, addMonths, dayKey, endOfDay, endOfWeek, isSameDay, startOfDay } from './dates';

/** Task workflow rules for the support & housing workspace: departments, work categories,
 * audit-friendly status transitions, recurrence, and the queues behind the My work / Team / All
 * dashboard filters. Pure domain logic — no database access, no rendering. */

export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses that close a task out; these are never counted as overdue or part of a work queue. */
export const CLOSED_TASK_STATUSES: TaskStatus[] = ['DONE', 'CANCELLED'];

const taskTransitionMap: Record<TaskStatus, TaskStatus[]> = {
  OPEN: ['IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'],
  IN_PROGRESS: ['OPEN', 'BLOCKED', 'DONE', 'CANCELLED'],
  BLOCKED: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  DONE: ['OPEN'],
  CANCELLED: ['OPEN']
};

export function canTransitionTask(from: string, to: string): boolean {
  return (taskTransitionMap[from as TaskStatus] ?? []).includes(to as TaskStatus);
}

export function nextTaskStatuses(status: string): TaskStatus[] {
  return taskTransitionMap[status as TaskStatus] ?? [];
}

export function assertTaskTransition(from: string, to: string): void {
  if (!canTransitionTask(from, to)) throw new Error(`Invalid task transition: ${from} -> ${to}`);
}

export function isTaskClosed(status: string): boolean {
  return CLOSED_TASK_STATUSES.includes(status as TaskStatus);
}

export const TASK_DEPARTMENTS = ['SUPPORT', 'HOUSING', 'MAINTENANCE', 'FINANCE', 'COMPLIANCE', 'GOVERNANCE'] as const;
export type TaskDepartment = (typeof TASK_DEPARTMENTS)[number];

/** Work categories per department. `GENERAL` is always available as a catch-all. */
export const TASK_CATEGORIES: Record<TaskDepartment, readonly string[]> = {
  SUPPORT: ['GENERAL', 'CONTACT_DUE', 'SAFE_WELL_DUE', 'SUPPORT_PLAN_REVIEW', 'PEN_PORTRAIT', 'MOVE_CHECKLIST', 'RISK_REVIEW', 'APPOINTMENT'],
  HOUSING: ['GENERAL', 'MOVE_IN', 'MOVE_ON', 'ROOM_READY', 'TENANCY', 'OCCUPANCY'],
  MAINTENANCE: ['GENERAL', 'REPAIR', 'COMPLIANCE_CERTIFICATE', 'SAFETY', 'INSPECTION'],
  FINANCE: ['GENERAL', 'HOUSING_BENEFIT', 'INVOICE', 'PAYMENT', 'ARREARS'],
  COMPLIANCE: ['GENERAL', 'POLICY_REVIEW', 'AUDIT_ACTION', 'TRAINING', 'RETENTION'],
  GOVERNANCE: ['GENERAL', 'COMPLAINT', 'CONCERN', 'SUBJECT_REQUEST', 'INCIDENT_REVIEW', 'SAFEGUARDING']
};

export function taskCategoryOptions(department: string): readonly string[] {
  return TASK_CATEGORIES[department as TaskDepartment] ?? ['GENERAL'];
}

export function isTaskCategoryValid(department: string, category: string): boolean {
  return taskCategoryOptions(department).includes(category);
}

/** How a task came into existence; automations set `source` so generated work is auditable. */
export const TASK_SOURCES = ['MANUAL', 'AUTOMATION', 'RECURRENCE', 'WORKFLOW'] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

/** Working targets, in hours from creation, used when an automation raises a task without a date. */
const priorityDueHours: Record<string, number> = { URGENT: 4, HIGH: 24, MEDIUM: 72, LOW: 168 };

export function defaultTaskDueAt(priority: string, from = new Date()): Date {
  const hours = priorityDueHours[priority] ?? priorityDueHours.MEDIUM;
  return new Date(from.getTime() + hours * 3_600_000);
}

export const TASK_RECURRENCE_RULES = ['NONE', 'DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'INTERVAL_DAYS'] as const;
export type TaskRecurrenceRule = (typeof TASK_RECURRENCE_RULES)[number];

/** Advances a recurring due date. Returns null when the task does not recur. `INTERVAL_DAYS`
 * requires a positive `intervalDays`, otherwise the rule cannot be scheduled. */
export function advanceTaskDueAt(from: Date, rule: string, intervalDays?: number | null): Date | null {
  switch (rule as TaskRecurrenceRule) {
    case 'DAILY': return addDays(from, 1);
    case 'WEEKLY': return addDays(from, 7);
    case 'FORTNIGHTLY': return addDays(from, 14);
    case 'MONTHLY': return addMonths(from, 1);
    case 'QUARTERLY': return addMonths(from, 3);
    case 'INTERVAL_DAYS': return intervalDays && intervalDays > 0 ? addDays(from, intervalDays) : null;
    default: return null;
  }
}

/** Deterministic key for generated work (contact due, Safe & Well due, reviews...). Stored on
 * `Task.automationKey`, which is unique per organisation, so repeat runs never duplicate work. */
export function taskAutomationKey(input: { category: string; scopeId: string; dueAt?: Date | string | null }): string {
  const due = input.dueAt ? dayKey(new Date(input.dueAt)) : 'none';
  return [input.category.toUpperCase(), input.scopeId, due].join(':');
}


export function isTaskOverdue(task: { dueAt: Date | null; status: string }, now = new Date()): boolean {
  return !isTaskClosed(task.status) && !!task.dueAt && task.dueAt.getTime() < now.getTime();
}

/** Which slice of the work queue the viewer wants: their own work, their team, or everything. */
export const TASK_OWNER_SCOPES = ['MINE', 'TEAM', 'ALL'] as const;
export type TaskOwnerScope = (typeof TASK_OWNER_SCOPES)[number];

export function taskMatchesOwnerScope(
  task: { assignedToId: string | null },
  scope: string,
  viewerId: string,
  teamMemberIds: string[] = []
): boolean {
  if (scope === 'MINE') return task.assignedToId === viewerId;
  if (scope === 'TEAM') return !!task.assignedToId && (task.assignedToId === viewerId || teamMemberIds.includes(task.assignedToId));
  return true;
}

export type TaskQueueBucket = 'OVERDUE' | 'DUE_TODAY' | 'DUE_THIS_WEEK' | 'LATER' | 'NO_DATE' | 'CLOSED';

export function taskQueueBucket(task: { dueAt: Date | null; status: string }, now = new Date()): TaskQueueBucket {
  if (isTaskClosed(task.status)) return 'CLOSED';
  if (!task.dueAt) return 'NO_DATE';
  if (task.dueAt.getTime() < startOfDay(now).getTime()) return 'OVERDUE';
  if (isSameDay(task.dueAt, now)) return 'DUE_TODAY';
  if (task.dueAt.getTime() <= endOfWeek(now).getTime()) return 'DUE_THIS_WEEK';
  return 'LATER';
}

export type TaskQueueSummary = {
  total: number;
  overdue: number;
  dueToday: number;
  dueThisWeek: number;
  later: number;
  noDate: number;
  closed: number;
  blocked: number;
  unassigned: number;
};

export function summariseTaskQueue(
  tasks: Array<{ dueAt: Date | null; status: string; assignedToId?: string | null }>,
  now = new Date()
): TaskQueueSummary {
  const summary: TaskQueueSummary = { total: tasks.length, overdue: 0, dueToday: 0, dueThisWeek: 0, later: 0, noDate: 0, closed: 0, blocked: 0, unassigned: 0 };
  for (const task of tasks) {
    switch (taskQueueBucket(task, now)) {
      case 'OVERDUE': summary.overdue += 1; break;
      case 'DUE_TODAY': summary.dueToday += 1; break;
      case 'DUE_THIS_WEEK': summary.dueThisWeek += 1; break;
      case 'LATER': summary.later += 1; break;
      case 'NO_DATE': summary.noDate += 1; break;
      case 'CLOSED': summary.closed += 1; break;
    }
    if (task.status === 'BLOCKED') summary.blocked += 1;
    if (!isTaskClosed(task.status) && !task.assignedToId) summary.unassigned += 1;
  }
  return summary;
}

const priorityWeight: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const bucketWeight: Record<TaskQueueBucket, number> = { OVERDUE: 0, DUE_TODAY: 1, DUE_THIS_WEEK: 2, LATER: 4, NO_DATE: 5, CLOSED: 6 };

/** Open work first, then soonest due, then priority — the order staff should work in. */
export function sortTasksForQueue<T extends { dueAt: Date | null; status: string; priority: string }>(tasks: T[], now = new Date()): T[] {
  return [...tasks].sort((a, b) => {
    const bucket = bucketWeight[taskQueueBucket(a, now)] - bucketWeight[taskQueueBucket(b, now)];
    if (bucket !== 0) return bucket;
    const dueA = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const dueB = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;
    return (priorityWeight[a.priority] ?? 9) - (priorityWeight[b.priority] ?? 9);
  });
}

/** Overdue work is escalated once the grace window has passed, so supervision can pick it up. */
export function taskEscalationLevel(task: { dueAt: Date | null; status: string }, now = new Date()): 'NONE' | 'OVERDUE' | 'BREACHED' {
  if (!isTaskOverdue(task, now)) return 'NONE';
  const daysLate = Math.floor((now.getTime() - (task.dueAt as Date).getTime()) / DAY_MS);
  return daysLate >= 3 ? 'BREACHED' : 'OVERDUE';
}

export function taskDueLabel(task: { dueAt: Date | null; status: string }, now = new Date()): string {
  if (isTaskClosed(task.status)) return 'Closed';
  if (!task.dueAt) return 'No due date';
  const days = Math.round((startOfDay(endOfDay(task.dueAt)).getTime() - startOfDay(now).getTime()) / DAY_MS);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}
