/**
 * How long a tutoring session can last. Client-safe (no server imports): the
 * booking calendar offers exactly what the server accepts.
 *
 *  - Students pick 1 h, 1 h 30 or 2 h. Each tutor caps it with
 *    `schedules.max_session_minutes` (default 2 h: everyone accepts all three).
 *  - A tutor's daily limit (`schedules.max_sessions_per_day`, field
 *    `maxHoursPerDay`) counts HOURS of tutoring, not sessions.
 *  - Price = course price per hour × hours (src/lib/payments/session-amount.js).
 *
 * Manual sessions (admin) offer the same durations (manual-session-slots.js).
 */

export const SESSION_DURATIONS = Object.freeze([60, 90, 120]);
export const DEFAULT_SESSION_MINUTES = 60;
export const DEFAULT_MAX_SESSION_MINUTES = 120;
export const DEFAULT_MAX_HOURS_PER_DAY = 5;
export const MAX_HOURS_PER_DAY_LIMIT = 12;

/** A tutor's cap, falling back to the default for unknown or missing values. */
export function maxSessionMinutesOf(schedule) {
  const value = Number(schedule?.maxSessionMinutes);
  return SESSION_DURATIONS.includes(value) ? value : DEFAULT_MAX_SESSION_MINUTES;
}

/** A tutor's daily limit in hours. */
export function maxHoursPerDayOf(schedule) {
  const value = Number(schedule?.maxHoursPerDay);
  return Number.isInteger(value) && value >= 1 ? value : DEFAULT_MAX_HOURS_PER_DAY;
}

/** Durations a tutor accepts, shortest first. */
export function durationsUpTo(maxMinutes = DEFAULT_MAX_SESSION_MINUTES) {
  return SESSION_DURATIONS.filter((m) => m <= maxMinutes);
}

/** Whether `minutes` is an offered duration within the tutor's cap. */
export function isAllowedDuration(minutes, maxMinutes = DEFAULT_MAX_SESSION_MINUTES) {
  return SESSION_DURATIONS.includes(minutes) && minutes <= maxMinutes;
}

/** Minutes between two instants (rounded); NaN for invalid input. */
export function minutesBetween(start, end) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
}
