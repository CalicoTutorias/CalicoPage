/**
 * Pure session-price math — safe to import from both client and server
 * (no DB/prisma imports). The server resolver lives in `pricing.js`, which
 * re-exports everything here so existing `@/lib/payments/pricing` imports keep
 * working; client components import directly from this file.
 *
 * Calico prices are **per hour** and centralized per course via Course.basePrice.
 * The charge for a booking is:
 *
 *     amount = pricePerHour(course) × durationHours(start, end)
 *
 * This is the single source of truth for that calculation — never re-implement
 * `price × hours` inline.
 */

const MS_PER_HOUR = 3_600_000;

/** Coded error so the API layer can map pricing failures to 400/404. */
export class PricingError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PricingError';
    this.code = code;
  }
}

/**
 * Authoritative price-per-hour for a course (COP).
 * Inputs may be Prisma Decimals, so they are coerced to numbers.
 *
 * @throws {PricingError} NO_PRICE when basePrice is not a positive number.
 */
export function pricePerHour(course) {
  const raw = course?.basePrice;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new PricingError('Course has no valid price', 'NO_PRICE');
  }
  return n;
}

/**
 * Session length in hours (may be fractional, e.g. a 90-min slot = 1.5).
 *
 * @throws {PricingError} BAD_INTERVAL when the interval is not strictly positive.
 */
export function sessionDurationHours(startTimestamp, endTimestamp) {
  const start = startTimestamp instanceof Date ? startTimestamp : new Date(startTimestamp);
  const end = endTimestamp instanceof Date ? endTimestamp : new Date(endTimestamp);
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new PricingError('Invalid session interval', 'BAD_INTERVAL');
  }
  return ms / MS_PER_HOUR;
}

/**
 * Pure amount calculation: price-per-hour × hours, rounded to the nearest COP.
 * A 2-hour booking of a $40 000/h course costs $80 000.
 */
export function computeSessionAmount({ course, startTimestamp, endTimestamp }) {
  const perHour = pricePerHour(course);
  const hours = sessionDurationHours(startTimestamp, endTimestamp);
  return Math.round(perHour * hours);
}
