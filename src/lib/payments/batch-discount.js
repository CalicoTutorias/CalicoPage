/**
 * Pure block-discount math ("tutorías en bloque") — safe to import from both
 * client and server (no DB).
 *
 * A student who books N consecutive hours with a tutor pays each hour at a
 * lower price: hour i of the block gets `tiers[i]` % off (the last tier
 * applies to every hour after it). Calico sets the tiers in
 * /home/admin/descuentos (BatchDiscountConfig); tutors only cap how many
 * hours can be booked in a row.
 *
 *     listAmount          = pricePerHour × hours
 *     batchDiscountAmount = listAmount − Σ round(pricePerHour × (1 − tier(i)))
 *     amount              = listAmount − batchDiscountAmount
 *
 * A coupon is applied AFTER, on `amount` (or instead, when the config says
 * they do not stack — then the student gets whichever saves more).
 * Single source of truth: never re-implement this inline.
 *
 * Spec: docs/specs/features/batch-tutorias.md
 */

import { MIN_CHARGE_COP } from './fees';

export const BATCH_ABSORBERS = Object.freeze({ CALICO: 'CALICO', SHARED: 'SHARED' });

/** Upper bound of the tutor's "máximo de horas seguidas" setting. */
export const MAX_CONSECUTIVE_HOURS_LIMIT = 4;
export const MIN_CONSECUTIVE_HOURS = 1;
export const DEFAULT_MAX_CONSECUTIVE_HOURS = 2;

/** Options the tutor picks from for the minimum booking notice (hours). */
export const BOOKING_NOTICE_OPTIONS = Object.freeze([2, 6, 12, 24, 48]);

export const TIER_MAX_PERCENT = 50;
export const MAX_TIERS = 8;

export const DEFAULT_BATCH_CONFIG = Object.freeze({
  isActive: false,
  tiers: Object.freeze([0, 5, 10, 15]),
  absorber: BATCH_ABSORBERS.SHARED,
  stacksWithCoupons: true,
  appliesToManual: false,
});

const MS_PER_HOUR = 3_600_000;

function toInt(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
}

/** Coerce stored JSON into an array of numbers (does NOT validate). */
export function normalizeTiers(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_BATCH_CONFIG.tiers];
  return raw.map((v) => Number(v));
}

/**
 * Admin-side validation of a tier list.
 * @returns {string|null} error code, or null when valid
 */
export function validateTiers(tiers) {
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > MAX_TIERS) return 'TIERS_LENGTH';
  if (Number(tiers[0]) !== 0) return 'FIRST_TIER_NOT_ZERO';
  let prev = 0;
  for (const t of tiers) {
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n > TIER_MAX_PERCENT) return 'TIER_OUT_OF_RANGE';
    if (n < prev) return 'TIERS_DECREASING';
    prev = n;
  }
  return null;
}

/** Normalise a config row (or null) into the shape every helper expects. */
export function normalizeBatchConfig(row) {
  if (!row) return { ...DEFAULT_BATCH_CONFIG, tiers: [...DEFAULT_BATCH_CONFIG.tiers] };
  const tiers = normalizeTiers(row.tiers);
  return {
    isActive: Boolean(row.isActive),
    tiers: validateTiers(tiers) ? [...DEFAULT_BATCH_CONFIG.tiers] : tiers,
    absorber: row.absorber === BATCH_ABSORBERS.CALICO ? BATCH_ABSORBERS.CALICO : BATCH_ABSORBERS.SHARED,
    stacksWithCoupons: row.stacksWithCoupons !== false,
    appliesToManual: Boolean(row.appliesToManual),
  };
}

/** Discount % for the hour at `index` (0-based) of a block. */
export function tierPercentForHour(tiers, index) {
  const list = Array.isArray(tiers) && tiers.length ? tiers : DEFAULT_BATCH_CONFIG.tiers;
  return Number(list[Math.min(index, list.length - 1)]) || 0;
}

/** Whole hours of a block, or null when the interval is not whole hours. */
export function wholeHours(startTimestamp, endTimestamp) {
  const start = startTimestamp instanceof Date ? startTimestamp : new Date(startTimestamp);
  const end = endTimestamp instanceof Date ? endTimestamp : new Date(endTimestamp);
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0 || ms % MS_PER_HOUR !== 0) return null;
  return ms / MS_PER_HOUR;
}

/**
 * Price of each hour of a block and the block total.
 *
 * @param {{ pricePerHour: number, hours: number, config: object }} args
 * @returns {{ listAmount: number, batchDiscountAmount: number, amount: number,
 *             hourly: { index: number, percent: number, price: number }[],
 *             applicable: boolean }}
 *   `applicable` is false when no discount applies (inactive config, a
 *   single hour, a fractional duration).
 */
export function computeBatchPricing({ pricePerHour, hours, config }) {
  const perHour = toInt(pricePerHour);
  const cfg = config ?? DEFAULT_BATCH_CONFIG;
  const listAmount = Math.round(perHour * Number(hours));
  const whole = Number.isInteger(Number(hours)) && Number(hours) >= 1;
  const discounted = Boolean(cfg.isActive) && whole && perHour > 0;

  const hourly = [];
  if (whole) {
    for (let i = 0; i < Number(hours); i += 1) {
      const percent = discounted ? tierPercentForHour(cfg.tiers, i) : 0;
      hourly.push({ index: i, percent, price: Math.round(perHour * (1 - percent / 100)) });
    }
  }

  let amount = discounted ? hourly.reduce((sum, h) => sum + h.price, 0) : listAmount;
  // Never below Wompi's minimum (only reachable with absurd prices/tiers).
  if (amount < MIN_CHARGE_COP && listAmount >= MIN_CHARGE_COP) amount = MIN_CHARGE_COP;
  const batchDiscountAmount = Math.max(0, listAmount - amount);

  return { listAmount, batchDiscountAmount, amount: listAmount - batchDiscountAmount, hourly, applicable: batchDiscountAmount > 0 };
}

/**
 * Merge the block discount and an optional coupon into the four money fields
 * every payment stores (+ the block breakdown).
 *
 * `couponPricing` is the coupon-math pricing computed on the price AFTER the
 * block discount (or on the list price when the block discount was dropped
 * because they do not stack). Pass null for no coupon.
 */
export function combineBatchAndCoupon({ batch, absorber, couponPricing }) {
  const batchOff = toInt(batch.batchDiscountAmount);
  const batchAbsorber = batchOff > 0 ? (absorber === BATCH_ABSORBERS.CALICO ? BATCH_ABSORBERS.CALICO : BATCH_ABSORBERS.SHARED) : null;
  // Calico keeps the tutor whole on a block discount it absorbs.
  const batchBack = batchAbsorber === BATCH_ABSORBERS.CALICO ? batchOff : 0;

  if (!couponPricing) {
    const listAmount = toInt(batch.listAmount);
    return {
      originalAmount: listAmount,
      batchDiscountAmount: batchOff,
      batchAbsorber,
      couponDiscountAmount: 0,
      discountAmount: batchOff,
      finalAmount: listAmount - batchOff,
      tutorPayoutBase: listAmount - batchOff + batchBack,
      couponAbsorber: null,
      capped: false,
    };
  }

  // The coupon (coupon-math) priced the amount AFTER the block discount, so
  // its own figures are relative to that base; the block discount goes on top.
  const couponOff = toInt(couponPricing.discountAmount);
  return {
    originalAmount: toInt(couponPricing.originalAmount) + batchOff,
    batchDiscountAmount: batchOff,
    batchAbsorber,
    couponDiscountAmount: couponOff,
    discountAmount: batchOff + couponOff,
    finalAmount: toInt(couponPricing.finalAmount),
    tutorPayoutBase: toInt(couponPricing.tutorPayoutBase) + batchBack,
    couponAbsorber: couponPricing.absorber ?? null,
    capped: Boolean(couponPricing.capped),
  };
}

/** A batch result with the block discount removed (coupon used instead). */
export function withoutBatchDiscount(batch) {
  return { ...batch, batchDiscountAmount: 0, amount: batch.listAmount, applicable: false,
    hourly: batch.hourly.map((h) => ({ ...h, percent: 0, price: batch.hourly.length ? Math.round(batch.listAmount / batch.hourly.length) : 0 })) };
}
