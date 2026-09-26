import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const INDIA_TIMEZONE = "Asia/Kolkata";

/**
 * A business date is a plain calendar date, not a moment (PROJECT_SPEC § 6):
 * a shift belongs to 20 September, not to an instant on it. Prisma stores and
 * reads `@db.Date` columns at UTC midnight, so a business date is represented
 * as UTC midnight of that calendar day and compares exactly against them.
 *
 * It must NOT be built with `fromZonedTime`. That yields 18:30 UTC of the
 * previous day, which makes `lte` silently drop the final day of every range
 * and writes a dated row one day early. Timestamps that really are moments —
 * a price effective-from, a shift open time — do use `fromZonedTime`.
 */
export const businessDateFromInput = (value: string): Date =>
  new Date(`${value}T00:00:00.000Z`);

/** Today's calendar date in India, as a business date. */
export const businessDateToday = (): Date =>
  businessDateFromInput(
    formatInTimeZone(new Date(), INDIA_TIMEZONE, "yyyy-MM-dd"),
  );

/** The `yyyy-MM-dd` form a date input expects. */
export const businessDateToInput = (value: Date): string =>
  value.toISOString().slice(0, 10);

export const displayBusinessDate = (value: Date): string =>
  formatInTimeZone(value, INDIA_TIMEZONE, "dd MMM yyyy");

/** Displays a real UTC timestamp as its India wall-clock date and time. */
export const displayIndiaDateTime = (value: Date): string =>
  formatInTimeZone(value, INDIA_TIMEZONE, "dd MMM yyyy, HH:mm:ss");

/** A real moment: local wall-clock time in India, converted to UTC. */
export const indiaTimestamp = (businessDate: string, hhmm: string): Date =>
  fromZonedTime(`${businessDate}T${hhmm}:00`, INDIA_TIMEZONE);

/** Shifts a business date by whole days without drifting across a timezone. */
export const addBusinessDays = (value: Date, days: number): Date =>
  new Date(value.getTime() + days * 86_400_000);
