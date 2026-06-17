/**
 * Admin Growth Repository
 *
 * Read-only aggregate queries powering the "Crecimiento" admin page:
 *   - Repeat / retention (do students come back?)
 *   - Retention cohorts (does retention improve month over month?)
 *   - Course profitability (which subjects make or lose money?)
 *
 * Same conventions as admin-metrics.repository: raw SQL via `$queryRaw`
 * (for DATE_TRUNC / window functions / PERCENTILE_CONT that Prisma's
 * groupBy can't express), Decimals coerced to JS numbers here, camelCase
 * keys returned so the service/API never deal with snake_case.
 *
 * Segmentation:
 *   - `careerId`  filters by the STUDENT's career (who our loyal customers
 *     are) — used by retention + cohorts.
 * Nullable params use `null` for "all". The `${x}::text IS NULL` guard makes
 * a single query serve both the filtered and unfiltered case.
 */

import prisma from '../prisma';

const toNumber = (v) => (v == null ? 0 : Number(v));
const toNullableNumber = (v) => (v == null ? null : Number(v));

// ─── Retention / repeat ───────────────────────────────────────────────────

/**
 * Repeat behaviour for students with at least one completed session in the
 * last `days` days, optionally restricted to a student career.
 *
 * Returns:
 *   - students:            distinct students active in the window
 *   - repeaters:           those with ≥2 completed sessions in the window
 *   - sameTutorRepeaters:  those with ≥2 completed sessions with one same tutor
 *   - medianGapDays:       median days between consecutive sessions (null if none)
 *   - repeatTicket / newTicket: avg paid amount per session for repeaters vs not
 */
export async function repeatOverview({ days = 90, careerId = null } = {}) {
  const rows = await prisma.$queryRaw`
    WITH base AS (
      SELECT sp.student_id, sp.session_id, s.tutor_id, s.start_timestamp
      FROM session_participants sp
      JOIN sessions s ON s.id = sp.session_id
      JOIN users    u ON u.id = sp.student_id
      WHERE s.status = 'Completed'
        AND s.start_timestamp >= NOW() - (${days}::int * INTERVAL '1 day')
        AND (${careerId}::text IS NULL OR u.career_id = ${careerId})
    ),
    per_student AS (
      SELECT student_id, COUNT(*)::int AS n
      FROM base GROUP BY student_id
    ),
    same_tutor AS (
      SELECT student_id
      FROM base
      GROUP BY student_id, tutor_id
      HAVING COUNT(*) >= 2
    ),
    gaps AS (
      SELECT EXTRACT(EPOCH FROM (
               start_timestamp
               - LAG(start_timestamp) OVER (PARTITION BY student_id ORDER BY start_timestamp)
             )) / 86400.0 AS gap_days
      FROM base
    ),
    tickets AS (
      SELECT ps.n, p.amount::float8 AS amount
      FROM base b
      JOIN per_student ps ON ps.student_id = b.student_id
      JOIN payments p ON p.session_id = b.session_id
                     AND p.student_id  = b.student_id
                     AND p.status = 'paid'
    )
    SELECT
      (SELECT COUNT(*) FROM per_student)::int                                    AS students,
      (SELECT COUNT(*) FROM per_student WHERE n >= 2)::int                       AS repeaters,
      (SELECT COUNT(DISTINCT student_id) FROM same_tutor)::int                   AS same_tutor_repeaters,
      (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_days)
         FROM gaps WHERE gap_days IS NOT NULL)::float8                           AS median_gap_days,
      (SELECT AVG(amount) FROM tickets WHERE n >= 2)::float8                     AS repeat_ticket,
      (SELECT AVG(amount) FROM tickets WHERE n < 2)::float8                      AS new_ticket;
  `;
  const r = rows[0] || {};
  return {
    students:            toNumber(r.students),
    repeaters:           toNumber(r.repeaters),
    sameTutorRepeaters:  toNumber(r.same_tutor_repeaters),
    medianGapDays:       toNullableNumber(r.median_gap_days),
    repeatTicket:        toNullableNumber(r.repeat_ticket),
    newTicket:           toNullableNumber(r.new_ticket),
  };
}

/**
 * Monthly first-session cohorts over the last `months` months. For each
 * cohort (month of a student's FIRST completed session) returns how many
 * students took a 2nd completed session within 30 / 60 / 90 days.
 *
 * Note: cohorts are inherently longitudinal, so this ignores any short day
 * range and always looks back `months` from the current month.
 */
export async function retentionCohorts({ months = 12, careerId = null } = {}) {
  const rows = await prisma.$queryRaw`
    WITH firsts AS (
      SELECT sp.student_id, MIN(s.start_timestamp) AS first_at
      FROM session_participants sp
      JOIN sessions s ON s.id = sp.session_id
      JOIN users    u ON u.id = sp.student_id
      WHERE s.status = 'Completed'
        AND (${careerId}::text IS NULL OR u.career_id = ${careerId})
      GROUP BY sp.student_id
    ),
    seconds AS (
      SELECT f.student_id, f.first_at, MIN(s2.start_timestamp) AS second_at
      FROM firsts f
      JOIN session_participants sp2 ON sp2.student_id = f.student_id
      JOIN sessions s2 ON s2.id = sp2.session_id
                      AND s2.status = 'Completed'
                      AND s2.start_timestamp > f.first_at
      GROUP BY f.student_id, f.first_at
    )
    SELECT
      DATE_TRUNC('month', f.first_at)                                                          AS cohort_month,
      COUNT(*)::int                                                                            AS new_students,
      COUNT(sd.second_at) FILTER (WHERE sd.second_at <= f.first_at + INTERVAL '30 day')::int   AS d30,
      COUNT(sd.second_at) FILTER (WHERE sd.second_at <= f.first_at + INTERVAL '60 day')::int   AS d60,
      COUNT(sd.second_at) FILTER (WHERE sd.second_at <= f.first_at + INTERVAL '90 day')::int   AS d90
    FROM firsts f
    LEFT JOIN seconds sd ON sd.student_id = f.student_id
    WHERE f.first_at >= DATE_TRUNC('month', NOW()) - (${months}::int * INTERVAL '1 month')
    GROUP BY 1
    ORDER BY 1;
  `;
  return rows.map((r) => ({
    cohortMonth: r.cohort_month,
    newStudents: toNumber(r.new_students),
    d30:         toNumber(r.d30),
    d60:         toNumber(r.d60),
    d90:         toNumber(r.d90),
  }));
}

// ─── Engagement (active users by last login) ──────────────────────────────

/**
 * Count active users by LAST SEEN within the last `days` days, split into
 * approved tutors vs pure students. "Active" = the user was in the app
 * recently — `users.last_seen_at` is refreshed on login and on the
 * /api/auth/me heartbeat (the JWT persists, so login alone isn't enough).
 * Only counts non-suspended users.
 *
 * Throws if the `last_seen_at` column doesn't exist yet — the service
 * catches that and degrades to null so the page still renders pre-migration.
 */
export async function activeUsersSince({ days = 7 } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE is_tutor_approved = true)::int   AS active_tutors,
      COUNT(*) FILTER (WHERE is_tutor_approved = false)::int  AS active_students
    FROM users
    WHERE is_active = true
      AND last_seen_at IS NOT NULL
      AND last_seen_at >= NOW() - (${days}::int * INTERVAL '1 day');
  `;
  const r = rows[0] || {};
  return {
    activeTutors:   toNumber(r.active_tutors),
    activeStudents: toNumber(r.active_students),
    windowDays:     days,
  };
}

// ─── Profitability ──────────────────────────────────────────────────────

/**
 * Per-course payment volume in the last `days` days. Returns raw gross +
 * count + sessions; the fee math (Calico net via fees.js) is applied in the
 * service so fees stay a single source of truth.
 */
export async function courseProfitability({ days = 90 } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT
      c.id,
      c.code,
      c.name,
      c.base_price::float8                 AS base_price,
      cp.price::float8                     AS list_price,
      COUNT(p.id)::int                     AS payments_count,
      COALESCE(SUM(p.amount), 0)::float8   AS gross,
      COUNT(DISTINCT s.id)::int            AS sessions
    FROM payments p
    JOIN sessions s ON s.id = p.session_id
    JOIN courses  c ON c.id = s.course_id
    LEFT JOIN course_prices cp ON cp.course_id = c.id
    WHERE p.status = 'paid'
      AND p.created_at >= NOW() - (${days}::int * INTERVAL '1 day')
    GROUP BY c.id, c.code, c.name, c.base_price, cp.price
    ORDER BY gross DESC;
  `;
  return rows.map((r) => ({
    id:            r.id,
    code:          r.code,
    name:          r.name,
    basePrice:     toNullableNumber(r.base_price),
    listPrice:     toNullableNumber(r.list_price),
    paymentsCount: toNumber(r.payments_count),
    gross:         toNumber(r.gross),
    sessions:      toNumber(r.sessions),
  }));
}
