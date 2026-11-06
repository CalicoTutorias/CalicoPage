/**
 * Admin Metrics Service
 *
 * Thin layer over admin-metrics.repository with an in-memory TTL cache so
 * the dashboard can be re-opened without hammering the DB. The dashboard
 * isn't real-time — 5 min staleness is fine.
 *
 * Cache scope: per Node.js process. In a multi-instance deployment each
 * instance has its own cache; that's acceptable because the work being
 * saved is already cheap. If we ever need shared cache, swap to Redis.
 */

import * as repo from '../repositories/admin-metrics.repository';
import { getActiveUsers } from './admin-growth.service';
import { aggregateFinancials, aggregateFinancialsFromTotals } from '../payments/fees';
import {
  computeEventEarnings, sumEventEarnings, eventHours, EVENT_EARNINGS_POLICY,
} from '../payments/event-earnings';

// ─── In-memory cache ────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function memo(key, loader) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  return cacheSet(key, value);
}

/** Force-clear cached metric entries (called by mutations that affect them). */
export function invalidateAllMetrics() {
  cache.clear();
}

// ─── Repasos (events) ───────────────────────────────────────────────────
// Month buckets are UTC, like DATE_TRUNC on the (UTC) RDS in the session
// queries, so a repaso and a session payment of the same month share a bar.

const monthStartUtc = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonthsUtc  = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

/** `now` minus `months` months — the same window as `NOW() - N * INTERVAL '1 month'`. */
function monthsBefore(now, months) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** 'manual' (approval, settled outside the platform) | 'wompi' | 'free'. */
function eventPaymentMode(row) {
  if (row.requiresApproval) return 'manual';
  return row.price > 0 ? 'wompi' : 'free';
}

/**
 * One repaso with its earnings (event-earnings.js owns the math) plus what
 * each tutor is owed under the split and what was already recorded as paid.
 * A repaso is a projection until it ends (`upcoming`).
 */
function toEventEarningsItem(row, now) {
  const hours = eventHours(row.startsAt, row.endsAt);
  const { perTutor, ...earnings } = computeEventEarnings({
    hours,
    amounts:      row.confirmedAmounts,
    wompiCharges: row.wompiCharges,
    tutorIds:     row.tutors.map((t) => t.id),
  });
  const owed = new Map(perTutor.map((p) => [p.tutorId, p.amount]));
  const paid = new Map();
  for (const p of row.tutorPayouts) paid.set(p.tutorId, (paid.get(p.tutorId) ?? 0) + p.amount);
  return {
    id:          row.id,
    slug:        row.slug,
    title:       row.title,
    startsAt:    row.startsAt,
    endsAt:      row.endsAt,
    course:      row.course,
    hours:       Math.round(hours * 100) / 100,
    paymentMode: eventPaymentMode(row),
    upcoming:    new Date(row.endsAt) > now,
    ...earnings,
    tutors: row.tutors.map((t) => ({
      id:   t.id,
      name: t.name,
      owed: owed.get(t.id) ?? 0,
      paid: paid.get(t.id) ?? 0,
    })),
    tutorPaid: row.tutorPayouts.reduce((acc, p) => acc + p.amount, 0),
  };
}

/** Earnings items of the repasos that already ended — the only ones the net counts. */
function heldEventItems(rows, now) {
  return rows.map((r) => toEventEarningsItem(r, now)).filter((item) => !item.upcoming);
}

const EMPTY_SESSION_MONTH = {
  gross: 0, listGross: 0, discount: 0, tutorBase: 0, discountCalico: 0, discountShared: 0,
  paymentsCount: 0, calicoNet: 0, tutorPayout: 0, wompiFee: 0,
};
const EMPTY_EVENT_MONTH = {
  eventsCount: 0, eventCollected: 0, eventTutorPayout: 0, eventWompiFee: 0, eventNet: 0,
};

/** Stable month key for a DATE_TRUNC value (Date or ISO string). */
function monthKey(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * One-shot snapshot for the top of the dashboard. Returns the four KPI
 * cards in a single call so the page renders fast.
 */
export async function getOverview() {
  return memo('overview', async () => {
    const now = new Date();
    const [sessions, paidAmounts, active, pending, eventRows] = await Promise.all([
      repo.sessionsThisWeek(),
      repo.paidPaymentsThisMonth(),
      // Single source of truth for "active tutors": approved tutors seen in
      // the app within the last 7 days. The Crecimiento page reads the SAME
      // getActiveUsers() call (admin-growth.service), so the dashboard KPI and
      // the growth KPI always show one identical number under one definition —
      // no more "Tutores activos" meaning two different things in two places.
      getActiveUsers({ days: 7 }),
      repo.pendingApplicationsCount(),
      // Repasos dated this month (UTC); only the ones already over count below.
      repo.eventEarningsRows({ since: monthStartUtc(now), until: addMonthsUtc(now, 1) }),
    ]);
    const fin = aggregateFinancials(paidAmounts);
    const events = sumEventEarnings(heldEventItems(eventRows, now));
    return {
      sessionsThisWeek:        sessions,
      // Calico's actual earning this month: sessions (commission rate from
      // src/lib/payments/fees.js × gross − Wompi fee) plus repasos dated this
      // month that already ended (src/lib/payments/event-earnings.js): a
      // repaso is only earned once it has happened. The legacy field
      // `revenueThisMonth` stays the headline KPI value; the fields below
      // break it down. The session-only fields keep their old meaning.
      revenueThisMonth:        Number((fin.calicoNet + events.calicoNet).toFixed(2)),
      sessionsNetThisMonth:    fin.calicoNet,
      eventsNetThisMonth:      events.calicoNet,
      eventsThisMonth:         events.events,      // ended repasos that met the minimum
      eventsCollectedThisMonth:   events.collected,
      eventsTutorPayoutThisMonth: events.tutorPayout,
      eventsWompiFeeThisMonth:    events.wompiFees,
      grossVolumeThisMonth:    fin.gross,          // charged (after coupons)
      listGrossThisMonth:      fin.listGross,      // list price before coupons
      discountThisMonth:       fin.discountTotal,
      discountCalicoThisMonth: fin.discountCalico, // absorbed by Calico
      discountSharedThisMonth: fin.discountShared, // shared with tutors
      tutorPayoutThisMonth:    fin.tutorPayout,
      wompiFeeThisMonth:       fin.wompiFeeTotal,
      paidPaymentsThisMonth:   fin.paymentsCount,
      // May be null if the last_seen_at migration hasn't run — the UI renders
      // "—" in that case, exactly like the Crecimiento page does.
      activeTutors:            active.activeTutors,
      activeTutorsWindowDays:  active.windowDays,
      pendingApplications:     pending,
    };
  });
}

export async function getSessionsSeries({ weeks = 12 } = {}) {
  const w = Math.max(1, Math.min(weeks, 52));
  return memo(`sessions:${w}w`, () => repo.sessionsByWeek({ weeks: w }));
}

/**
 * Monthly Calico net: sessions (by payment date) and repasos (by repaso
 * date, only those that met the minimum) side by side, plus `totalNet`.
 * A month with only one of the two still gets a row (the other side at 0).
 * Like the KPI, a repaso only counts once it has ended — no projections.
 */
export async function getRevenueSeries({ months = 12 } = {}) {
  const m = Math.max(1, Math.min(months, 36));
  return memo(`revenue:${m}m`, async () => {
    const now = new Date();
    const [series, eventRows] = await Promise.all([
      repo.revenueByMonth({ months: m }),
      repo.eventEarningsRows({ since: monthsBefore(now, m), until: addMonthsUtc(now, 1) }),
    ]);

    const byMonth = new Map();
    // The Wompi fee is linear in (gross, count), so the Wompi charges' gross
    // and count give the EXACT Calico net per month — no per-transaction
    // amounts needed. Manual payments carry no fee.
    for (const row of series) {
      const fin = aggregateFinancialsFromTotals({
        gross: row.gross,
        count: row.paymentsCount,
        tutorBase: row.tutorBase,
        listGross: row.listGross,
        discountCalico: row.discountCalico,
        wompiGross: row.wompiGross,
        wompiCount: row.wompiCount,
      });
      byMonth.set(monthKey(row.monthStart), {
        ...row,
        listGross:      fin.listGross,
        discount:       fin.discountTotal,
        discountCalico: fin.discountCalico,
        discountShared: fin.discountShared,
        calicoNet:      fin.calicoNet,
        tutorPayout:    fin.tutorPayout,
        // Served from the server so the chart never derives it as a residual
        // (gross − payout − net no longer holds once the payout base differs).
        wompiFee:       fin.wompiFeeTotal,
        ...EMPTY_EVENT_MONTH,
      });
    }

    for (const item of heldEventItems(eventRows, now)) {
      if (!item.meetsMinimum) continue;
      const start = monthStartUtc(new Date(item.startsAt));
      const key = monthKey(start);
      const month = byMonth.get(key) ?? { monthStart: start, ...EMPTY_SESSION_MONTH, ...EMPTY_EVENT_MONTH };
      month.eventsCount      += 1;
      month.eventCollected   += item.collected;
      month.eventTutorPayout += item.tutorPayout;
      month.eventWompiFee    += item.wompiFees;
      month.eventNet         += item.calicoNet;
      byMonth.set(key, month);
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, month]) => ({
        ...month,
        totalNet: Number((month.calicoNet + month.eventNet).toFixed(2)),
      }));
  });
}

/**
 * Per-repaso earnings for the dashboard table: every published repaso from
 * `months` months ago on, upcoming ones included, newest first. Totals are
 * split into held (already ended) and upcoming (projection) and only count
 * repasos that met the minimum. `policy` is served so the UI explains the
 * numbers without hard-coding them.
 */
export async function getEventEarnings({ months = 12 } = {}) {
  const m = Math.max(1, Math.min(months, 36));
  return memo(`event-earnings:${m}m`, async () => {
    const now = new Date();
    const rows = await repo.eventEarningsRows({ since: monthsBefore(now, m) });
    const items = rows.map((r) => toEventEarningsItem(r, now));
    return {
      items,
      totals: {
        held:     sumEventEarnings(items.filter((e) => !e.upcoming)),
        upcoming: sumEventEarnings(items.filter((e) => e.upcoming)),
      },
      policy: EVENT_EARNINGS_POLICY,
    };
  });
}

// Dashboard history filter → session statuses. "scheduled" mirrors the
// sessions chart's "Programadas" line (Pending + Accepted).
const HISTORY_FILTERS = {
  all:       null,
  scheduled: ['Pending', 'Accepted'],
  completed: ['Completed'],
  canceled:  ['Canceled'],
};

/** 'paid' | 'pending' | 'failed' | 'none' — the most settled status among a session's payments. */
export function paymentStatusOf(payments) {
  if (payments.some((p) => p.status === 'paid'))    return 'paid';
  if (payments.some((p) => p.status === 'pending')) return 'pending';
  return payments.length > 0 ? 'failed' : 'none';
}

function toHistoryItem(s) {
  const paid = s.payments.filter((p) => p.status === 'paid');
  // Same fee math as the "Ganancia neta del mes" KPI, so the rows add up to it.
  const fin = aggregateFinancials(paid);
  const paidAt = paid.reduce((latest, p) => (!latest || p.createdAt > latest ? p.createdAt : latest), null);
  return {
    id:              s.id,
    status:          s.status,
    source:          s.source,
    startTimestamp:  s.startTimestamp,
    endTimestamp:    s.endTimestamp,
    bookedAt:        s.createdAt,
    cancelledAt:     s.cancelledAt,
    durationMinutes: Math.round((new Date(s.endTimestamp) - new Date(s.startTimestamp)) / 60000),
    course:          s.course,
    tutor:           s.tutor,
    students:        s.students.map((u) => ({
      id:       u.id,
      name:     u.name,
      external: u.kind === 'ExternalTemporary',
    })),
    payment: {
      status:    paymentStatusOf(s.payments),
      charged:   fin.gross,
      discount:  fin.discountTotal,
      calicoNet: fin.calicoNet,
      paidAt,
    },
  };
}

/**
 * One page of the dashboard session history. Not cached: it's a single
 * page of rows and the admin expects to see a session right after it's
 * booked. Unknown filters fall back to `all`.
 */
export async function getSessionHistory({ status = 'all', limit = 25, offset = 0 } = {}) {
  const statuses = Object.hasOwn(HISTORY_FILTERS, status) ? HISTORY_FILTERS[status] : null;
  const l = Math.max(1, Math.min(limit, 100));
  const o = Math.max(0, offset);
  const { rows, total } = await repo.sessionHistory({ statuses, limit: l, offset: o });
  return { items: rows.map(toHistoryItem), total, limit: l, offset: o };
}

export async function getTopCourses({ days = 30, limit = 10 } = {}) {
  const d = Math.max(1, Math.min(days, 365));
  const l = Math.max(1, Math.min(limit, 50));
  return memo(`top-courses:${d}d:${l}`, () => repo.topCourses({ days: d, limit: l }));
}

export async function getTopTutors({ days = 30, limit = 10 } = {}) {
  const d = Math.max(1, Math.min(days, 365));
  const l = Math.max(1, Math.min(limit, 50));
  return memo(`top-tutors:${d}d:${l}`, () => repo.topTutors({ days: d, limit: l }));
}
