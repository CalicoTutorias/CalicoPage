/**
 * Courses that exist only to test the booking/payment flow end to end
 * (team accounts paying a few pesos through the real Wompi checkout). They
 * stay bookable, but no admin metric may count them: they neither earn nor
 * cost Calico anything. Matched by `courses.code` (unique, uppercase).
 *
 * Every Dashboard / Crecimiento query that reads sessions or payments must
 * apply `countedSession()` (raw SQL) or `COUNTED_SESSION_WHERE` (Prisma).
 */

import { Prisma } from '../../generated/prisma';

export const METRICS_EXCLUDED_COURSE_CODES = ['TEST123'];

/**
 * SQL predicate that keeps only sessions of real courses. `alias` is the
 * sessions alias of the calling query — a fixed identifier from our own
 * code, interpolated raw, so it's validated here and never request input.
 */
export function countedSession(alias = 's') {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  if (METRICS_EXCLUDED_COURSE_CODES.length === 0) return Prisma.sql`TRUE`;
  return Prisma.sql`${Prisma.raw(alias)}.course_id NOT IN (
    SELECT id FROM courses WHERE code IN (${Prisma.join(METRICS_EXCLUDED_COURSE_CODES)})
  )`;
}

/**
 * SQL predicate for a session that already happened: `Completed`, or `Accepted`
 * and past its end, because no screen marks a tutoring session as Completed. With
 * `Completed` alone the Dashboard would stay empty however many sessions ended.
 * Same rule as payouts.repository.payableSessionWhere. The alias rule is above.
 */
export function heldSession(alias = 's') {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  const s = Prisma.raw(alias);
  return Prisma.sql`(${s}.status = 'Completed' OR (${s}.status = 'Accepted' AND ${s}.end_timestamp < NOW()))`;
}

/** The same rule as a `where` fragment for `prisma.session` queries. */
export const COUNTED_SESSION_WHERE = {
  course: { code: { notIn: METRICS_EXCLUDED_COURSE_CODES } },
};

/** The same rule for `prisma.event` queries; an event's course is optional, so course-less events count. */
export const COUNTED_EVENT_WHERE = {
  OR: [
    { courseId: null },
    { course: { code: { notIn: METRICS_EXCLUDED_COURSE_CODES } } },
  ],
};
