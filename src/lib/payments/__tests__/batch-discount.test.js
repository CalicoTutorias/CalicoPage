import {
  computeBatchPricing,
  combineBatchAndCoupon,
  validateTiers,
  normalizeBatchConfig,
  tierPercentForHour,
  withoutBatchDiscount,
  DEFAULT_BATCH_CONFIG,
} from '../batch-discount';
import { applyCoupon, couponOnlyFigures, readCouponSnapshot, readPricingSnapshot, buildCouponSnapshot } from '../coupon-math';

const ACTIVE = { ...DEFAULT_BATCH_CONFIG, isActive: true, tiers: [0, 5, 10, 15] };

describe('computeBatchPricing', () => {
  it('prices each hour with its own tier (Cálculo a $45.000/h)', () => {
    const b = computeBatchPricing({ pricePerHour: 45000, hours: 4, config: ACTIVE });
    expect(b.hourly.map((h) => h.price)).toEqual([45000, 42750, 40500, 38250]);
    expect(b).toMatchObject({ listAmount: 180000, amount: 166500, batchDiscountAmount: 13500, applicable: true });
  });

  it('applies the last tier to every hour after it', () => {
    expect(tierPercentForHour([0, 5], 3)).toBe(5);
    const b = computeBatchPricing({ pricePerHour: 40000, hours: 3, config: { ...ACTIVE, tiers: [0, 5] } });
    expect(b.hourly.map((h) => h.percent)).toEqual([0, 5, 5]);
  });

  it('gives no discount for one hour, an inactive config or a fractional duration', () => {
    expect(computeBatchPricing({ pricePerHour: 45000, hours: 1, config: ACTIVE }).batchDiscountAmount).toBe(0);
    expect(computeBatchPricing({ pricePerHour: 45000, hours: 3, config: DEFAULT_BATCH_CONFIG }).amount).toBe(135000);
    const frac = computeBatchPricing({ pricePerHour: 40000, hours: 1.5, config: ACTIVE });
    expect(frac).toMatchObject({ listAmount: 60000, amount: 60000, batchDiscountAmount: 0 });
  });
});

describe('combineBatchAndCoupon', () => {
  const batch = computeBatchPricing({ pricePerHour: 45000, hours: 3, config: ACTIVE }); // 135 000 → 128 250

  it('SHARED block discount, no coupon: the tutor base drops with the price', () => {
    expect(combineBatchAndCoupon({ batch, absorber: 'SHARED', couponPricing: null })).toMatchObject({
      originalAmount: 135000, discountAmount: 6750, finalAmount: 128250, tutorPayoutBase: 128250, batchAbsorber: 'SHARED',
    });
  });

  it('CALICO block discount, no coupon: the tutor keeps the list price as base', () => {
    expect(combineBatchAndCoupon({ batch, absorber: 'CALICO', couponPricing: null }).tutorPayoutBase).toBe(135000);
  });

  it('a coupon applies on the price after the block discount', () => {
    const couponPricing = applyCoupon({ coupon: { discountType: 'PERCENT', discountValue: 10, absorber: 'CALICO' }, originalAmount: batch.amount });
    const p = combineBatchAndCoupon({ batch, absorber: 'SHARED', couponPricing });
    expect(p).toMatchObject({
      originalAmount: 135000,
      batchDiscountAmount: 6750,
      couponDiscountAmount: 12825,
      discountAmount: 19575,
      finalAmount: 115425,
      tutorPayoutBase: 128250, // block SHARED, coupon CALICO
    });
  });

  it('SHARED coupon + CALICO block: the tutor only loses the coupon', () => {
    const couponPricing = applyCoupon({ coupon: { discountType: 'FIXED', discountValue: 10000, absorber: 'SHARED' }, originalAmount: batch.amount });
    expect(combineBatchAndCoupon({ batch, absorber: 'CALICO', couponPricing }).tutorPayoutBase).toBe(125000);
  });

  it('a 100 % coupon leaves the whole list price as discount (free booking)', () => {
    const couponPricing = applyCoupon({ coupon: { discountType: 'PERCENT', discountValue: 100, absorber: 'CALICO' }, originalAmount: batch.amount });
    const p = combineBatchAndCoupon({ batch, absorber: 'SHARED', couponPricing });
    expect(p.finalAmount).toBe(0);
    expect(p.discountAmount).toBe(p.originalAmount);
  });

  it('withoutBatchDiscount restores the list price', () => {
    expect(withoutBatchDiscount(batch)).toMatchObject({ amount: 135000, batchDiscountAmount: 0 });
  });
});

describe('validateTiers / normalizeBatchConfig', () => {
  it.each([
    [[0, 5, 10, 15], null],
    [[5, 10], 'FIRST_TIER_NOT_ZERO'],
    [[0, 10, 5], 'TIERS_DECREASING'],
    [[0, 51], 'TIER_OUT_OF_RANGE'],
    [[0, 2.5], 'TIER_OUT_OF_RANGE'],
    [[], 'TIERS_LENGTH'],
  ])('%j → %s', (tiers, expected) => {
    expect(validateTiers(tiers)).toBe(expected);
  });

  it('falls back to safe defaults for a missing or corrupt row', () => {
    expect(normalizeBatchConfig(null)).toMatchObject({ isActive: false, tiers: [0, 5, 10, 15], absorber: 'SHARED' });
    expect(normalizeBatchConfig({ isActive: true, tiers: [9, 1], absorber: 'X' })).toMatchObject({ tiers: [0, 5, 10, 15], absorber: 'SHARED' });
  });
});

describe('intent snapshot with a block discount', () => {
  it('round-trips the block keys and keeps coupon stats coupon-only', () => {
    const snap = buildCouponSnapshot({
      coupon: { id: 'c1', code: 'PROMO' },
      pricing: { absorber: 'SHARED', originalAmount: 135000, discountAmount: 19575, tutorPayoutBase: 115425, batchDiscountAmount: 6750, batchAbsorber: 'SHARED' },
      redemptionId: 'r1',
    });
    const read = readCouponSnapshot(snap);
    expect(read).toMatchObject({ batchDiscountAmount: 6750, batchAbsorber: 'SHARED' });
    expect(couponOnlyFigures(read, 115425)).toEqual({
      originalAmount: 128250, discountAmount: 12825, finalAmount: 115425, tutorPayoutBase: 115425, absorber: 'SHARED',
    });
  });

  it('readPricingSnapshot reads a coupon-less block booking and ignores legacy intents', () => {
    expect(readPricingSnapshot({ originalAmount: '135000', discountAmount: '6750', tutorPayoutBase: '128250', batchDiscountAmount: '6750', batchAbsorber: 'SHARED' }))
      .toEqual({ originalAmount: 135000, discountAmount: 6750, tutorPayoutBase: 128250, batchDiscountAmount: 6750, batchAbsorber: 'SHARED' });
    expect(readPricingSnapshot({ studentId: '1' })).toBeNull();
  });
});
