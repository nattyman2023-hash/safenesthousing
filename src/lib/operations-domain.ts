import { daysBetween, isWithinDays } from './dates';

/** Repairs and appointments: the operational side of the CRM. SLA windows, ageing, and status
 * transitions live here so a ticket's target date and priority are always derived consistently. */

export const MAINTENANCE_STATUSES = [
  'REPORTED',
  'TRIAGED',
  'AWAITING_PARTS',
  'SCHEDULED',
  'IN_PROGRESS',
  'ON_HOLD',
  'NO_ACCESS',
  'COMPLETED',
  'CANCELLED'
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

const maintenanceTransitionMap: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  REPORTED: ['TRIAGED', 'SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
  TRIAGED: ['SCHEDULED', 'AWAITING_PARTS', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  AWAITING_PARTS: ['SCHEDULED', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'NO_ACCESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'ON_HOLD', 'AWAITING_PARTS', 'NO_ACCESS', 'CANCELLED'],
  ON_HOLD: ['SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
  NO_ACCESS: ['SCHEDULED', 'CANCELLED'],
  COMPLETED: ['IN_PROGRESS'],
  CANCELLED: ['REPORTED']
};

export function canTransitionMaintenance(from: string, to: string): boolean {
  return (maintenanceTransitionMap[from as MaintenanceStatus] ?? []).includes(to as MaintenanceStatus);
}

export function assertMaintenanceTransition(from: string, to: string): void {
  if (!canTransitionMaintenance(from, to)) throw new Error(`Invalid maintenance transition: ${from} -> ${to}`);
}

export function nextMaintenanceStatuses(from: string): MaintenanceStatus[] {
  return maintenanceTransitionMap[from as MaintenanceStatus] ?? [];
}

export function isMaintenanceOpen(status: string): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED';
}

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  REPORTED: 'Reported',
  TRIAGED: 'Triaged',
  AWAITING_PARTS: 'Awaiting parts',
  SCHEDULED: 'Visit booked',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  NO_ACCESS: 'No access',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

export const MAINTENANCE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

/** Hours allowed from the moment a job is reported until it should be fixed. */
export const MAINTENANCE_SLA_HOURS: Record<MaintenancePriority, number> = {
  URGENT: 4,
  HIGH: 24,
  MEDIUM: 72,
  LOW: 168
};

export const MAINTENANCE_CATEGORIES = [
  'GENERAL',
  'PLUMBING',
  'ELECTRICAL',
  'HEATING',
  'GAS',
  'DAMP_MOULD',
  'DECORATION',
  'APPLIANCE',
  'SECURITY',
  'PEST',
  'CLEANING',
  'FIRE_SAFETY',
  'STRUCTURAL',
  'GARDEN'
] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

export const MAINTENANCE_TRADES = [
  'GENERAL',
  'PLUMBER',
  'ELECTRICIAN',
  'GAS_ENGINEER',
  'JOINER',
  'DECORATOR',
  'CLEANER',
  'PEST_CONTROL',
  'ROOFER',
  'LOCKSMITH',
  'APPLIANCE_ENGINEER',
  'LANDSCAPER'
] as const;
export type MaintenanceTrade = (typeof MAINTENANCE_TRADES)[number];

/** Categories where a repair carries a safety duty escalate the SLA regardless of chosen priority. */
const safetyCriticalCategories: MaintenanceCategory[] = ['GAS', 'ELECTRICAL', 'FIRE_SAFETY', 'SECURITY'];

export function isSafetyCriticalCategory(category: string): boolean {
  return safetyCriticalCategories.includes(category as MaintenanceCategory);
}

/** A job flagged as a safety risk, or logged in a safety-critical category, uses the urgent SLA. */
export function effectiveMaintenancePriority(priority: string, category: string, safetyRisk = false): MaintenancePriority {
  if (safetyRisk || isSafetyCriticalCategory(category)) return 'URGENT';
  return (MAINTENANCE_PRIORITIES.includes(priority as MaintenancePriority) ? priority : 'MEDIUM') as MaintenancePriority;
}

export function maintenanceSlaHours(priority: string, category: string, safetyRisk = false): number {
  return MAINTENANCE_SLA_HOURS[effectiveMaintenancePriority(priority, category, safetyRisk)];
}


export type MaintenanceSlaState = 'CLOSED' | 'ON_TRACK' | 'DUE_SOON' | 'BREACHED';

export function maintenanceSlaState(
  ticket: { status: string; reportedAt: Date; targetFixAt?: Date | null; priority: string; category: string; safetyRisk?: boolean },
  now = new Date()
): MaintenanceSlaState {
  if (!isMaintenanceOpen(ticket.status)) return 'CLOSED';
  const target = ticket.targetFixAt ?? maintenanceTargetFixAt(ticket.reportedAt, ticket.priority, ticket.category, ticket.safetyRisk);
  if (target.getTime() < now.getTime()) return 'BREACHED';
  return isWithinDays(target, 1, now) ? 'DUE_SOON' : 'ON_TRACK';
}

export function maintenanceAgeDays(ticket: { reportedAt: Date; completedAt?: Date | null }, now = new Date()): number {
  return Math.max(0, daysBetween(ticket.reportedAt, ticket.completedAt ?? now));
}

export function maintenanceSlaLabel(
  ticket: { status: string; reportedAt: Date; targetFixAt?: Date | null; priority: string; category: string; safetyRisk?: boolean },
  now = new Date()
): string {
  const state = maintenanceSlaState(ticket, now);
  if (state === 'CLOSED') return 'Closed';
  const target = ticket.targetFixAt ?? maintenanceTargetFixAt(ticket.reportedAt, ticket.priority, ticket.category, ticket.safetyRisk);
  if (state === 'BREACHED') {
    const lateDays = Math.max(1, Math.floor((now.getTime() - target.getTime()) / 86_400_000));
    return `${lateDays} day${lateDays === 1 ? '' : 's'} past target`;
  }
  const hoursLeft = Math.max(0, Math.round((target.getTime() - now.getTime()) / 3_600_000));
  if (hoursLeft <= 24) return `${hoursLeft} hour${hoursLeft === 1 ? '' : 's'} left`;
  return `${Math.round(hoursLeft / 24)} days left`;
}

/** Jobs that have quietly gone stale or slipped past their target need escalation to supervision. */
export function maintenanceEscalationRequired(
  ticket: { status: string; reportedAt: Date; priority: string; category: string; safetyRisk?: boolean; targetFixAt?: Date | null },
  now = new Date()
): boolean {
  if (!isMaintenanceOpen(ticket.status)) return false;
  if (maintenanceSlaState(ticket, now) === 'BREACHED') return true;
  return maintenanceAgeDays({ reportedAt: ticket.reportedAt }, now) >= 14 && (ticket.priority === 'LOW' || ticket.priority === 'MEDIUM');
}

export function buildMaintenanceReference(sequence: number, reportedAt: Date): string {
  return `MT-${reportedAt.getFullYear()}-${String(sequence).padStart(4, '0')}`;
}

export type MaintenanceSummary = {
  total: number;
  open: number;
  breached: number;
  dueSoon: number;
  awaitingParts: number;
  noAccess: number;
  safetyRisks: number;
  completedThisPeriod: number;
  averageFixDays: number | null;
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
};

export function summariseMaintenance(
  tickets: Array<{ status: string; reportedAt: Date; completedAt?: Date | null; priority: string; category: string; safetyRisk?: boolean; targetFixAt?: Date | null }>,
  now = new Date()
): MaintenanceSummary {
  const byPriority: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const fixDurations: number[] = [];
  let open = 0;
  let breached = 0;
  let dueSoon = 0;
  let awaitingParts = 0;
  let noAccess = 0;
  let safetyRisks = 0;
  let completed = 0;
  for (const ticket of tickets) {
    byPriority[ticket.priority] = (byPriority[ticket.priority] ?? 0) + 1;
    byCategory[ticket.category] = (byCategory[ticket.category] ?? 0) + 1;
    if (ticket.safetyRisk) safetyRisks += 1;
    if (ticket.completedAt) {
      completed += 1;
      fixDurations.push(maintenanceAgeDays(ticket, ticket.completedAt));
      continue;
    }
    if (ticket.status === 'AWAITING_PARTS') awaitingParts += 1;
    if (ticket.status === 'NO_ACCESS') noAccess += 1;
    if (!isMaintenanceOpen(ticket.status)) continue;
    open += 1;
    const state = maintenanceSlaState(ticket, now);
    if (state === 'BREACHED') breached += 1;
    if (state === 'DUE_SOON') dueSoon += 1;
  }
  return {
    total: tickets.length,
    open,
    breached,
    dueSoon,
    awaitingParts,
    noAccess,
    safetyRisks,
    completedThisPeriod: completed,
    averageFixDays: fixDurations.length ? Math.round((fixDurations.reduce((total, days) => total + days, 0) / fixDurations.length) * 10) / 10 : null,
    byPriority,
    byCategory
  };
}

/** Target fix time = reported time + SLA hours for the effective priority. */
export function maintenanceTargetFixAt(reportedAt: Date, priority: string, category: string, safetyRisk = false): Date {
  const hours = maintenanceSlaHours(priority, category, safetyRisk);
  return new Date(reportedAt.getTime() + hours * 3_600_000);
}
