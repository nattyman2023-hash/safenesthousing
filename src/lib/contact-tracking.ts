import { addDays, daysBetween, isWithinDays } from './dates';

/** Planned-contact rules: how often each service user should be contacted, whether a contact
 * counted as support, and when the next one is due. Pure logic driven by the frequency recorded
 * on the service user profile, so "contact compliance" is consistent across the CRM and reports. */

export const CONTACT_METHODS = ['IN_PERSON', 'HOME_VISIT', 'OFFICE_VISIT', 'PHONE', 'VIDEO', 'TEXT', 'EMAIL', 'LETTER', 'OTHER'] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const CONTACT_DIRECTIONS = ['OUTBOUND', 'INBOUND'] as const;
export type ContactDirection = (typeof CONTACT_DIRECTIONS)[number];

/** A contact is only counted as support when it happened, it was meaningful, and it was not
 * just a failed attempt to reach the person.
 *
 * The `attempted` flag is set when staff could not reach the person at all (see the case-note
 * form). Such a note is still a contact-log entry — it happened, and it needs a follow-up — but
 * counting it as support would report a delivered contact that never took place, satisfy the
 * planned-contact window, and hide the person who is not being reached. */
export function contactCountsAsSupport(note: { completed: boolean; meaningful: boolean; attempted?: boolean }): boolean {
  return note.completed && note.meaningful && !note.attempted;
}

/** The contact-tracking fields a case note carries when it was logged through the contact log. */
export type ContactLogNote = {
  method?: string | null;
  attempted?: boolean | null;
  completed?: boolean | null;
  nextContactDueAt?: Date | null;
};

/** A contact log and a case note are the same row (see the case-notes API route), so this metadata
 * is what tells them apart: a note logged as a contact carries a method, a direction-driven
 * next-due date, or an attempted-contact flag; anything else is a straight case-work note.
 *
 * Every measure of planned contact must filter with this before counting a note as support.
 * Counting a structured note — a review, a safeguarding record, a housing update — would report a
 * contact that never happened and push the next-due date out, which is how a service user with no
 * contact at all can read as on track. */
export function isContactLogNote(note: ContactLogNote): boolean {
  return Boolean(note.attempted) || note.completed === false || Boolean(note.nextContactDueAt) || Boolean(note.method && note.method !== 'OTHER');
}

export type PlannedContactState = 'NOT_STARTED' | 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE';

export const CONTACT_DUE_SOON_DAYS = 3;
export const MISSED_CONTACT_ESCALATION_THRESHOLD = 2;

export function nextContactDueAt(lastContactAt: Date | null | undefined, frequencyDays: number): Date | null {
  if (!lastContactAt) return null;
  const frequency = frequencyDays > 0 ? frequencyDays : 7;
  return addDays(lastContactAt, frequency);
}

export function contactComplianceState(
  input: { lastContactAt: Date | null | undefined; frequencyDays: number; now?: Date }
): PlannedContactState {
  const now = input.now ?? new Date();
  const dueAt = nextContactDueAt(input.lastContactAt, input.frequencyDays);
  if (!dueAt) return 'NOT_STARTED';
  if (dueAt.getTime() < now.getTime()) return 'OVERDUE';
  return isWithinDays(dueAt, CONTACT_DUE_SOON_DAYS, now) ? 'DUE_SOON' : 'ON_TRACK';
}

export type ContactRecord = {
  occurredAt: Date;
  completed: boolean;
  attempted: boolean;
  meaningful: boolean;
  method?: string | null;
  direction?: string | null;
  durationMinutes?: number | null;
};

/** Most recent contact that actually counted, used to drive the next-due calculation. */
export function lastSupportContactAt(notes: ContactRecord[]): Date | null {
  const counted = notes.filter((note) => contactCountsAsSupport(note));
  if (!counted.length) return null;
  return counted.reduce((latest, note) => (note.occurredAt.getTime() > latest.getTime() ? note.occurredAt : latest), counted[0].occurredAt);
}

export type ContactSummary = {
  total: number;
  meaningful: number;
  attempted: number;
  missedStreak: number;
  lastContactAt: Date | null;
  lastSupportContactAt: Date | null;
  daysSinceSupport: number | null;
  dueAt: Date | null;
  state: PlannedContactState;
  totalMinutes: number;
  methodBreakdown: Record<string, number>;
};

export function summariseContacts(
  notes: ContactRecord[],
  frequencyDays: number,
  now = new Date()
): ContactSummary {
  const ordered = [...notes].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const meaningful = ordered.filter((note) => contactCountsAsSupport(note));
  const last = lastSupportContactAt(ordered);
  const methodBreakdown: Record<string, number> = {};
  for (const note of meaningful) {
    const method = (note.method ?? 'OTHER').toUpperCase();
    methodBreakdown[method] = (methodBreakdown[method] ?? 0) + 1;
  }
  let missedStreak = 0;
  for (const note of ordered) {
    if (contactCountsAsSupport(note)) break;
    missedStreak += 1;
  }
  return {
    total: ordered.length,
    meaningful: meaningful.length,
    attempted: ordered.filter((note) => note.attempted || !note.completed).length,
    missedStreak,
    lastContactAt: ordered[0]?.occurredAt ?? null,
    lastSupportContactAt: last,
    daysSinceSupport: last ? daysBetween(last, now) : null,
    dueAt: nextContactDueAt(last, frequencyDays),
    state: contactComplianceState({ lastContactAt: last, frequencyDays, now }),
    totalMinutes: meaningful.reduce((total, note) => total + (note.durationMinutes ?? 0), 0),
    methodBreakdown
  };
}

/** Repeated unsuccessful contact means the person may need a welfare check rather than another
 * routine call, so this is surfaced to the workflow engine. */
export function requiresContactEscalation(summary: ContactSummary): boolean {
  return summary.missedStreak >= MISSED_CONTACT_ESCALATION_THRESHOLD || summary.state === 'OVERDUE';
}

/** Percentage of planned contacts delivered inside the window — the headline contact metric. */
export function contactComplianceRate(
  notes: ContactRecord[],
  frequencyDays: number,
  windowDays: number,
  now = new Date()
): number {
  const frequency = frequencyDays > 0 ? frequencyDays : 7;
  const expected = Math.max(1, Math.floor(windowDays / frequency));
  const windowStart = addDays(now, -windowDays);
  const delivered = notes.filter((note) => contactCountsAsSupport(note) && note.occurredAt.getTime() >= windowStart.getTime()).length;
  return Math.min(100, Math.round((delivered / expected) * 100));
}
