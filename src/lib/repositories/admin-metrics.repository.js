/**
 * Admin Metrics Repository
 *
 * Read-only aggregate queries for the admin dashboard. Uses Prisma
 * `$queryRaw` for time-bucketed series with `DATE_TRUNC` because Prisma's
 * groupBy doesn't support date truncation.
 *
 * All amounts are returned as JS numbers (Prisma serialises Decimals to
 * strings; we coerce here) so the API layer doesn't need to think about it.
 */

import prisma from '../prisma';

// ─── Helpers ────────────────────────────────────────────────────────────

const toNumber = (v) => (v == null ? 0 : Number(v));

// ─── KPIs ───────────────────────────────────────────────────────────────

/** Sessions completed since the start of the current ISO week (Monday). */
export async function sessionsThisWeek() {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n
    FROM sessions
    WHERE status = 'Completed'
      AND start_timestamp >= DATE_TRUNC('week', NOW());
  `;
  return toNumber(rows[0]?.n);
}

/** Gross revenue (sum of `payments.amount`) for the current calendar month. */
export async function revenueThisMonth() {
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(SUM(amount), 0)::float8 AS total
    FROM payments
    WHERE status = 'paid'
      AND created_at >= DATE_TRUNC('month', NOW());
  `;
  return toNumber(rows[0]?.total);
}

/** Distinct tutors who taught at least one completed session in the last N days. */
export async function activeTutorsCount({ days = 30 } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT tutor_id)::int AS n
    FROM sessions
    WHERE status = 'Completed'
      AND start_timestamp >= NOW() - (${days}::int * INTERVAL '1 day');
  `;
  return toNumber(rows[0]?.n);
}

/** Number of tutor applications still awaiting review. */
export async function pendingApplicationsCount() {
  return prisma.tutorApplication.count({ where: { status: 'Pending' } });
}

// ─── Time series ────────────────────────────────────────────────────────

/**
 * Weekly session counts (Completed vs Canceled) for the last `weeks` weeks.
 * Buckets start on Monday (DATE_TRUNC's default).
 */
export async function sessionsByWeek({ weeks = 12 } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT
      DATE_TRUNC('week', start_timestamp)                                    AS week_start,
      COUNT(*) FILTER (WHERE status = 'Completed')::int                      AS completed,
      COUNT(*) FILTER (WHERE status = 'Canceled')::int                       AS canceled,
      COUNT(*) FILTER (WHERE status IN ('Pending', 'Accepted'))::int         AS upcoming
    FROM sessions
    WHERE start_timestamp >= NOW() - (${weeks}::int * INTERVAL '1 week')
    GROUP BY 1
    ORDER BY 1;
  `;
  return rows.map((r) => ({
    weekStart: r.week_start,
    completed: toNumber(r.completed),
    canceled:  toNumber(r.canceled),
    upcoming:  toNumber(r.upcoming),
  }));
}

/**
 * Monthly revenue series for the last `months` months.
 * Returns gross only — Calico-fee/payout split is left to a future step
 * once the fee model is canonical (currently mixed across payments rows).
 */
export async function revenueByMonth({ months = 12 } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT
      DATE_TRUNC('month', created_at)              AS month_start,
      COALESCE(SUM(amount), 0)::float8             AS gross,
      COUNT(*)::int                                AS payments_count
    FROM payments
    WHERE status = 'paid'
      AND created_at >= NOW() - (${months}::int * INTERVAL '1 month')
    GROUP BY 1
    ORDER BY 1;
  `;
  return rows.map((r) => ({
    monthStart:    r.month_start,
    gross:         toNumber(r.gross),
    paymentsCount: toNumber(r.payments_count),
  }));
}

// ─── Rankings ───────────────────────────────────────────────────────────

/**
 * Most-requested courses in the last `days` days, ordered by completed sessions.
 */
export async function topCourses({ days = 30, limit = 10 } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT
      c.id,
      c.code,
      c.name,
      COUNT(s.id)::int AS sessions
    FROM sessions s
    JOIN courses c ON c.id = s.course_id
    WHERE s.status = 'Completed'
      AND s.start_timestamp >= NOW() - (${days}::int * INTERVAL '1 day')
    GROUP BY c.id, c.code, c.name
    ORDER BY sessions DESC
    LIMIT ${limit}::int;
  `;
  return rows.map((r) => ({
    id:       r.id,
    code:     r.code,
    name:     r.name,
    sessions: toNumber(r.sessions),
  }));
}

/**
 * Top tutors by completed sessions in the last `days` days. Joins to the
 * user record for name/email and to tutor_profiles for rating.
 */
export async function topTutors({ days = 30, limit = 10 } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT
      u.id,
      u.name,
      u.email,
      tp.review::float8     AS rating,
      tp.num_review::int    AS num_reviews,
      COUNT(s.id)::int      AS sessions
    FROM sessions s
    JOIN users u           ON u.id = s.tutor_id
    LEFT JOIN tutor_profiles tp ON tp.user_id = u.id
    WHERE s.status = 'Completed'
      AND s.start_timestamp >= NOW() - (${days}::int * INTERVAL '1 day')
    GROUP BY u.id, u.name, u.email, tp.review, tp.num_review
    ORDER BY sessions DESC
    LIMIT ${limit}::int;
  `;
  return rows.map((r) => ({
    id:         r.id,
    name:       r.name,
    email:      r.email,
    rating:     r.rating != null ? toNumber(r.rating) : null,
    numReviews: toNumber(r.num_reviews),
    sessions:   toNumber(r.sessions),
  }));
}
