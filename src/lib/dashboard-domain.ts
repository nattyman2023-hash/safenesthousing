import { addDays, dayKey, isSameDay, startOfWeek } from './dates';
import {
  isTaskClosed,
  sortTasksForQueue,
  summariseTaskQueue,
  taskDueLabel,
  taskEscalationLevel,
  taskMatchesOwnerScope,
  taskQueueBucket,
  type TaskOwnerScope,
  type TaskQueueBucket,
  type TaskQueueSummary
} from './task-workflow';
import {
  appointmentNeedsOutcome,
  appointmentTiming,
  isAppointmentOpen,
  type AppointmentPeriodSummary,
  type CalendarAppointment
} from './appointments';
import { contactComplianceState, nextContactDueAt, type PlannedContactState } from './contact-tracking';
import { nextSafeWellDueAt, safeWellDueState, type SafeWellDueState } from './safe-well';
import { normaliseContactFrequency, normaliseSafeWellFrequency } from './support-domain';
import type { MaintenanceSummary } from './operations-domain';
import type { ConcernSummary } from './concerns-domain';
import type { ComplaintSummary } from './complaints-domain';
import type { ComplianceSummary } from './compliance-domain';

/** Dashboard aggregation: turns the raw rows the CRM has already loaded (work queue, appointments,
 * service user profiles, operational records) into the metric cards and attention lists the
 * support & housing dashboard renders. Pure logic — no database access, no rendering — so the numbers
 * on the dashboard can be unit tested and can never drift from the domain rules they summarise. */

/** The three slices of the work queue, labelled the same way everywhere in the CRM. */
export const DASHBOARD_SCOPE_LABELS: Record<TaskOwnerScope, string> = {
  MINE: 'My work',
  TEAM: 'My team',
  ALL: 'All work'
};

/** How many rows the dashboard shows in each attention list before "view all" takes over. */
export const DASHBOARD_LIST_LIMIT = 5;

/** Routine support work is only owed to service users who are currently in a placement, which is the
 * same policy the task automation engine applies when it raises recurring work. */
export const DASHBOARD_ACTIVE_CLIENT_STATUSES: readonly string[] = ['CURRENT'];

/** The minimum a task row must carry to be aggregated. Prisma rows can be passed straight in. */
export type DashboardTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: Date | null;
  assignedToId: string | null;
  department: string;
  category: string;
  clientId: string | null;
  source?: string | null;
};

export type WorkQueueInput = {
  scope: TaskOwnerScope;
  viewerId: string;
  teamMemberIds?: string[];
  now?: Date;
  /** Caps the attention lists (overdue, due today, breached, unassigned). `open` is left complete. */
  limit?: number;
};

/** Load per staff member, which is what the team view lists before drilling into a colleague. */
export type TaskOwnerLoad = {
  ownerId: string | null;
  open: number;
  overdue: number;
  blocked: number;
  dueThisWeek: number;
  nextDueAt: Date | null;
  nextDueLabel: string;
};

export type WorkQueueBoard<T extends DashboardTask = DashboardTask> = {
  scope: TaskOwnerScope;
  summary: TaskQueueSummary;
  open: T[];
  overdue: T[];
  dueToday: T[];
  dueThisWeek: T[];
  breached: T[];
  unassigned: T[];
  byCategory: Array<{ key: string; count: number }>;
  byDepartment: Array<{ key: string; count: number }>;
  owners: TaskOwnerLoad[];
};

/** Narrows the work queue to the slice the viewer asked for: their own work, their team, or all. */
export function scopeTasks<T extends DashboardTask>(
  tasks: T[],
  input: { scope: TaskOwnerScope; viewerId: string; teamMemberIds?: string[] }
): T[] {
  const teamMemberIds = input.teamMemberIds ?? [];
  return tasks.filter((task) => taskMatchesOwnerScope(task, input.scope, input.viewerId, teamMemberIds));
}

/** Counts rows by a key, returned as a stable, descending list so the UI never has to sort. */
function countBy(tasks: DashboardTask[], pick: (task: DashboardTask) => string): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const key = pick(task) || 'GENERAL';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key));
}

/** Everything the dashboard shows about the work queue in one pass: the headline summary, the
 * attention lists, and the department/category/owner breakdowns. Open work is ordered the way it
 * should be worked — soonest and most urgent first — so the UI renders whatever order it is given. */
export function buildWorkQueue<T extends DashboardTask>(tasks: T[], input: WorkQueueInput): WorkQueueBoard<T> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? DASHBOARD_LIST_LIMIT;
  const scoped = scopeTasks(tasks, input);
  const open = sortTasksForQueue(scoped.filter((task) => !isTaskClosed(task.status)), now);
  const inBucket = (bucket: TaskQueueBucket) => open.filter((task) => taskQueueBucket(task, now) === bucket);
  return {
    scope: input.scope,
    summary: summariseTaskQueue(scoped, now),
    open,
    overdue: inBucket('OVERDUE').slice(0, limit),
    dueToday: inBucket('DUE_TODAY').slice(0, limit),
    dueThisWeek: inBucket('DUE_THIS_WEEK'),
    breached: open.filter((task) => taskEscalationLevel(task, now) === 'BREACHED').slice(0, limit),
    unassigned: open.filter((task) => !task.assignedToId).slice(0, limit),
    byCategory: countBy(open, (task) => task.category),
    byDepartment: countBy(open, (task) => task.department),
    owners: groupTasksByOwner(scoped, now)
  };
}

/** Open work per owner, busiest first. Unassigned work is always listed last because nobody owns it
 * yet — it is the first thing a supervisor should pick up. */
export function groupTasksByOwner<T extends DashboardTask>(tasks: T[], now = new Date()): TaskOwnerLoad[] {
  const open = tasks.filter((task) => !isTaskClosed(task.status));
  const ownerIds = [...new Set(open.map((task) => task.assignedToId))];
  const loads = ownerIds.map((ownerId) => {
    const owned = ownerId ? open.filter((task) => task.assignedToId === ownerId) : open.filter((task) => !task.assignedToId);
    const next = owned
      .filter((task) => !!task.dueAt)
      .sort((a, b) => (a.dueAt as Date).getTime() - (b.dueAt as Date).getTime())[0] ?? null;
    return {
      ownerId,
      open: owned.length,
      overdue: owned.filter((task) => taskQueueBucket(task, now) === 'OVERDUE').length,
      blocked: owned.filter((task) => task.status === 'BLOCKED').length,
      dueThisWeek: owned.filter((task) => ['DUE_TODAY', 'DUE_THIS_WEEK'].includes(taskQueueBucket(task, now))).length,
      nextDueAt: next?.dueAt ?? null,
      nextDueLabel: next ? taskDueLabel(next, now) : 'Nothing dated'
    };
  });
  return loads.sort((a, b) => {
    if (a.overdue !== b.overdue) return b.overdue - a.overdue;
    if (a.ownerId === null) return 1;
    if (b.ownerId === null) return -1;
    if (a.open !== b.open) return b.open - a.open;
    return (a.ownerId ?? '').localeCompare(b.ownerId ?? '');
  });
}

/** How urgently a service user needs a supervisor's attention. Overdue work on a high or critical
 * risk profile is urgent, overdue work is high, and profile gaps alone sit at medium. */
export type AttentionSeverity = 'URGENT' | 'HIGH' | 'MEDIUM';

export type ServiceUserAttentionInput = {
  clientId: string;
  displayName: string;
  restricted?: boolean;
  status: string;
  keyWorkerId?: string | null;
  riskLevel?: string | null;
  contactFrequencyDays?: number | null;
  safeWellFrequencyDays?: number | null;
  lastSupportContactAt?: Date | null;
  lastSafeWellCompletedAt?: Date | null;
  openTasks?: number;
  overdueTasks?: number;
};

export type ServiceUserAttentionRow = {
  clientId: string;
  label: string;
  restricted: boolean;
  severity: AttentionSeverity;
  contactState: PlannedContactState;
  contactDueAt: Date | null;
  safeWellState: SafeWellDueState;
  safeWellDueAt: Date | null;
  reasons: string[];
  openTasks: number;
  overdueTasks: number;
};

export type AttentionSummary = { total: number; urgent: number; high: number; medium: number };

const attentionSeverityWeight: Record<AttentionSeverity, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2 };

function attentionSeverity(input: { overdue: boolean; notStarted: boolean; riskLevel?: string | null }): AttentionSeverity {
  const elevated = ['HIGH', 'CRITICAL'].includes((input.riskLevel ?? '').toUpperCase());
  if (input.overdue) return elevated ? 'URGENT' : 'HIGH';
  if (input.notStarted) return 'HIGH';
  return 'MEDIUM';
}

/** The "who needs attention" list. One row per service user who is out of step with policy, worst
 * first, so the dashboard never buries an overdue Safe & Well check under routine work. Restricted
 * profiles are listed without a name, in line with the safeguarding storage rules. */
export function buildServiceUserAttention(
  clients: ServiceUserAttentionInput[],
  now = new Date()
): ServiceUserAttentionRow[] {
  const rows: ServiceUserAttentionRow[] = [];
  for (const client of clients) {
    if (!DASHBOARD_ACTIVE_CLIENT_STATUSES.includes(client.status)) continue;
    const contactFrequencyDays = normaliseContactFrequency(client.contactFrequencyDays);
    const safeWellFrequencyDays = normaliseSafeWellFrequency(client.safeWellFrequencyDays);
    const lastSupportContactAt = client.lastSupportContactAt ?? null;
    const lastSafeWellCompletedAt = client.lastSafeWellCompletedAt ?? null;
    const contactState = contactComplianceState({ lastContactAt: lastSupportContactAt, frequencyDays: contactFrequencyDays, now });
    const safeWellDueAt = nextSafeWellDueAt(lastSafeWellCompletedAt, safeWellFrequencyDays);
    const safeWellState = safeWellDueState({ lastCompletedAt: lastSafeWellCompletedAt, frequencyDays: safeWellFrequencyDays, nextDueAt: safeWellDueAt, now });
    const overdueTasks = client.overdueTasks ?? 0;

    const reasons: string[] = [];
    if (contactState === 'NOT_STARTED') reasons.push('No meaningful contact recorded yet');
    else if (contactState === 'OVERDUE') reasons.push('Planned contact is overdue');
    if (safeWellState === 'NOT_STARTED') reasons.push('No Safe & Well check recorded yet');
    else if (safeWellState === 'OVERDUE') reasons.push('Safe & Well check is overdue');
    if (overdueTasks > 0) reasons.push(`${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'}`);
    if (!client.keyWorkerId) reasons.push('No key worker assigned');
    if (!reasons.length) continue;

    rows.push({
      clientId: client.clientId,
      label: client.restricted ? 'Restricted service user' : client.displayName,
      restricted: !!client.restricted,
      severity: attentionSeverity({
        overdue: contactState === 'OVERDUE' || safeWellState === 'OVERDUE' || overdueTasks > 0,
        notStarted: contactState === 'NOT_STARTED' || safeWellState === 'NOT_STARTED',
        riskLevel: client.riskLevel
      }),
      contactState,
      contactDueAt: nextContactDueAt(lastSupportContactAt, contactFrequencyDays),
      safeWellState,
      safeWellDueAt,
      reasons,
      openTasks: client.openTasks ?? 0,
      overdueTasks
    });
  }
  return rows.sort((a, b) => {
    const severity = attentionSeverityWeight[a.severity] - attentionSeverityWeight[b.severity];
    if (severity !== 0) return severity;
    if (a.overdueTasks !== b.overdueTasks) return b.overdueTasks - a.overdueTasks;
    const dueA = (a.contactDueAt ?? a.safeWellDueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    const dueB = (b.contactDueAt ?? b.safeWellDueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;
    return a.label.localeCompare(b.label);
  });
}

/** Headline counts for the attention card badge, counted across every row (before any display cap). */
export function summariseAttention(rows: ServiceUserAttentionRow[]): AttentionSummary {
  return {
    total: rows.length,
    urgent: rows.filter((row) => row.severity === 'URGENT').length,
    high: rows.filter((row) => row.severity === 'HIGH').length,
    medium: rows.filter((row) => row.severity === 'MEDIUM').length
  };
}

/** The staff calendar shows appointments and dated work in the same column, so a visit and the
 * preparation it needs never appear as two separate diaries. */
export type CalendarEntryKind = 'APPOINTMENT' | 'TASK';

export const CALENDAR_ENTRY_KIND_LABELS: Record<CalendarEntryKind, string> = {
  APPOINTMENT: 'Appointment',
  TASK: 'Task'
};

export type CalendarEntry = {
  id: string;
  kind: CalendarEntryKind;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  status: string;
  category: string;
  clientId: string | null;
  ownerId: string | null;
  overdue: boolean;
  needsOutcome: boolean;
};

export type CalendarEntryInput = {
  appointments?: CalendarAppointment[];
  tasks?: Array<DashboardTask & { allDay?: boolean; completedAt?: Date | null }>;
  now?: Date;
  /** Closed appointments and finished tasks are hidden unless a viewer is browsing history. */
  includeClosed?: boolean;
};

/** Merges appointments and dated tasks into one ordered list. Tasks without a due date are dropped:
 * they belong in the work queue, not on a calendar. */
export function buildCalendarEntries(input: CalendarEntryInput): CalendarEntry[] {
  const now = input.now ?? new Date();
  const includeClosed = input.includeClosed ?? false;
  const entries: CalendarEntry[] = [];

  for (const appointment of input.appointments ?? []) {
    if (!includeClosed && !isAppointmentOpen(appointment.status)) continue;
    entries.push({
      id: appointment.id,
      kind: 'APPOINTMENT',
      title: appointment.title,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt ?? null,
      allDay: false,
      status: appointment.status,
      category: appointment.category ?? 'OTHER',
      clientId: appointment.clientId ?? null,
      ownerId: appointment.ownerId ?? null,
      overdue: appointmentTiming(appointment, now) === 'OVERDUE',
      needsOutcome: appointmentNeedsOutcome(appointment, now)
    });
  }

  for (const task of input.tasks ?? []) {
    if (!task.dueAt) continue;
    if (!includeClosed && isTaskClosed(task.status)) continue;
    entries.push({
      id: task.id,
      kind: 'TASK',
      title: task.title,
      startsAt: task.dueAt,
      endsAt: null,
      allDay: task.allDay ?? true,
      status: task.status,
      category: task.category,
      clientId: task.clientId,
      ownerId: task.assignedToId,
      overdue: taskQueueBucket(task, now) === 'OVERDUE',
      needsOutcome: false
    });
  }

  return entries.sort((a, b) => {
    const start = a.startsAt.getTime() - b.startsAt.getTime();
    if (start !== 0) return start;
    if (a.kind !== b.kind) return a.kind === 'APPOINTMENT' ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export type CalendarDay = {
  key: string;
  date: Date;
  isToday: boolean;
  entries: CalendarEntry[];
  appointments: number;
  tasks: number;
  overdue: number;
};

export function calendarEntriesOnDay(entries: CalendarEntry[], day: Date): CalendarEntry[] {
  return entries.filter((entry) => isSameDay(entry.startsAt, day));
}

/** A week strip starting on a Monday, including empty days so the calendar keeps its shape. */
export function buildCalendarWeek(entries: CalendarEntry[], from: Date, days = 7, now = new Date()): CalendarDay[] {
  const start = startOfWeek(from);
  return Array.from({ length: days }, (_unused, offset) => {
    const date = addDays(start, offset);
    const dayEntries = calendarEntriesOnDay(entries, date);
    return {
      key: dayKey(date),
      date,
      isToday: isSameDay(date, now),
      entries: dayEntries,
      appointments: dayEntries.filter((entry) => entry.kind === 'APPOINTMENT').length,
      tasks: dayEntries.filter((entry) => entry.kind === 'TASK').length,
      overdue: dayEntries.filter((entry) => entry.overdue).length
    };
  });
}

export type CalendarWeekSummary = {
  total: number;
  appointments: number;
  tasks: number;
  overdue: number;
  needsOutcome: number;
  busiestDayKey: string | null;
  busiestDayCount: number;
};

export function summariseCalendarWeek(days: CalendarDay[]): CalendarWeekSummary {
  const entries = days.flatMap((day) => day.entries);
  const busiest = [...days].sort((a, b) => (b.entries.length - a.entries.length) || a.key.localeCompare(b.key))[0];
  return {
    total: entries.length,
    appointments: entries.filter((entry) => entry.kind === 'APPOINTMENT').length,
    tasks: entries.filter((entry) => entry.kind === 'TASK').length,
    overdue: entries.filter((entry) => entry.overdue).length,
    needsOutcome: entries.filter((entry) => entry.needsOutcome).length,
    busiestDayKey: busiest && busiest.entries.length ? busiest.key : null,
    busiestDayCount: busiest?.entries.length ?? 0
  };
}

/** The headline cards. Each one is derived from a domain summary rather than a fresh query, so the
 * dashboard can never show a different number from the page it links to. */
export type DashboardMetricTone = 'teal' | 'blue' | 'gold' | 'red';
export type DashboardMetricIcon = 'chart' | 'users' | 'clipboard' | 'building' | 'alert' | 'calendar';

export type DashboardMetric = {
  key: string;
  label: string;
  value: number;
  detail: string;
  tone: DashboardMetricTone;
  icon: DashboardMetricIcon;
  href: string;
};

export type DashboardMetricsInput = {
  tasks: TaskQueueSummary;
  appointments: AppointmentPeriodSummary;
  maintenance: MaintenanceSummary;
  concerns: ConcernSummary;
  complaints: ComplaintSummary;
  compliance: ComplianceSummary;
  attention: AttentionSummary;
};

export function buildDashboardMetrics(input: DashboardMetricsInput): DashboardMetric[] {
  const { tasks, appointments, maintenance, concerns, complaints, compliance, attention } = input;
  const openWork = Math.max(0, tasks.total - tasks.closed);
  const complaintDeadlineRisk = complaints.acknowledgementOverdue + complaints.responseOverdue;
  return [
    {
      key: 'open-work',
      label: 'Open work',
      value: openWork,
      detail: `${tasks.overdue} overdue · ${tasks.unassigned} unassigned`,
      tone: tasks.overdue > 0 ? 'red' : 'teal',
      icon: 'clipboard',
      href: '/crm/tasks'
    },
    {
      key: 'appointments',
      label: 'Appointments this week',
      value: appointments.thisWeek,
      detail: `${appointments.today} today · ${appointments.nextAppointment ? 'next booked' : 'nothing booked'}`,
      tone: 'blue',
      icon: 'calendar',
      href: '/crm/calendar'
    },
    {
      key: 'outcomes',
      label: 'Outcomes to record',
      value: appointments.needsOutcome,
      detail: appointments.missed > 0 ? `${appointments.missed} missed visit${appointments.missed === 1 ? '' : 's'}` : 'Visits past their end time',
      tone: appointments.needsOutcome > 0 ? 'gold' : 'teal',
      icon: 'alert',
      href: '/crm/appointments'
    },
    {
      key: 'repairs',
      label: 'Open repairs',
      value: maintenance.open,
      detail: `${maintenance.breached} past target · ${maintenance.safetyRisks} safety risk${maintenance.safetyRisks === 1 ? '' : 's'}`,
      tone: maintenance.breached > 0 || maintenance.safetyRisks > 0 ? 'red' : 'gold',
      icon: 'building',
      href: '/crm/maintenance'
    },
    {
      key: 'concerns',
      label: 'Open concerns',
      value: concerns.open,
      detail: `${concerns.critical} critical · ${concerns.referralsRequired} referral${concerns.referralsRequired === 1 ? '' : 's'} required`,
      tone: concerns.critical > 0 ? 'red' : 'gold',
      icon: 'alert',
      href: '/crm/concerns'
    },
    {
      key: 'complaints',
      label: 'Open complaints',
      value: complaints.open,
      detail: `${complaintDeadlineRisk} past deadline · ${complaints.learningOutstanding} learning to record`,
      tone: complaintDeadlineRisk > 0 ? 'red' : 'gold',
      icon: 'clipboard',
      href: '/crm/complaints'
    },
    {
      key: 'compliance',
      label: 'Property compliance',
      value: compliance.complianceRate,
      detail: `${compliance.overdue} overdue · ${compliance.dueSoon} due soon`,
      tone: compliance.overdue > 0 ? 'red' : 'teal',
      icon: 'building',
      href: '/crm/compliance'
    },
    {
      key: 'attention',
      label: 'Needs attention',
      value: attention.total,
      detail: `${attention.urgent} urgent · ${attention.high} high`,
      tone: attention.urgent > 0 ? 'red' : 'gold',
      icon: 'users',
      href: '/crm/clients'
    }
  ];
}
