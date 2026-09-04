/**
 * Pure coupon math — safe to import from both client and server (no DB).
 *
 * The server resolver (`src/lib/services/coupon.service.js`) decides WHICH
 * coupon applies and whether the student may use it; this module only turns
 * a coupon + list price into the four money figures every payment stores:
 *
 *     originalAmount  = list price (price/hour × hours), integer COP
 *     discountAmount  = what the coupon takes off, capped so the charge never
 *                       drops below MIN_CHARGE_COP (Wompi refuses less)
 *     finalAmount     = originalAmount − discountAmount → what Wompi charges
 *     tutorPayoutBase = the amount the tutor's 85 % is computed on:
 *                         CALICO absorbs the discount → originalAmount
 *                         SHARED with the tutor      → finalAmount
 *
 * Everything is integer COP. Never re-implement this rounding inline.
 */

import { MIN_CHARGE_COP } from './fees';

export { MIN_CHARGE_COP };

export const COUPON_DISCOUNT_TYPES = Object.freeze({ PERCENT: 'PERCENT', FIXED: 'FIXED' });
export const COUPON_ABSORBERS = Object.freeze({ CALICO: 'CALICO', SHARED: 'SHARED' });

/** Code shape: 3–24 chars, uppercase letters, digits, `-` and `_`. */
export const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,23}$/;
export const COUPON_CODE_MAX_LENGTH = 24;

export const PERCENT_MIN = 1;
export const PERCENT_MAX = 99;      // 100 % is deliberately impossible (no free bookings via Wompi)
export const FIXED_MIN_COP = 1_000;
export const FIXED_MAX_COP = 1_000_000;

/**
 * A RESERVED redemption (created with the payment intent) counts against the
 * coupon's limits only for this long. After that, an abandoned checkout
 * stops holding a slot — no cron needed.
 */
export const COUPON_HOLD_MINUTES = 30;

/** Trim, uppercase and strip inner whitespace. Does NOT validate. */
export function normalizeCouponCode(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidCouponCode(code) {
  return typeof code === 'string' && COUPON_CODE_PATTERN.test(code);
}

/**
 * Range check for the admin form and the API schema.
 * PERCENT: integer 1..99 · FIXED: integer COP 1 000..1 000 000.
 */
export function isValidDiscountValue(discountType, discountValue) {
  const v = Number(discountValue);
  if (!Number.isFinite(v) || !Number.isInteger(v)) return false;
  if (discountType === COUPON_DISCOUNT_TYPES.PERCENT) return v >= PERCENT_MIN && v <= PERCENT_MAX;
  if (discountType === COUPON_DISCOUNT_TYPES.FIXED) return v >= FIXED_MIN_COP && v <= FIXED_MAX_COP;
  return false;
}

function toInt(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
}

/** Uncapped discount for a list price. 0 when inputs make no sense. */
export function rawCouponDiscount({ discountType, discountValue, originalAmount }) {
  const original = toInt(originalAmount);
  const value = Number(discountValue);
  if (original <= 0 || !Number.isFinite(value) || value <= 0) return 0;
  if (discountType === COUPON_DISCOUNT_TYPES.PERCENT) return Math.round((original * value) / 100);
  if (discountType === COUPON_DISCOUNT_TYPES.FIXED) return Math.round(value);
  return 0;
}

/**
 * Discount capped so the final charge stays ≥ MIN_CHARGE_COP.
 *
 * @returns {{ originalAmount: number, discountAmount: number, finalAmount: number,
 *             capped: boolean, applicable: boolean }}
 *   `applicable` is false when the coupon would take nothing off (list price
 *   already at/below the minimum charge, or a zero discount).
 */
export function computeCouponDiscount({ discountType, discountValue, originalAmount }) {
  const original = toInt(originalAmount);
  const raw = rawCouponDiscount({ discountType, discountValue, originalAmount: original });
  const maxAllowed = original - MIN_CHARGE_COP;
  const discountAmount = Math.max(0, Math.min(raw, maxAllowed));
  return {
    originalAmount: original,
    discountAmount,
    finalAmount: original - discountAmount,
    capped: discountAmount < raw,
    applicable: discountAmount > 0,
  };
}

/** Base for the tutor's share, by who absorbs the discount. */
export function tutorPayoutBaseFor({ absorber, originalAmount, finalAmount }) {
  return absorber === COUPON_ABSORBERS.SHARED ? toInt(finalAmount) : toInt(originalAmount);
}

/**
 * Full pricing for a booking under a coupon.
 *
 * @param {{ coupon: { discountType, discountValue, absorber }, originalAmount: number }} args
 * @returns {{ originalAmount, discountAmount, finalAmount, tutorPayoutBase, absorber, capped, applicable }}
 */
export function applyCoupon({ coupon, originalAmount }) {
  const absorber = coupon?.absorber === COUPON_ABSORBERS.SHARED
    ? COUPON_ABSORBERS.SHARED
    : COUPON_ABSORBERS.CALICO;
  const d = computeCouponDiscount({
    discountType: coupon?.discountType,
    discountValue: coupon?.discountValue,
    originalAmount,
  });
  return {
    ...d,
    absorber,
    tutorPayoutBase: tutorPayoutBaseFor({
      absorber,
      originalAmount: d.originalAmount,
      finalAmount: d.finalAmount,
    }),
  };
}

/** Pricing for a booking WITHOUT a coupon — same shape, so callers never branch. */
export function noCouponPricing(originalAmount) {
  const original = toInt(originalAmount);
  return {
    originalAmount: original,
    discountAmount: 0,
    finalAmount: original,
    tutorPayoutBase: original,
    absorber: null,
    capped: false,
    applicable: false,
  };
}

// ─── Payment-intent snapshot ─────────────────────────────────────────────
// The intent metadata (persisted server-side in `payment_intents`) is the
// source of truth the webhook/confirm path reconciles against. Values are
// stored as strings because Wompi metadata is string-typed.

const SNAPSHOT_KEYS = ['couponId', 'couponCode', 'couponAbsorber', 'couponRedemptionId'];

export function buildCouponSnapshot({ coupon, pricing, redemptionId }) {
  return {
    couponId: String(coupon.id),
    couponCode: String(coupon.code),
    couponAbsorber: String(pricing.absorber),
    couponRedemptionId: String(redemptionId ?? ''),
    originalAmount: String(pricing.originalAmount),
    discountAmount: String(pricing.discountAmount),
    tutorPayoutBase: String(pricing.tutorPayoutBase),
  };
}

/**
 * Read the pricing snapshot back from intent metadata.
 * Returns null when the intent carried no coupon (legacy intents included),
 * so callers fall back to "no discount".
 */
export function readCouponSnapshot(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  if (!metadata.couponId) return null;
  const snap = {
    couponId: String(metadata.couponId),
    couponCode: String(metadata.couponCode ?? ''),
    absorber: metadata.couponAbsorber === COUPON_ABSORBERS.SHARED
      ? COUPON_ABSORBERS.SHARED
      : COUPON_ABSORBERS.CALICO,
    redemptionId: metadata.couponRedemptionId ? String(metadata.couponRedemptionId) : null,
    originalAmount: toInt(metadata.originalAmount),
    discountAmount: toInt(metadata.discountAmount),
    tutorPayoutBase: toInt(metadata.tutorPayoutBase),
  };
  if (snap.originalAmount <= 0 || snap.discountAmount < 0) return null;
  return snap;
}

export const COUPON_SNAPSHOT_KEYS = Object.freeze(SNAPSHOT_KEYS);
