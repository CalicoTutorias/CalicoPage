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
    const [sessions, revenue, activeTutors, pending] = await Promise.all([
      repo.sessionsThisWeek(),
      repo.revenueThisMonth(),
      repo.activeTutorsCount({ days: 30 }),
      repo.pendingApplicationsCount(),
    ]);
    return {
      sessionsThisWeek:        sessions,
      revenueThisMonth:        revenue,
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
  return memo(`revenue:${m}m`, () => repo.revenueByMonth({ months: m }));
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
