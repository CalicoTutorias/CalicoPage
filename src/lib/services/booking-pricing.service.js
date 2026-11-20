/**
 * Server-authoritative pricing of a tutoring booking: course price × hours,
 * block discount for consecutive hours (BatchDiscountConfig) and an optional
 * coupon. The one place create-intent, validate-coupon and the checkout
 * quote get their numbers from — never trust a client amount.
 *
 * Order: list price → block discount → coupon on the discounted price.
 * When the config says they do not stack, the student gets whichever saves
 * more; a coupon that saves less is refused with COUPON_NOT_STACKABLE so the
 * checkout can explain why.
 */

import { resolveSessionAmount } from '../payments/pricing';
import { computeBatchPricing, combineBatchAndCoupon, withoutBatchDiscount } from '../payments/batch-discount';
import * as batchDiscountService from './batch-discount.service';
import * as couponService from './coupon.service';

/**
 * List price + block discount for a booking (no coupon).
 * @returns {Promise<{ pricePerHour, hours, batch, config }>}
 * @throws {PricingError}
 */
export async function quoteBlock({ courseId, startTimestamp, endTimestamp, manual = false }) {
  // Same resolver as before the block discount existed (course price/hour,
  // session length); throws PricingError for a missing course or price.
  const { pricePerHour: perHour, hours } = await resolveSessionAmount({ courseId, startTimestamp, endTimestamp });
  const stored = await batchDiscountService.getConfig();
  // Manual sessions (admin) only get the block discount when the config says so.
  const config = manual && !stored.appliesToManual ? { ...stored, isActive: false } : stored;
  const batch = computeBatchPricing({ pricePerHour: perHour, hours, config });
  return { pricePerHour: perHour, hours, batch, config };
}

/**
 * Full pricing, optionally with a coupon.
 *
 * @param {object} args
 * @param {string} [args.couponCode]
 * @param {string} args.userId          - always auth.sub
 * @param {string} [args.intentReference] - when set, the coupon use is RESERVED
 *   (create-intent); otherwise it is only previewed (validate-coupon).
 * @param {boolean} [args.manual] - admin manual session: block discount only
 *   when the config's `appliesToManual` is on.
 * @returns {Promise<{ pricing, batch, hours, pricePerHour, coupon, redemptionId }>}
 *   `pricing` = combineBatchAndCoupon(...) — originalAmount, discountAmount,
 *   finalAmount, tutorPayoutBase, batchDiscountAmount, batchAbsorber,
 *   couponDiscountAmount, couponAbsorber.
 * @throws {PricingError|CouponError}
 */
export async function priceBooking({ courseId, startTimestamp, endTimestamp, couponCode, userId, intentReference = null, manual = false }) {
  const quote = await quoteBlock({ courseId, startTimestamp, endTimestamp, manual });
  let { batch } = quote;
  const { config } = quote;

  if (!couponCode) {
    return { ...quote, pricing: combineBatchAndCoupon({ batch, absorber: config.absorber, couponPricing: null }), coupon: null, redemptionId: null };
  }

  // Which base does the coupon apply to?
  let couponBase = batch.amount;
  if (batch.batchDiscountAmount > 0 && !config.stacksWithCoupons) {
    const preview = await couponService.previewForBooking({ code: couponCode, userId, originalAmount: batch.listAmount });
    if (preview.pricing.discountAmount <= batch.batchDiscountAmount) {
      throw new couponService.CouponError(couponService.COUPON_ERROR.NOT_STACKABLE);
    }
    batch = withoutBatchDiscount(batch);
    couponBase = batch.listAmount;
  }

  const result = intentReference
    ? await couponService.reserveForIntent({ code: couponCode, userId, originalAmount: couponBase, intentReference })
    : await couponService.previewForBooking({ code: couponCode, userId, originalAmount: couponBase });

  return {
    ...quote,
    batch,
    pricing: combineBatchAndCoupon({ batch, absorber: config.absorber, couponPricing: result.pricing }),
    coupon: result.coupon,
    redemptionId: result.redemptionId ?? null,
  };
}
