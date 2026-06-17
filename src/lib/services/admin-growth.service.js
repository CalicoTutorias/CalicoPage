/**
 * Admin Growth Service
 *
 * Thin layer over admin-growth.repository with an in-memory TTL cache,
 * mirroring admin-metrics.service. Same rationale: the Crecimiento page
 * isn't real-time, so 5-min staleness per Node process is fine. Cache keys
 * include the segmentation params so filtered/unfiltered views don't clash.
 *
 * The fee math (Calico net, break-even) lives in src/lib/payments/fees.js;
 * this service only orchestrates and shapes the response.
 */

import * as repo from '../repositories/admin-growth.repository';
import { aggregateFinancialsFromTotals, breakEvenPrice } from '../payments/fees';

// ─── In-memory cache (same pattern as admin-metrics.service) ───────────────

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
  return cacheSet(key, await loader());
}

/** Force-clear cached growth entries. */
export function invalidateGrowth() {
  cache.clear();
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
const round2 = (n) => Number(n.toFixed(2));

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Repeat-rate KPIs for students active in the last `days` days.
 * Rates are returned as 0..1 fractions; the UI formats as percentages.
 */
export async function getRetentionOverview({ days = 90, careerId = null } = {}) {
  const d = clamp(days, 1, 365);
  return memo(`retention:${d}:${careerId || 'all'}`, async () => {
    const r = await repo.repeatOverview({ days: d, careerId });
    return {
      students:           r.students,
      repeaters:          r.repeaters,
      repeatRate:         r.students > 0 ? r.repeaters / r.students : 0,
      sameTutorRepeaters: r.sameTutorRepeaters,
      sameTutorRate:      r.repeaters > 0 ? r.sameTutorRepeaters / r.repeaters : 0,
      medianDaysBetween:  r.medianGapDays != null ? round2(r.medianGapDays) : null,
      repeatTicket:       r.repeatTicket != null ? round2(r.repeatTicket) : null,
      newTicket:          r.newTicket != null ? round2(r.newTicket) : null,
    };
  });
}

/**
 * First-session cohorts with within-N-day return rates (0..1 fractions).
 */
export async function getRetentionCohorts({ months = 12, careerId = null } = {}) {
  const m = clamp(months, 1, 36);
  return memo(`cohorts:${m}:${careerId || 'all'}`, async () => {
    const rows = await repo.retentionCohorts({ months: m, careerId });
    return rows.map((c) => ({
      cohortMonth: c.cohortMonth,
      newStudents: c.newStudents,
      d30: c.d30,
      d60: c.d60,
      d90: c.d90,
      rate30: c.newStudents > 0 ? c.d30 / c.newStudents : 0,
      rate60: c.newStudents > 0 ? c.d60 / c.newStudents : 0,
      rate90: c.newStudents > 0 ? c.d90 / c.newStudents : 0,
    }));
  });
}

/**
 * Active-user engagement counts (approved tutors vs pure students) by LAST
 * SEEN within `days` days. Global (not career-filtered). Degrades to null
 * counts if the `last_seen_at` column hasn't been migrated yet, so the
 * growth page never breaks waiting on the migration.
 */
export async function getActiveUsers({ days = 7 } = {}) {
  const d = clamp(days, 1, 90);
  return memo(`active:${d}`, async () => {
    try {
      return await repo.activeUsersSince({ days: d });
    } catch (err) {
      console.warn('[admin-growth.getActiveUsers] falling back to null (run the last_seen_at migration?):', err?.message);
      return { activeTutors: null, activeStudents: null, windowDays: d };
    }
  });
}

/**
 * Per-course profitability with exact Calico net, margin, net-per-session
 * and an `unprofitable` flag for courses whose net is ≤ 0 at the volume
 * they ran. `breakEvenPrice` is the minimum gross price that stops the
 * Wompi fixed fee from eating the commission.
 */
export async function getCourseProfitability({ days = 90 } = {}) {
  const d = clamp(days, 1, 365);
  return memo(`profitability:${d}`, async () => {
    const rows = await repo.courseProfitability({ days: d });
    const minPrice = Math.ceil(breakEvenPrice());
    return rows.map((r) => {
      const fin = aggregateFinancialsFromTotals({ gross: r.gross, count: r.paymentsCount });
      return {
        id:            r.id,
        code:          r.code,
        name:          r.name,
        sessions:      r.sessions,
        paymentsCount: r.paymentsCount,
        gross:         fin.gross,
        calicoNet:     fin.calicoNet,
        tutorPayout:   fin.tutorPayout,
        wompiFee:      fin.wompiFeeTotal,
        margin:        fin.effectiveMargin,
        netPerSession: r.sessions > 0 ? round2(fin.calicoNet / r.sessions) : 0,
        listPrice:     r.basePrice != null ? Number(r.basePrice) : null,
        breakEvenPrice: minPrice,
        unprofitable:  fin.calicoNet <= 0,
      };
    });
  });
}
