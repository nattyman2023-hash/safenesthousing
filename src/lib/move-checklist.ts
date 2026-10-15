import { addDays, isPast } from './dates';

/** Move-in and move-out checklists. The templates below are the organisation's standard steps; each
 * item's due date is offset from the target date so a checklist created for a move date is
 * immediately workable. Pure logic — persistence happens in the API routes. */

export const MOVE_CHECKLIST_TYPES = ['MOVE_IN', 'MOVE_OUT'] as const;
export type MoveChecklistType = (typeof MOVE_CHECKLIST_TYPES)[number];

export const MOVE_CHECKLIST_TYPE_LABELS: Record<MoveChecklistType, string> = {
  MOVE_IN: 'Move in',
  MOVE_OUT: 'Move out'
};

export const MOVE_CHECKLIST_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type MoveChecklistStatus = (typeof MOVE_CHECKLIST_STATUSES)[number];

const checklistTransitionMap: Record<MoveChecklistStatus, MoveChecklistStatus[]> = {
  NOT_STARTED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['IN_PROGRESS'],
  CANCELLED: ['NOT_STARTED', 'IN_PROGRESS']
};

export function canTransitionChecklist(from: string, to: string): boolean {
  return (checklistTransitionMap[from as MoveChecklistStatus] ?? []).includes(to as MoveChecklistStatus);
}

export function assertChecklistTransition(from: string, to: string): void {
  if (!canTransitionChecklist(from, to)) throw new Error(`Invalid move checklist transition: ${from} -> ${to}`);
}

export const MOVE_ITEM_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'NOT_APPLICABLE'] as const;
export type MoveItemStatus = (typeof MOVE_ITEM_STATUSES)[number];

const itemTransitionMap: Record<MoveItemStatus, MoveItemStatus[]> = {
  PENDING: ['IN_PROGRESS', 'DONE', 'BLOCKED', 'NOT_APPLICABLE'],
  IN_PROGRESS: ['DONE', 'BLOCKED', 'PENDING', 'NOT_APPLICABLE'],
  BLOCKED: ['PENDING', 'IN_PROGRESS', 'DONE'],
  DONE: ['IN_PROGRESS'],
  NOT_APPLICABLE: ['PENDING']
};

export function canTransitionChecklistItem(from: string, to: string): boolean {
  return (itemTransitionMap[from as MoveItemStatus] ?? []).includes(to as MoveItemStatus);
}

export function assertChecklistItemTransition(from: string, to: string): void {
  if (!canTransitionChecklistItem(from, to)) throw new Error(`Invalid checklist item transition: ${from} -> ${to}`);
}

export const MOVE_ITEM_CATEGORIES = ['TENANCY', 'PROPERTY', 'SAFETY', 'FINANCE', 'SUPPORT', 'HEALTH', 'PARTNERSHIP'] as const;
export type MoveItemCategory = (typeof MOVE_ITEM_CATEGORIES)[number];

export const MOVE_ITEM_CATEGORY_LABELS: Record<MoveItemCategory, string> = {
  TENANCY: 'Tenancy',
  PROPERTY: 'Property',
  SAFETY: 'Safety',
  FINANCE: 'Rent and benefits',
  SUPPORT: 'Support',
  HEALTH: 'Health',
  PARTNERSHIP: 'Partner agencies'
};

export type MoveChecklistTemplateItem = {
  label: string;
  category: MoveItemCategory;
  /** Days relative to the target move date — negative means before the move. */
  offsetDays: number;
  /** Required items block completion; optional ones are recorded but not essential. */
  required: boolean;
};

export type MoveChecklistItemRecord = {
  label?: string;
  category?: string | null;
  status: string;
  dueAt?: Date | null;
  required?: boolean;
};


export const MOVE_IN_TEMPLATE: readonly MoveChecklistTemplateItem[] = [
  { label: 'Pre-admission visit completed and room viewed', category: 'SUPPORT', offsetDays: -21, required: true },
  { label: 'Referral and eligibility decision confirmed', category: 'TENANCY', offsetDays: -21, required: true },
  { label: 'Risk assessment and support plan agreed with the person', category: 'SUPPORT', offsetDays: -14, required: true },
  { label: 'Housing benefit or Universal Credit claim started', category: 'FINANCE', offsetDays: -14, required: true },
  { label: 'Tenancy agreement signed and rent explained', category: 'TENANCY', offsetDays: -7, required: true },
  { label: 'Gas, electrical, and fire certificates in date', category: 'SAFETY', offsetDays: -7, required: true },
  { label: 'Utility accounts set up in the person\u2019s name', category: 'PROPERTY', offsetDays: -7, required: false },
  { label: 'Room clean, safe, furnished, and ready', category: 'PROPERTY', offsetDays: -2, required: true },
  { label: 'Smoke and heat alarms tested, keys and fob issued', category: 'SAFETY', offsetDays: -1, required: true },
  { label: 'Welcome pack, house rules, and emergency numbers given', category: 'SUPPORT', offsetDays: 0, required: true },
  { label: 'Belongings moved in and any damage noted', category: 'PROPERTY', offsetDays: 0, required: false },
  { label: 'Key worker, support worker, and contact schedule confirmed', category: 'SUPPORT', offsetDays: 0, required: true },
  { label: 'Medication, GP, and pharmacy arrangements transferred', category: 'HEALTH', offsetDays: 3, required: true },
  { label: 'External support transferred in (housing, health, substance use)', category: 'PARTNERSHIP', offsetDays: 7, required: false },
  { label: 'First-week review booked and documented', category: 'SUPPORT', offsetDays: 7, required: true }
];

export const MOVE_OUT_TEMPLATE: readonly MoveChecklistTemplateItem[] = [
  { label: 'Notice given and move-out date agreed', category: 'TENANCY', offsetDays: -28, required: true },
  { label: 'Move-on accommodation confirmed and affordable', category: 'TENANCY', offsetDays: -21, required: true },
  { label: 'Support plan updated with move-on goals', category: 'SUPPORT', offsetDays: -21, required: true },
  { label: 'Rent account cleared or repayment plan agreed', category: 'FINANCE', offsetDays: -14, required: true },
  { label: 'Housing benefit or Universal Credit notified of the change', category: 'FINANCE', offsetDays: -14, required: true },
  { label: 'Utility accounts closed and final readings taken', category: 'PROPERTY', offsetDays: -7, required: false },
  { label: 'Ongoing support arrangements confirmed with new provider', category: 'PARTNERSHIP', offsetDays: -7, required: false },
  { label: 'Room cleaned, condition inspected, damage assessed', category: 'PROPERTY', offsetDays: 0, required: true },
  { label: 'Keys, fobs, and equipment returned', category: 'SAFETY', offsetDays: 0, required: true },
  { label: 'Belongings packed and removed', category: 'PROPERTY', offsetDays: 0, required: true },
  { label: 'Forwarding address and contact details recorded', category: 'TENANCY', offsetDays: 0, required: true },
  { label: 'Health, GP, and substance-use support transferred', category: 'HEALTH', offsetDays: 0, required: true },
  { label: 'Final support session held and closure summary written', category: 'SUPPORT', offsetDays: 0, required: true },
  { label: 'Any outstanding maintenance logged for the void period', category: 'PROPERTY', offsetDays: 1, required: false }
];

export function moveChecklistTemplate(type: string): readonly MoveChecklistTemplateItem[] {
  return type === 'MOVE_OUT' ? MOVE_OUT_TEMPLATE : MOVE_IN_TEMPLATE;
}

/** Required step labels for a checklist type, so stored items can be validated against the template. */
export function requiredItemLabels(type: string): string[] {
  return moveChecklistTemplate(type).filter((item) => item.required).map((item) => item.label);
}

export function isRequiredItem(type: string, label: string): boolean {
  return requiredItemLabels(type).includes(label);
}

export type GeneratedChecklistItem = {
  label: string;
  category: string;
  status: MoveItemStatus;
  dueAt: Date | null;
  sortOrder: number;
  required: boolean;
};

/** Expands a template into rows ready to persist against a checklist. */
export function buildChecklistItems(type: string, targetDate: Date | null | undefined): GeneratedChecklistItem[] {
  return moveChecklistTemplate(type).map((item, index) => ({
    label: item.label,
    category: item.category,
    status: 'PENDING' as MoveItemStatus,
    dueAt: targetDate ? addDays(targetDate, item.offsetDays) : null,
    sortOrder: index + 1,
    required: item.required
  }));
}


export type ChecklistProgress = {
  total: number;
  applicable: number;
  done: number;
  inProgress: number;
  blocked: number;
  pending: number;
  percent: number;
  status: MoveChecklistStatus;
  outstandingRequired: number;
  requiredIncomplete: string[];
  readyToComplete: boolean;
};

export function isItemOpen(status: string): boolean {
  return status !== 'DONE' && status !== 'NOT_APPLICABLE';
}

/** `type` lets required items be identified from the template when the row does not store it. */
export function checklistProgress(items: MoveChecklistItemRecord[], type = 'MOVE_IN'): ChecklistProgress {
  const applicable = items.filter((item) => item.status !== 'NOT_APPLICABLE');
  const done = items.filter((item) => item.status === 'DONE');
  const requiredIncomplete = applicable
    .filter((item) => item.status !== 'DONE')
    .filter((item) => item.required ?? (item.label ? isRequiredItem(type, item.label) : false))
    .map((item) => item.label ?? 'Untitled step');
  const percent = applicable.length ? Math.round((done.length / applicable.length) * 100) : 0;
  return {
    total: items.length,
    applicable: applicable.length,
    done: done.length,
    inProgress: items.filter((item) => item.status === 'IN_PROGRESS').length,
    blocked: items.filter((item) => item.status === 'BLOCKED').length,
    pending: items.filter((item) => item.status === 'PENDING').length,
    percent,
    status: checklistStatusFromItems(items, type),
    outstandingRequired: requiredIncomplete.length,
    requiredIncomplete,
    readyToComplete: items.length > 0 && requiredIncomplete.length === 0
  };
}

/** Status is derived from the items so the checklist header can never contradict its steps. */
export function checklistStatusFromItems(items: MoveChecklistItemRecord[], type = 'MOVE_IN'): MoveChecklistStatus {
  if (!items.length) return 'NOT_STARTED';
  const applicable = items.filter((item) => item.status !== 'NOT_APPLICABLE');
  if (!applicable.length) return 'NOT_STARTED';
  if (applicable.every((item) => item.status === 'DONE')) return 'COMPLETED';
  if (items.some((item) => item.status !== 'PENDING')) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

export function blockedChecklistItems(items: MoveChecklistItemRecord[]): string[] {
  return items.filter((item) => item.status === 'BLOCKED').map((item) => item.label ?? 'Untitled step');
}

export function nextChecklistItemDue(items: MoveChecklistItemRecord[], now = new Date()): MoveChecklistItemRecord | null {
  const open = items.filter((item) => isItemOpen(item.status) && !!item.dueAt);
  if (!open.length) return null;
  return open.reduce((soonest, item) => ((item.dueAt as Date).getTime() < (soonest.dueAt as Date).getTime() ? item : soonest), open[0]);
}

export function overdueChecklistItems(items: MoveChecklistItemRecord[], now = new Date()): MoveChecklistItemRecord[] {
  return items.filter((item) => isItemOpen(item.status) && !!item.dueAt && isPast(item.dueAt, now));
}

export function checklistItemDueLabel(item: MoveChecklistItemRecord, now = new Date()): string {
  if (item.status === 'DONE') return 'Completed';
  if (!item.dueAt) return 'No due date';
  const days = Math.round((item.dueAt.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

/** Groups items by category for the checklist page's sections. */
export function groupChecklistItems(items: MoveChecklistItemRecord[]): Array<{ category: string; label: string; items: MoveChecklistItemRecord[] }> {
  const groups: Array<{ category: string; label: string; items: MoveChecklistItemRecord[] }> = [];
  for (const category of MOVE_ITEM_CATEGORIES) {
    const matching = items.filter((item) => (item.category ?? 'SUPPORT') === category);
    if (matching.length) groups.push({ category, label: MOVE_ITEM_CATEGORY_LABELS[category], items: matching });
  }
  const uncategorised = items.filter((item) => !MOVE_ITEM_CATEGORIES.includes((item.category ?? '') as MoveItemCategory));
  if (uncategorised.length) groups.push({ category: 'OTHER', label: 'Other', items: uncategorised });
  return groups;
}

/** Once every required step is signed off the checklist can be closed and the move recorded. */
export function canCompleteChecklist(items: MoveChecklistItemRecord[], type = 'MOVE_IN'): boolean {
  return checklistProgress(items, type).readyToComplete;
}

export function checklistBlocking(items: MoveChecklistItemRecord[], type = 'MOVE_IN'): string[] {
  const progress = checklistProgress(items, type);
  const blockers = blockedChecklistItems(items).map((label) => `${label} (blocked)`);
  return [...blockers, ...progress.requiredIncomplete.filter((label) => !blockers.some((entry) => entry.startsWith(label)))];
}
