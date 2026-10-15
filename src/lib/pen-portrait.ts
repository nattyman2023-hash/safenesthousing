import { addMonths, daysBetween, isWithinDays } from './dates';

/** PEN portraits: the person-led "who I am" record that sits alongside the support plan. Sections
 * map one-to-one onto the `PenPortrait` columns so the form, the profile card, and the completeness
 * checks all read from the same definition. Pure logic — persistence happens in the API routes. */

export const PEN_PORTRAIT_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'] as const;
export type PenPortraitStatus = (typeof PEN_PORTRAIT_STATUSES)[number];

export type PenPortraitSection = {
  /** Column name on the `PenPortrait` model. */
  field: string;
  label: string;
  prompt: string;
  /** A section only counts as written up once it holds this many characters. */
  minLength: number;
};

export const PEN_PORTRAIT_SECTIONS: readonly PenPortraitSection[] = [
  { field: 'aboutMe', label: 'About me', prompt: 'My name, where I am from, and what I would like people to know first.', minLength: 40 },
  { field: 'myNeeds', label: 'My support needs', prompt: 'What I need help with day to day, and how much support I want.', minLength: 40 },
  { field: 'howIShow', label: 'How I show how I feel', prompt: 'What staff might see when I am anxious, unwell, or happy.', minLength: 30 },
  { field: 'whatMatters', label: 'What matters to me', prompt: 'The things that make my life worth living — people, faith, culture, routines.', minLength: 40 },
  { field: 'myStrengths', label: 'My strengths', prompt: 'What I am good at and what I have achieved.', minLength: 30 },
  { field: 'communication', label: 'Communication', prompt: 'How best to talk with me, and what does not work.', minLength: 30 },
  { field: 'likes', label: 'Things I like', prompt: 'Food, music, TV, activities, places.', minLength: 20 },
  { field: 'dislikes', label: 'Things I do not like', prompt: 'Anything that upsets or unsettles me.', minLength: 20 },
  { field: 'healthNeeds', label: 'Health and wellbeing', prompt: 'Physical health, mental health, medication, and appointments.', minLength: 30 },
  { field: 'risksToMe', label: 'Risks to me and others', prompt: 'In my own words, in a way I have agreed can be shared.', minLength: 30 },
  { field: 'whoSupportsMe', label: 'Who supports me', prompt: 'Family, friends, professionals, and how to reach them.', minLength: 30 }
];

export function penPortraitFieldNames(): string[] {
  return PEN_PORTRAIT_SECTIONS.map((section) => section.field);
}

type PenPortraitRecord = Record<string, unknown> & { status?: string | null; completedAt?: Date | null; reviewDueAt?: Date | null };

function sectionText(portrait: PenPortraitRecord, section: PenPortraitSection): string {
  const value = portrait[section.field];
  return typeof value === 'string' ? value.trim() : '';
}

export type PenPortraitCompleteness = {
  completed: number;
  total: number;
  percent: number;
  missing: string[];
  /** Sections that have a short draft rather than nothing at all. */
  started: string[];
  status: PenPortraitStatus;
};

export function penPortraitCompleteness(portrait: PenPortraitRecord | null | undefined): PenPortraitCompleteness {
  const total = PEN_PORTRAIT_SECTIONS.length;
  if (!portrait) return { completed: 0, total, percent: 0, missing: PEN_PORTRAIT_SECTIONS.map((section) => section.field), started: [], status: 'NOT_STARTED' };
  const missing: string[] = [];
  const started: string[] = [];
  let completed = 0;
  for (const section of PEN_PORTRAIT_SECTIONS) {
    const text = sectionText(portrait, section);
    if (text.length >= section.minLength) completed += 1;
    else if (text.length > 0) started.push(section.field);
    else missing.push(section.field);
  }
  const percent = Math.round((completed / total) * 100);
  const status: PenPortraitStatus = completed === total ? 'COMPLETE' : completed === 0 && started.length === 0 ? 'NOT_STARTED' : 'IN_PROGRESS';
  return { completed, total, percent, missing, started, status };
}

export function isPenPortraitComplete(portrait: PenPortraitRecord | null | undefined): boolean {
  return penPortraitCompleteness(portrait).status === 'COMPLETE';
}

export function penPortraitStatus(portrait: PenPortraitRecord | null | undefined): PenPortraitStatus {
  return penPortraitCompleteness(portrait).status;
}

/** PEN portraits are reviewed at least annually, or sooner after a significant change. */
export const PEN_PORTRAIT_REVIEW_MONTHS = 12;

export function nextPenPortraitReviewDue(completedAt: Date, months = PEN_PORTRAIT_REVIEW_MONTHS): Date {
  return addMonths(completedAt, months);
}

export type PenPortraitReviewState = 'NOT_SET' | 'CURRENT' | 'DUE_SOON' | 'OVERDUE';

export function penPortraitReviewState(
  input: { reviewDueAt: Date | null | undefined; completedAt?: Date | null; now?: Date }
): PenPortraitReviewState {
  const now = input.now ?? new Date();
  const dueAt = input.reviewDueAt ?? (input.completedAt ? nextPenPortraitReviewDue(input.completedAt) : null);
  if (!dueAt) return 'NOT_SET';
  if (dueAt.getTime() < now.getTime()) return 'OVERDUE';
  return isWithinDays(dueAt, 30, now) ? 'DUE_SOON' : 'CURRENT';
}

export function penPortraitDaysSinceUpdate(updatedAt: Date | null | undefined, now = new Date()): number | null {
  return updatedAt ? daysBetween(updatedAt, now) : null;
}

/** Filled sections in reading order, for the summary card on the profile. */
export function penPortraitHighlights(portrait: PenPortraitRecord | null | undefined, limit = 4): Array<{ label: string; value: string }> {
  if (!portrait) return [];
  return PEN_PORTRAIT_SECTIONS
    .map((section) => ({ label: section.label, value: sectionText(portrait, section) }))
    .filter((entry) => entry.value.length > 0)
    .slice(0, limit);
}
