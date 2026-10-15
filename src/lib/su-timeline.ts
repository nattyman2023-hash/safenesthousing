import { addDays, dayKey, daysBetween, fromDayKey, startOfDay } from './dates';

/** Service-user timeline: merges the profile records a key worker needs to read in one place —
 * contacts, case notes, Safe & Well checks, risk assessments, support plans, the PEN portrait,
 * appointments, generated tasks, concerns, complaints, repairs and move checklists — into one
 * chronological story. Pure logic, so the timeline is ordered and redacted the same way on every
 * profile tab and in any future export. */

export const TIMELINE_KINDS = [
  'REFERRAL',
  'PLACEMENT',
  'PLACEMENT_END',
  'CONTACT',
  'CASE_NOTE',
  'SAFE_WELL',
  'RISK_ASSESSMENT',
  'SUPPORT_PLAN',
  'SUPPORT_PLAN_REVIEW',
  'PEN_PORTRAIT',
  'INCIDENT',
  'APPOINTMENT',
  'TASK',
  'CONCERN',
  'COMPLAINT',
  'MAINTENANCE',
  'MOVE_CHECKLIST',
  'DOCUMENT'
] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export const TIMELINE_KIND_LABELS: Record<TimelineKind, string> = {
  REFERRAL: 'Referral',
  PLACEMENT: 'Placement started',
  PLACEMENT_END: 'Placement ended',
  CONTACT: 'Contact',
  CASE_NOTE: 'Case note',
  SAFE_WELL: 'Safe & Well check',
  RISK_ASSESSMENT: 'Risk assessment',
  SUPPORT_PLAN: 'Support plan',
  SUPPORT_PLAN_REVIEW: 'Support plan review',
  PEN_PORTRAIT: 'PEN portrait',
  INCIDENT: 'Incident',
  APPOINTMENT: 'Appointment',
  TASK: 'Task',
  CONCERN: 'Concern',
  COMPLAINT: 'Complaint',
  MAINTENANCE: 'Repair',
  MOVE_CHECKLIST: 'Move checklist',
  DOCUMENT: 'Document'
};

export function timelineKindLabel(kind: string): string {
  return TIMELINE_KIND_LABELS[kind as TimelineKind] ?? kind.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export type TimelineEntryInput = {
  kind: TimelineKind;
  id: string;
  occurredAt: Date;
  title: string;
  detail?: string | null;
  status?: string | null;
  category?: string | null;
  authorName?: string | null;
  href?: string | null;
};

export type TimelineEntry = {
  id: string;
  kind: TimelineKind;
  kindLabel: string;
  occurredAt: Date;
  dayKey: string;
  title: string;
  detail: string | null;
  status: string | null;
  category: string | null;
  authorName: string | null;
  href: string | null;
  /** True when the narrative was withheld because the profile is restricted; access is audited. */
  redacted: boolean;
};

export type TimelineInput = {
  entries: TimelineEntryInput[];
  /** Restricted profiles keep their chronology but never their narrative. */
  restricted?: boolean;
  /** Only show these kinds (an empty list means every kind). */
  kinds?: TimelineKind[];
  since?: Date | null;
  limit?: number;
  /** Injected so the "coming up" split is testable and stable within a single request. */
  now?: Date;
};

export const TIMELINE_DEFAULT_LIMIT = 100;

/** Orders a profile's history the way staff read it: what is happening or next first, then what has
 * already happened, newest first. Duplicate ids from different sources are kept — a contact and the
 * appointment it came from are two events, not one. */
export function buildServiceUserTimeline(input: TimelineInput): TimelineEntry[] {
  const restricted = input.restricted ?? false;
  const kinds = input.kinds ?? [];
  const limit = input.limit ?? TIMELINE_DEFAULT_LIMIT;
  const since = input.since ? startOfDay(input.since) : null;

  const entries: TimelineEntry[] = [];
  for (const entry of input.entries) {
    if (kinds.length && !kinds.includes(entry.kind)) continue;
    if (since && entry.occurredAt.getTime() < since.getTime()) continue;
    entries.push({
      id: entry.id,
      kind: entry.kind,
      kindLabel: timelineKindLabel(entry.kind),
      occurredAt: entry.occurredAt,
      dayKey: dayKey(entry.occurredAt),
      title: entry.title,
      detail: restricted ? null : entry.detail ?? null,
      status: entry.status ?? null,
      category: entry.category ?? null,
      authorName: entry.authorName ?? null,
      href: entry.href ?? null,
      redacted: restricted
    });
  }

  const now = (input.now ?? new Date()).getTime();
  return entries
    .sort((a, b) => {
      const aFuture = a.occurredAt.getTime() >= now;
      const bFuture = b.occurredAt.getTime() >= now;
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      const difference = aFuture
        ? a.occurredAt.getTime() - b.occurredAt.getTime()
        : b.occurredAt.getTime() - a.occurredAt.getTime();
      if (difference !== 0) return difference;
      return a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

export type TimelineDayGroup = { key: string; date: Date; entries: TimelineEntry[] };

/** Groups an already-ordered timeline into days, keeping the order the entries arrived in. */
export function groupTimelineByDay(entries: TimelineEntry[]): TimelineDayGroup[] {
  const groups = new Map<string, TimelineDayGroup>();
  for (const entry of entries) {
    const existing = groups.get(entry.dayKey);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    groups.set(entry.dayKey, { key: entry.dayKey, date: fromDayKey(entry.dayKey), entries: [entry] });
  }
  return [...groups.values()];
}

export type TimelineSummary = {
  total: number;
  upcoming: number;
  last30Days: number;
  lastActivityAt: Date | null;
  byKind: Array<{ key: string; label: string; count: number }>;
};

/** Headline numbers for the profile header: how much history there is, what is coming up, and when
 * the last recorded activity happened. */
export function summariseTimeline(entries: TimelineEntry[], now = new Date()): TimelineSummary {
  const nowTime = now.getTime();
  const recentBoundary = startOfDay(addDays(now, -30)).getTime();
  const past = entries.filter((entry) => entry.occurredAt.getTime() < nowTime);
  const lastActivityAt = past.reduce<Date | null>(
    (latest, entry) => (!latest || entry.occurredAt.getTime() > latest.getTime() ? entry.occurredAt : latest),
    null
  );
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  return {
    total: entries.length,
    upcoming: entries.length - past.length,
    last30Days: past.filter((entry) => entry.occurredAt.getTime() >= recentBoundary).length,
    lastActivityAt,
    byKind: [...counts.entries()]
      .map(([key, count]) => ({ key, label: timelineKindLabel(key), count }))
      .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key))
  };
}

/** Relative day heading for the timeline: today, yesterday, tomorrow, or the calendar date. */
export function timelineDayLabel(date: Date, now = new Date()): string {
  const difference = daysBetween(now, date);
  if (difference === 0) return 'Today';
  if (difference === -1) return 'Yesterday';
  if (difference === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}
