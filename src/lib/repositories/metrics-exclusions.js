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

/** The same rule as a `where` fragment for `prisma.session` queries. */
export const COUNTED_SESSION_WHERE = {
  course: { code: { notIn: METRICS_EXCLUDED_COURSE_CODES } },
};
