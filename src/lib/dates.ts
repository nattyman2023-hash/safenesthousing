/** Small, dependency-free date helpers shared by the support and operations domain rules.
 * Everything here is pure so it can be unit tested without a database, and all comparisons are
 * made in local time because operational deadlines (contact, Safe & Well, complaints) are local. */

export const DAY_MS = 86_400_000;

export function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

/** Adds calendar months, clamping to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(value: Date, months: number): Date {
  const date = new Date(value);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDayOfMonth));
  return date;
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Monday-based week start, which matches how weekly support reporting is reviewed here. */
export function startOfWeek(value: Date): Date {
  const date = startOfDay(value);
  const offset = (date.getDay() + 6) % 7;
  return addDays(date, -offset);
}

export function endOfWeek(value: Date): Date {
  return endOfDay(addDays(startOfWeek(value), 6));
}

/** Whole days between two instants, signed, ignoring the time of day. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

export function isWeekend(value: Date): boolean {
  const day = value.getDay();
  return day === 0 || day === 6;
}

export function isWorkingDay(value: Date, holidays: Date[] = []): boolean {
  if (isWeekend(value)) return false;
  return !holidays.some((holiday) => isSameDay(holiday, value));
}

/** Statutory complaint timescales are expressed in working days, so weekends are always skipped.
 * Bank holidays can be supplied once the organisation publishes its closure calendar. */
export function addWorkingDays(value: Date, days: number, holidays: Date[] = []): Date {
  let date = startOfDay(value);
  let remaining = days;
  while (remaining > 0) {
    date = addDays(date, 1);
    if (isWorkingDay(date, holidays)) remaining -= 1;
  }
  return date;
}

export function countWorkingDays(from: Date, to: Date, holidays: Date[] = []): number {
  let date = startOfDay(from);
  const end = startOfDay(to);
  let total = 0;
  while (date.getTime() < end.getTime()) {
    date = addDays(date, 1);
    if (isWorkingDay(date, holidays)) total += 1;
  }
  return total;
}

/** Stable YYYY-MM-DD key in local time, used inside automation keys so generated work is
 * idempotent. Built from local parts on purpose: an ISO round-trip would shift the key for any
 * timezone east or west of UTC and produce duplicate or missing automation rows. */
export function dayKey(value: Date): string {
  const date = startOfDay(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Midnight on the given YYYY-MM-DD key in local time; the inverse of `dayKey`. */
export function fromDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
}

/** Renders a local date as YYYY-MM-DDTHH:mm for datetime-local inputs, without a UTC shift. */
export function toLocalDateTimeInput(value: Date | null | undefined): string {
  if (!value) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/** Renders a local date as YYYY-MM-DD for date inputs, without a UTC shift. */
export function toLocalDateInput(value: Date | null | undefined): string {
  if (!value) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function isPast(value: Date | null | undefined, now = new Date()): boolean {
  return !!value && value.getTime() < now.getTime();
}

export function isWithinDays(value: Date | null | undefined, days: number, now = new Date()): boolean {
  if (!value) return false;
  return value.getTime() <= endOfDay(addDays(now, days)).getTime();
}
