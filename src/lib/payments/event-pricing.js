/**
 * Pure pricing for events (client-safe). Prices are integer COP; 0 = free.
 * The early-bird discount ("first X registrants get Y % off") is the only
 * discount an event can have. The CHARGE must never drop below Wompi's
 * minimum, so that is validated when the event is saved, never at checkout.
 */

import { MIN_CHARGE_COP } from './fees';

export const EVENT_HOLD_MINUTES = 30;
export const EVENT_CANCEL_REFUND_HOURS = 6;

export const EVENT_PRICING_ERROR = Object.freeze({
  PRICE_INVALID: 'PRICE_INVALID',
  PRICE_BELOW_MINIMUM: 'PRICE_BELOW_MINIMUM',
  EARLY_BIRD_INCOMPLETE: 'EARLY_BIRD_INCOMPLETE',
  EARLY_BIRD_ON_FREE: 'EARLY_BIRD_ON_FREE',
  EARLY_BIRD_SLOTS_INVALID: 'EARLY_BIRD_SLOTS_INVALID',
  EARLY_BIRD_PERCENT_INVALID: 'EARLY_BIRD_PERCENT_INVALID',
  EARLY_BIRD_BELOW_MINIMUM: 'EARLY_BIRD_BELOW_MINIMUM',
});

const isSet = (v) => v !== null && v !== undefined && v !== '';

/**
 * User-cancellation refund window: refundable iff startsAt − now ≥
 * EVENT_CANCEL_REFUND_HOURS. Whether anything was paid is the caller's check.
 */
export function isRefundableAt(startsAt, now = new Date()) {
  return new Date(startsAt).getTime() - now.getTime() >= EVENT_CANCEL_REFUND_HOURS * 3_600_000;
}

export function earlyBirdDiscount(price, percent) {
  return Math.round((Number(price) * Number(percent)) / 100);
}

/** @returns {string|null} an EVENT_PRICING_ERROR code, or null when valid */
export function validateEventPricing({ price, earlyBirdSlots = null, earlyBirdPercent = null }) {
  const p = Number(price);
  if (!Number.isInteger(p) || p < 0) return EVENT_PRICING_ERROR.PRICE_INVALID;
  if (p > 0 && p < MIN_CHARGE_COP) return EVENT_PRICING_ERROR.PRICE_BELOW_MINIMUM;

  const hasSlots = isSet(earlyBirdSlots);
  const hasPercent = isSet(earlyBirdPercent);
  if (!hasSlots && !hasPercent) return null;
  if (hasSlots !== hasPercent) return EVENT_PRICING_ERROR.EARLY_BIRD_INCOMPLETE;
  if (p === 0) return EVENT_PRICING_ERROR.EARLY_BIRD_ON_FREE;

  const slots = Number(earlyBirdSlots);
  const percent = Number(earlyBirdPercent);
  if (!Number.isInteger(slots) || slots < 1 || slots > 1000) return EVENT_PRICING_ERROR.EARLY_BIRD_SLOTS_INVALID;
  if (!Number.isInteger(percent) || percent < 1 || percent > 99) return EVENT_PRICING_ERROR.EARLY_BIRD_PERCENT_INVALID;
  if (p - earlyBirdDiscount(p, percent) < MIN_CHARGE_COP) return EVENT_PRICING_ERROR.EARLY_BIRD_BELOW_MINIMUM;
  return null;
}

export function quoteEvent({ price, earlyBirdPercent }, { earlyBird }) {
  const listPrice = Math.round(Number(String(price)));
  const discountAmount = earlyBird && earlyBirdPercent ? earlyBirdDiscount(listPrice, earlyBirdPercent) : 0;
  return {
    listPrice,
    discountAmount,
    finalAmount: listPrice - discountAmount,
    earlyBird: discountAmount > 0,
  };
}
