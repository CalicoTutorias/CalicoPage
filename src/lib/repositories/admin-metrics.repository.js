/**
 * Admin Metrics Repository
 *
 * Read-only aggregate queries for the admin dashboard. Uses Prisma
 * `$queryRaw` for time-bucketed series with `DATE_TRUNC` because Prisma's
 * groupBy doesn't support date truncation.
 *
 * All amounts are returned as JS numbers (Prisma serialises Decimals to
 * strings; we coerce here) so the API layer doesn't need to think about it.
 *
 * Test courses (metrics-exclusions.js) are left out of every query that
 * reads sessions or payments.
 */

import prisma from '../prisma';
import { countedSession, COUNTED_SESSION_WHERE, COUNTED_EVENT_WHERE } from './metrics-exclusions';

// ─── Helpers ────────────────────────────────────────────────────────────

const toNumber = (v) => (v == null ? 0 : Number(v));

// ─── KPIs ───────────────────────────────────────────────────────────────

/** Sessions completed since the start of the current ISO week (Monday). */
export async function sessionsThisWeek() {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n
    FROM sessions s
    WHERE s.status = 'Completed'
      AND s.start_timestamp >= DATE_TRUNC('week', NOW())
      AND ${countedSession('s')};
  `;
  return toNumber(rows[0]?.n);
}

/**
 * Gross revenue (sum of `payments.amount`) for the current calendar month.
 * This is the platform volume — what students paid in total. The Calico
 * NET earning is computed in the service layer via `aggregateFinancials`.
 */
export async function revenueThisMonth() {
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(SUM(p.amount), 0)::float8 AS total
    FROM payments p
    JOIN sessions s ON s.id = p.session_id
    WHERE p.status = 'paid'
      AND p.created_at >= DATE_TRUNC('month', NOW())
      AND ${countedSession('s')};
  `;
  return toNumber(rows[0]?.total);
}

/**
 * Every paid payment of the current month with its money breakdown, so the
 * service can apply the fee math from `src/lib/payments/fees.js`:
 * `amount` (charged, what Wompi's fee applies to), `originalAmount` (list
 * price), `discountAmount`, `tutorPayoutBase` (what the tutor's 85 % is
 * computed on — the list price when Calico absorbed a coupon) and
 * `viaWompi` (false for manual sessions: no gateway, no Wompi fee).
 */
export async function paidPaymentsThisMonth() {
  const rows = await prisma.$queryRaw`
    SELECT
      p.amount::float8            AS amount,
      p.original_amount::float8   AS original_amount,
      p.discount_amount::float8   AS discount_amount,
      p.tutor_payout_base::float8 AS tutor_payout_base,
      (p.wompi_id IS NOT NULL)    AS via_wompi
    FROM payments p
    JOIN sessions s ON s.id = p.session_id
    WHERE p.status = 'paid'
      AND p.created_at >= DATE_TRUNC('month', NOW())
      AND ${countedSession('s')};
  `;
  return rows.map((r) => ({
    amount:          toNumber(r.amount),
    originalAmount:  toNumber(r.original_amount),
    discountAmount:  toNumber(r.discount_amount),
    tutorPayoutBase: toNumber(r.tutor_payout_base),
    viaWompi:        Boolean(r.via_wompi),
  }));
}

/** Distinct tutors who taught at least one completed session in the last N days. */
export async function activeTutorsCount({ days = 30 } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT s.tutor_id)::int AS n
    FROM sessions s
    WHERE s.status = 'Completed'
      AND s.start_timestamp >= NOW() - (${days}::int * INTERVAL '1 day')
      AND ${countedSession('s')};
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
    FROM sessions s
    WHERE s.start_timestamp >= NOW() - (${weeks}::int * INTERVAL '1 week')
      AND ${countedSession('s')}
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
 * Returns the SQL sums the fee math needs (fees.js applies the split):
 *   gross          Σ amount            — charged (Wompi's fee applies here)
 *   listGross      Σ original_amount   — list price before coupons
 *   discount       Σ discount_amount
 *   tutorBase      Σ tutor_payout_base — base of the tutor's 85 %
 *   discountCalico Σ (tutor_payout_base − amount) — discount Calico absorbed
 *   wompiGross / wompiCount — Σ amount / count of the real Wompi charges
 *                  (manual sessions and free bookings carry no gateway fee)
 */
export async function revenueByMonth({ months = 12 } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT
      DATE_TRUNC('month', p.created_at)                        AS month_start,
      COALESCE(SUM(p.amount), 0)::float8                       AS gross,
      COALESCE(SUM(p.original_amount), 0)::float8              AS list_gross,
      COALESCE(SUM(p.discount_amount), 0)::float8              AS discount,
      COALESCE(SUM(p.tutor_payout_base), 0)::float8            AS tutor_base,
      COALESCE(SUM(p.tutor_payout_base - p.amount), 0)::float8 AS discount_calico,
      COUNT(*)::int                                            AS payments_count,
      COALESCE(SUM(p.amount) FILTER (WHERE p.wompi_id IS NOT NULL AND p.amount > 0), 0)::float8 AS wompi_gross,
      COUNT(*) FILTER (WHERE p.wompi_id IS NOT NULL AND p.amount > 0)::int                       AS wompi_count
    FROM payments p
    JOIN sessions s ON s.id = p.session_id
    WHERE p.status = 'paid'
      AND p.created_at >= NOW() - (${months}::int * INTERVAL '1 month')
      AND ${countedSession('s')}
    GROUP BY 1
    ORDER BY 1;
  `;
  return rows.map((r) => ({
    monthStart:     r.month_start,
    gross:          toNumber(r.gross),
    listGross:      toNumber(r.list_gross),
    discount:       toNumber(r.discount),
    tutorBase:      toNumber(r.tutor_base),
    discountCalico: toNumber(r.discount_calico),
    paymentsCount:  toNumber(r.payments_count),
    wompiGross:     toNumber(r.wompi_gross),
    wompiCount:     toNumber(r.wompi_count),
  }));
}

// ─── Repasos (events) ───────────────────────────────────────────────────

/**
 * Published events (repasos) dated in [since, until) — `until` null = no
 * upper bound, so upcoming ones come too — with what the earnings policy
 * (src/lib/payments/event-earnings.js) needs: dates, tutors in order, what
 * each CONFIRMED student paid in confirmation order, every Wompi charge of
 * the event (the gateway keeps its fee on refunds too, the same rule as
 * eventPaymentTotals) and the tutor payouts already recorded. Drafts and
 * canceled events earn nothing and are left out. Explicit selects only.
 */
export async function eventEarningsRows({ since, until = null }) {
  const events = await prisma.event.findMany({
    where: {
      status: 'Published',
      startsAt: { gte: since, ...(until ? { lt: until } : {}) },
      ...COUNTED_EVENT_WHERE,
    },
    orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
    select: {
      id:               true,
      slug:             true,
      title:            true,
      startsAt:         true,
      endsAt:           true,
      price:            true,
      requiresApproval: true,
      course:  { select: { code: true, name: true } },
      tutors:  { orderBy: { position: 'asc' }, select: { tutor: { select: { id: true, name: true } } } },
      registrations: {
        where:   { status: 'Confirmed' },
        orderBy: [{ confirmedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
        select:  { finalAmount: true },
      },
      tutorPayouts: { select: { tutorId: true, amount: true } },
    },
  });
  if (events.length === 0) return [];

  const charges = await prisma.eventPayment.findMany({
    where:  { registration: { eventId: { in: events.map((e) => e.id) } } },
    select: { amount: true, registration: { select: { eventId: true } } },
  });
  const chargesByEvent = new Map();
  for (const c of charges) {
    const list = chargesByEvent.get(c.registration.eventId) ?? [];
    list.push(toNumber(c.amount));
    chargesByEvent.set(c.registration.eventId, list);
  }

  return events.map(({ tutors, registrations, tutorPayouts, price, ...e }) => ({
    ...e,
    price:            toNumber(price),
    tutors:           tutors.map((t) => t.tutor),
    confirmedAmounts: registrations.map((r) => toNumber(r.finalAmount)),
    wompiCharges:     chargesByEvent.get(e.id) ?? [],
    tutorPayouts:     tutorPayouts.map((p) => ({ tutorId: p.tutorId, amount: toNumber(p.amount) })),
  }));
}

// ─── History ────────────────────────────────────────────────────────────

/**
 * One page of sessions for the dashboard history, latest session date
 * first, with the course, tutor, students and payments behind each row.
 * `statuses` null = every status. Explicit selects only: names and the
 * payment breakdown, never credentials or contact data.
 */
export async function sessionHistory({ statuses = null, limit = 25, offset = 0 } = {}) {
  const where = statuses ? { ...COUNTED_SESSION_WHERE, status: { in: statuses } } : COUNTED_SESSION_WHERE;
  const [rows, total] = await Promise.all([
    prisma.session.findMany({
      where,
      orderBy: [{ startTimestamp: 'desc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
      select: {
        id:             true,
        status:         true,
        source:         true,
        startTimestamp: true,
        endTimestamp:   true,
        createdAt:      true,
        cancelledAt:    true,
        course:       { select: { code: true, name: true } },
        tutor:        { select: { id: true, name: true } },
        participants: { select: { student: { select: { id: true, name: true, kind: true } } } },
        payments: {
          select: {
            amount:          true,
            originalAmount:  true,
            discountAmount:  true,
            tutorPayoutBase: true,
            status:          true,
            createdAt:       true,
            wompiId:         true,
          },
        },
      },
    }),
    prisma.session.count({ where }),
  ]);
  return {
    total,
    rows: rows.map(({ participants, payments, ...s }) => ({
      ...s,
      students: participants.map((p) => p.student),
      payments: payments.map((p) => ({
        amount:          toNumber(p.amount),
        originalAmount:  toNumber(p.originalAmount),
        discountAmount:  toNumber(p.discountAmount),
        tutorPayoutBase: toNumber(p.tutorPayoutBase),
        status:          p.status,
        createdAt:       p.createdAt,
        viaWompi:        p.wompiId != null, // the id itself never leaves the repository
      })),
    })),
  };
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
      AND ${countedSession('s')}
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
      AND ${countedSession('s')}
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
