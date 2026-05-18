/**
 * Get the best-effort client IP from a Next.js request.
 * Uses x-forwarded-for (set by Vercel / reverse proxies) then x-real-ip.
 * Falls back to 'unknown' — which still rate-limits since all unknowns share the bucket.
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * In-memory token-bucket rate limiter.
 *
 * Scope: per Node.js process. In a multi-instance deployment each instance
 * keeps its own counters; that's acceptable here because the goal is to
 * stop runaway scripts and accidental floods, not surgical per-IP quotas.
 * If we ever need precise distributed limits, swap the Map for Redis.
 *
 * Usage in a route handler:
 * ```js
 * const limited = rateLimit(`admin:${auth.sub}`, { max: 30, windowMs: 60_000 });
 * if (limited) return limited;   // already a NextResponse with 429
 * ```
 */

import { NextResponse } from 'next/server';

const buckets = new Map();

/**
 * @param {string} key  Composite key (e.g. `admin:${userId}`).
 * @param {{ max?: number, windowMs?: number }} [opts]
 *   - max:       max requests per window. Default 30.
 *   - windowMs:  window size in ms. Default 60_000 (1 min).
 * @returns {NextResponse | null}  429 response if exceeded, otherwise null.
 */
export function rateLimit(key, { max = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now - entry.start > windowMs) {
    buckets.set(key, { count: 1, start: now });
    return null;
  }

  if (entry.count >= max) {
    const retryAfterSec = Math.ceil((entry.start + windowMs - now) / 1000);
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMITED',
        message: `Demasiadas peticiones. Intenta de nuevo en ${retryAfterSec}s.`,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  entry.count += 1;
  return null;
}

/**
 * Cleanup expired buckets occasionally so the Map doesn't grow unbounded.
 * Called best-effort from the rate limiter itself; no scheduler needed.
 */
let lastCleanup = Date.now();
setInterval(() => {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, v] of buckets.entries()) {
    if (now - v.start > 5 * 60_000) buckets.delete(k);
  }
}, 60_000).unref?.();
