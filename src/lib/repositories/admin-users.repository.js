/**
 * Admin Users Repository
 *
 * Read-only aggregate stats for a single user's admin profile page (the
 * "Usuarios" directory). Same conventions as admin-metrics / admin-growth:
 * raw SQL via `$queryRaw` for status breakdowns, DISTINCT counts and the
 * monthly activity series; Decimals coerced to JS numbers here.
 *
 * NOTE: these only return counts/sums, never PII — the user's identity
 * fields are loaded in the service with an explicit safe `select`.
 */

import prisma from '../prisma';

const toNumber = (v) => (v == null ? 0 : Number(v));

/**
 * Session activity where the user is the TUTOR, broken down by status,
 * plus the distinct students they taught and distinct courses they ran.
 */
export async function tutorSessionStats(userId) {
  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE status = 'Completed')::int                 AS completed,
      COUNT(*) FILTER (WHERE status = 'Canceled')::int                  AS canceled,
      COUNT(*) FILTER (WHERE status IN ('Pending', 'Accepted'))::int    AS upcoming,
      COUNT(*)::int                                                     AS total,
      COUNT(DISTINCT course_id)::int                                    AS distinct_courses,
      (SELECT COUNT(DISTINCT sp.student_id)
         FROM session_participants sp
         JOIN sessions s2 ON s2.id = sp.session_id
        WHERE s2.tutor_id = ${userId})::int                            AS distinct_students
    FROM sessions
    WHERE tutor_id = ${userId};
  `;
  const r = rows[0] || {};
  return {
    completed:        toNumber(r.completed),
    canceled:         toNumber(r.canceled),
    upcoming:         toNumber(r.upcoming),
    total:            toNumber(r.total),
    distinctCourses:  toNumber(r.distinct_courses),
    distinctStudents: toNumber(r.distinct_students),
  };
}

/**
 * Session activity where the user is the STUDENT (via session_participants),
 * broken down by status, plus distinct tutors and courses.
 */
export async function studentSessionStats(userId) {
  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE s.status = 'Completed')::int               AS completed,
      COUNT(*) FILTER (WHERE s.status = 'Canceled')::int                AS canceled,
      COUNT(*) FILTER (WHERE s.status IN ('Pending', 'Accepted'))::int  AS upcoming,
      COUNT(*)::int                                                     AS total,
      COUNT(DISTINCT s.course_id)::int                                  AS distinct_courses,
      COUNT(DISTINCT s.tutor_id)::int                                   AS distinct_tutors
    FROM session_participants sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE sp.student_id = ${userId};
  `;
  const r = rows[0] || {};
  return {
    completed:        toNumber(r.completed),
    canceled:         toNumber(r.canceled),
    upcoming:         toNumber(r.upcoming),
    total:            toNumber(r.total),
    distinctCourses:  toNumber(r.distinct_courses),
    distinctTutors:   toNumber(r.distinct_tutors),
  };
}

/**
 * Paid-payment totals for the user, both as a paying student (spent) and as
 * a tutor receiving payouts (gross earned). The 85% tutor share / Calico net
 * split is applied in the service via fees.js — this only returns gross.
 */
export async function financialStats(userId) {
  const rows = await prisma.$queryRaw`
    SELECT
      (SELECT COALESCE(SUM(amount), 0) FROM payments
        WHERE student_id = ${userId} AND status = 'paid')::float8                            AS spent_gross,
      (SELECT COUNT(*) FROM payments
        WHERE student_id = ${userId} AND status = 'paid')::int                               AS spent_payments,
      (SELECT COALESCE(SUM(amount), 0) FROM payments
        WHERE tutor_id = ${userId} AND status = 'paid')::float8                              AS earned_gross,
      (SELECT COUNT(*) FROM payments
        WHERE tutor_id = ${userId} AND status = 'paid')::int                                 AS earned_payments,
      (SELECT COALESCE(SUM(amount), 0) FROM payments
        WHERE tutor_id = ${userId} AND status = 'paid' AND tutor_payout_status = 'pending')::float8 AS earned_gross_pending;
  `;
  const r = rows[0] || {};
  return {
    spentGross:        toNumber(r.spent_gross),
    spentPayments:     toNumber(r.spent_payments),
    earnedGross:       toNumber(r.earned_gross),
    earnedPayments:    toNumber(r.earned_payments),
    earnedGrossPending: toNumber(r.earned_gross_pending),
  };
}

/**
 * Completed-session counts per month for the last `months` months, split by
 * the user's role in each session (tutor vs student). Returned as two raw
 * arrays; the service stitches them onto a continuous month axis.
 */
export async function monthlyActivity(userId, months = 12) {
  const since = Math.max(1, Math.min(months, 36));
  const [tutorRows, studentRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT DATE_TRUNC('month', start_timestamp) AS month, COUNT(*)::int AS n
      FROM sessions
      WHERE tutor_id = ${userId}
        AND status = 'Completed'
        AND start_timestamp >= DATE_TRUNC('month', NOW()) - ((${since}::int - 1) * INTERVAL '1 month')
      GROUP BY 1 ORDER BY 1;
    `,
    prisma.$queryRaw`
      SELECT DATE_TRUNC('month', s.start_timestamp) AS month, COUNT(*)::int AS n
      FROM session_participants sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.student_id = ${userId}
        AND s.status = 'Completed'
        AND s.start_timestamp >= DATE_TRUNC('month', NOW()) - ((${since}::int - 1) * INTERVAL '1 month')
      GROUP BY 1 ORDER BY 1;
    `,
  ]);
  const map = (rows) => rows.map((r) => ({ month: r.month, n: toNumber(r.n) }));
  return { tutor: map(tutorRows), student: map(studentRows) };
}
