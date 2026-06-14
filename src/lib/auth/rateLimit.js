/**
 * In-memory token-bucket rate limiter.
 *
 * SCOPE: per Node.js process. In a multi-instance / serverless deployment each
 * instance keeps its own counters — a determined attacker distributing requests
 * across cold-starts can exceed the per-process limit. The intended fix is to
 * swap the Map for a shared store (Redis / Upstash). Until then this limiter
 * stops the easy cases: runaway scripts, accidental floods, and single-origin
 * brute-force on a single instance.
 *
 * IP EXTRACTION: reads x-real-ip first (set by Vercel/nginx at the edge and
 * cannot be spoofed by clients), then falls back to the rightmost entry in
 * X-Forwarded-For that was added by our trusted proxy tier (controlled by
 * TRUSTED_PROXY_COUNT env var, default 1). This prevents a client from faking
 * the IP by prepending arbitrary values to XFF.
 */

import { NextResponse } from 'next/server';

const buckets = new Map();

// Number of trusted reverse-proxy hops in front of the app.
// Vercel adds exactly one hop, so the default of 1 is correct for production.
const TRUSTED_PROXY_COUNT = Math.max(1, parseInt(process.env.TRUSTED_PROXY_COUNT || '1', 10));

/**
 * Return the best-effort client IP, resistant to XFF spoofing.
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
  // x-real-ip is injected by the edge (Vercel/nginx) and cannot be spoofed.
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // X-Forwarded-For format: client, proxy1, proxy2 (each proxy appends its own IP).
  // Our trusted proxy tier occupies the last TRUSTED_PROXY_COUNT slots.
  // The actual client IP is at ips[length - TRUSTED_PROXY_COUNT - 1], but clamped to 0.
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const ips = xff.split(',').map((ip) => ip.trim()).filter(Boolean);
    const idx = Math.max(0, ips.length - TRUSTED_PROXY_COUNT - 1);
    if (ips[idx]) return ips[idx];
  }

  return 'unknown';
}

/**
 * Apply a token-bucket rate limit for a given key.
 *
 * Usage:
 * ```js
 * const limited = rateLimit(`login:${getClientIp(request)}`, { max: 10, windowMs: 15 * 60_000 });
 * if (limited) return limited;   // already a NextResponse with 429
 * ```
 *
 * @param {string} key  Composite key (e.g. `login:${ip}`).
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

// Purge expired buckets periodically so the Map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets.entries()) {
    if (now - v.start > 5 * 60_000) buckets.delete(k);
  }
}, 60_000).unref?.();
