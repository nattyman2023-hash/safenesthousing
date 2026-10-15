import { addDays, dayKey, endOfDay, isSameDay, startOfDay } from './dates';

/** Appointments and the staff calendar: timings, clashes, and the "outcome not recorded" prompt.
 * Everything here is derived from the stored times and status, so the calendar and the profile
 * timeline can never disagree with the appointments list. */

export const APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_ACCESS', 'MISSED'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

const appointmentTransitionMap: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_ACCESS', 'MISSED'],
  CONFIRMED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_ACCESS', 'MISSED'],
  IN_PROGRESS: ['COMPLETED', 'NO_ACCESS', 'MISSED'],
  COMPLETED: ['IN_PROGRESS'],
  CANCELLED: ['SCHEDULED'],
  NO_ACCESS: ['SCHEDULED', 'COMPLETED'],
  MISSED: ['SCHEDULED']
};

export function canTransitionAppointment(from: string, to: string): boolean {
  return (appointmentTransitionMap[from as AppointmentStatus] ?? []).includes(to as AppointmentStatus);
}

export function assertAppointmentTransition(from: string, to: string): void {
  if (!canTransitionAppointment(from, to)) throw new Error(`Invalid appointment transition: ${from} -> ${to}`);
}

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Scheduled',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_ACCESS: 'No access',
  MISSED: 'Missed'
};

export const APPOINTMENT_CATEGORIES = [
  'SUPPORT',
  'KEY_WORK',
  'REVIEW',
  'SAFE_WELL',
  'MAINTENANCE',
  'HOUSING',
  'HEALTH',
  'COURT',
  'BENEFITS',
  'MEDIATION',
  'TRAINING',
  'OTHER'
] as const;
export type AppointmentCategory = (typeof APPOINTMENT_CATEGORIES)[number];

export const APPOINTMENT_CATEGORY_LABELS: Record<AppointmentCategory, string> = {
  SUPPORT: 'Support session',
  KEY_WORK: 'Key work session',
  REVIEW: 'Review',
  SAFE_WELL: 'Safe & Well check',
  MAINTENANCE: 'Maintenance visit',
  HOUSING: 'Housing',
  HEALTH: 'Health appointment',
  COURT: 'Court or legal',
  BENEFITS: 'Benefits',
  MEDIATION: 'Mediation',
  TRAINING: 'Training',
  OTHER: 'Other'
};

export function isAppointmentOpen(status: string): boolean {
  return status === 'SCHEDULED' || status === 'CONFIRMED' || status === 'IN_PROGRESS';
}

export const APPOINTMENT_DEFAULT_MINUTES = 60;
export const APPOINTMENT_STARTING_SOON_MINUTES = 60;

export function defaultAppointmentEnd(startsAt: Date, minutes = APPOINTMENT_DEFAULT_MINUTES): Date {
  return new Date(startsAt.getTime() + minutes * 60_000);
}

export function appointmentDurationMinutes(appointment: { startsAt: Date; endsAt?: Date | null }): number {
  const end = appointment.endsAt ?? defaultAppointmentEnd(appointment.startsAt);
  return Math.max(0, Math.round((end.getTime() - appointment.startsAt.getTime()) / 60_000));
}

export type AppointmentTiming = 'UPCOMING' | 'STARTING_SOON' | 'IN_PROGRESS' | 'OVERDUE' | 'ENDED';

/** Where an appointment sits relative to now, independent of the stored status. */
export function appointmentTiming(appointment: { startsAt: Date; endsAt?: Date | null; status: string }, now = new Date()): AppointmentTiming {
  if (!isAppointmentOpen(appointment.status)) return 'ENDED';
  const end = appointment.endsAt ?? defaultAppointmentEnd(appointment.startsAt);
  if (now.getTime() < appointment.startsAt.getTime()) {
    const minutesAway = (appointment.startsAt.getTime() - now.getTime()) / 60_000;
    return minutesAway <= APPOINTMENT_STARTING_SOON_MINUTES ? 'STARTING_SOON' : 'UPCOMING';
  }
  if (now.getTime() <= end.getTime()) return 'IN_PROGRESS';
  return 'OVERDUE';
}

/** An open appointment whose time has passed needs an outcome recorded, not silent deletion. */
export function appointmentNeedsOutcome(appointment: { startsAt: Date; endsAt?: Date | null; status: string; completedAt?: Date | null }, now = new Date()): boolean {
  if (!isAppointmentOpen(appointment.status)) return false;
  const end = appointment.endsAt ?? defaultAppointmentEnd(appointment.startsAt);
  return !!appointment.completedAt ? false : now.getTime() > end.getTime() + 24 * 3_600_000;
}

export function appointmentTimingLabel(appointment: { startsAt: Date; endsAt?: Date | null; status: string }, now = new Date()): string {
  const timing = appointmentTiming(appointment, now);
  if (timing === 'ENDED') return APPOINTMENT_STATUS_LABELS[appointment.status as AppointmentStatus] ?? appointment.status;
  if (timing === 'IN_PROGRESS') return 'Happening now';
  if (timing === 'OVERDUE') return 'Outcome overdue';
  const minutes = Math.round((appointment.startsAt.getTime() - now.getTime()) / 60_000);
  if (timing === 'STARTING_SOON' && minutes <= 60) return minutes <= 1 ? 'Starting now' : `Starts in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Starts in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
}


export type CalendarAppointment = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  status: string;
  category?: string | null;
  ownerId?: string | null;
  clientId?: string | null;
  propertyId?: string | null;
};

/** Two appointments clash when they overlap in time and share an owner, service user, or property. */
export function appointmentsClash(a: CalendarAppointment, b: CalendarAppointment): boolean {
  if (a.id === b.id) return false;
  const endA = (a.endsAt ?? defaultAppointmentEnd(a.startsAt)).getTime();
  const endB = (b.endsAt ?? defaultAppointmentEnd(b.startsAt)).getTime();
  const overlaps = a.startsAt.getTime() < endB && b.startsAt.getTime() < endA;
  if (!overlaps) return false;
  const sharesOwner = !!a.ownerId && a.ownerId === b.ownerId;
  const sharesClient = !!a.clientId && a.clientId === b.clientId;
  const sharesProperty = !!a.propertyId && a.propertyId === b.propertyId;
  return sharesOwner || sharesClient || sharesProperty;
}

export type AppointmentClash = { first: CalendarAppointment; second: CalendarAppointment; reason: 'OWNER' | 'SERVICE_USER' | 'PROPERTY' };

export function findAppointmentClashes(appointments: CalendarAppointment[]): AppointmentClash[] {
  const open = appointments.filter((appointment) => isAppointmentOpen(appointment.status));
  const clashes: AppointmentClash[] = [];
  for (let index = 0; index < open.length; index += 1) {
    for (let other = index + 1; other < open.length; other += 1) {
      if (!appointmentsClash(open[index], open[other])) continue;
      const reason: AppointmentClash['reason'] = open[index].ownerId && open[index].ownerId === open[other].ownerId
        ? 'OWNER'
        : open[index].clientId && open[index].clientId === open[other].clientId
          ? 'SERVICE_USER'
          : 'PROPERTY';
      clashes.push({ first: open[index], second: open[other], reason });
    }
  }
  return clashes;
}

export function appointmentsOnDay(appointments: CalendarAppointment[], day: Date): CalendarAppointment[] {
  return appointments
    .filter((appointment) => isSameDay(appointment.startsAt, day))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export type AppointmentDay = { key: string; date: Date; appointments: CalendarAppointment[] };

/** Days from `from` (inclusive) onwards, including empty days so the week view keeps its shape. */
export function groupAppointmentsByDay(appointments: CalendarAppointment[], from: Date, days = 7): AppointmentDay[] {
  const start = startOfDay(from);
  return Array.from({ length: days }, (_unused, offset) => {
    const date = addDays(start, offset);
    return { key: dayKey(date), date, appointments: appointmentsOnDay(appointments, date) };
  });
}

export type AppointmentPeriodSummary = {
  total: number;
  today: number;
  thisWeek: number;
  startingSoon: number;
  needsOutcome: number;
  noAccess: number;
  missed: number;
  nextAppointment: CalendarAppointment | null;
};

export function summariseAppointments(appointments: CalendarAppointment[], now = new Date()): AppointmentPeriodSummary {
  const weekEnd = endOfDay(addDays(now, 6));
  const open = appointments.filter((appointment) => isAppointmentOpen(appointment.status));
  const future = open
    .filter((appointment) => appointment.startsAt.getTime() >= now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return {
    total: appointments.length,
    today: appointmentsOnDay(appointments, now).length,
    thisWeek: appointments.filter((appointment) => appointment.startsAt.getTime() >= startOfDay(now).getTime() && appointment.startsAt.getTime() <= weekEnd.getTime()).length,
    startingSoon: open.filter((appointment) => appointmentTiming(appointment, now) === 'STARTING_SOON').length,
    needsOutcome: appointments.filter((appointment) => appointmentNeedsOutcome(appointment, now)).length,
    noAccess: appointments.filter((appointment) => appointment.status === 'NO_ACCESS').length,
    missed: appointments.filter((appointment) => appointment.status === 'MISSED').length,
    nextAppointment: future[0] ?? null
  };
}

/** Timeline ordering for a single service user's profile tab. */
export function sortAppointmentsForTimeline(appointments: CalendarAppointment[], now = new Date()): CalendarAppointment[] {
  const upcomingWeight = (appointment: CalendarAppointment) => {
    const timing = appointmentTiming(appointment, now);
    if (timing === 'IN_PROGRESS') return 0;
    if (timing === 'STARTING_SOON') return 1;
    if (timing === 'UPCOMING') return 2;
    if (timing === 'OVERDUE') return 3;
    return 4;
  };
  return [...appointments].sort((a, b) => {
    const weight = upcomingWeight(a) - upcomingWeight(b);
    if (weight !== 0) return weight;
    const future = upcomingWeight(a) <= 2;
    return future ? a.startsAt.getTime() - b.startsAt.getTime() : b.startsAt.getTime() - a.startsAt.getTime();
  });
}
