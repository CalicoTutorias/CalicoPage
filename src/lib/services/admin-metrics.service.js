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
import { aggregateFinancials, calicoNet, tutorPayout } from '../payments/fees';

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

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * One-shot snapshot for the top of the dashboard. Returns the four KPI
 * cards in a single call so the page renders fast.
 */
export async function getOverview() {
  return memo('overview', async () => {
    const [sessions, paidAmounts, activeTutors, pending] = await Promise.all([
      repo.sessionsThisWeek(),
      repo.paidPaymentsThisMonth(),
      repo.activeTutorsCount({ days: 30 }),
      repo.pendingApplicationsCount(),
    ]);
    const fin = aggregateFinancials(paidAmounts);
    return {
      sessionsThisWeek:        sessions,
      // Calico's actual earning this month (commission rate from
      // src/lib/payments/fees.js × gross − Wompi fee). The legacy field
      // `revenueThisMonth` is preserved as the headline KPI value so the
      // existing dashboard label still works; new fields expose the breakdown.
      revenueThisMonth:        fin.calicoNet,
      grossVolumeThisMonth:    fin.gross,
      tutorPayoutThisMonth:    fin.tutorPayout,
      wompiFeeThisMonth:       fin.wompiFeeTotal,
      activeTutorsLast30Days:  activeTutors,
      pendingApplications:     pending,
    };
  });
}

export async function getSessionsSeries({ weeks = 12 } = {}) {
  const w = Math.max(1, Math.min(weeks, 52));
  return memo(`sessions:${w}w`, () => repo.sessionsByWeek({ weeks: w }));
}

export async function getRevenueSeries({ months = 12 } = {}) {
  const m = Math.max(1, Math.min(months, 36));
  return memo(`revenue:${m}m`, async () => {
    const series = await repo.revenueByMonth({ months: m });
    // We only have gross + count from the SQL. Approximate Calico net per
    // month: assume amounts are evenly distributed within the month so we
    // can apply the per-transaction fee to (gross / count). This is a
    // small approximation (real per-tx amounts vary), accurate enough for
    // a chart. Exact aggregate is in `getOverview` for the current month.
    return series.map((row) => {
      const gross = row.gross;
      const count = row.paymentsCount || 1;
      const avgTx = count > 0 ? gross / count : 0;
      const netPerTx = calicoNet(avgTx);
      const owedPerTx = tutorPayout(avgTx);
      return {
        ...row,
        calicoNet:   Number((netPerTx * count).toFixed(2)),
        tutorPayout: Number((owedPerTx * count).toFixed(2)),
      };
    });
  });
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
