/**
 * Unit tests for src/lib/payments/coupon-math.js — the pure discount math
 * every payment row is built from. Numbers mirror the worked example in the
 * coupons plan: a 60 000 COP session with a 10 % coupon.
 */

import {
  MIN_CHARGE_COP,
  COUPON_ABSORBERS,
  COUPON_DISCOUNT_TYPES,
  normalizeCouponCode,
  isValidCouponCode,
  isValidDiscountValue,
  rawCouponDiscount,
  computeCouponDiscount,
  tutorPayoutBaseFor,
  applyCoupon,
  noCouponPricing,
  buildCouponSnapshot,
  readCouponSnapshot,
} from '../coupon-math';

const { PERCENT, FIXED } = COUPON_DISCOUNT_TYPES;
const { CALICO, SHARED } = COUPON_ABSORBERS;

describe('code normalisation', () => {
  it('trims, uppercases and strips inner whitespace', () => {
    expect(normalizeCouponCode('  parciales 10 ')).toBe('PARCIALES10');
    expect(normalizeCouponCode(null)).toBe('');
    expect(normalizeCouponCode(undefined)).toBe('');
  });

  it('accepts 3–24 chars of letters, digits, dash and underscore', () => {
    expect(isValidCouponCode('PARCIALES10')).toBe(true);
    expect(isValidCouponCode('PARCIALES-10_B')).toBe(true);
    expect(isValidCouponCode('AB')).toBe(false);
    expect(isValidCouponCode('A'.repeat(25))).toBe(false);
    expect(isValidCouponCode('BAD CODE')).toBe(false);
    expect(isValidCouponCode('lowercase')).toBe(false); // normalise first
    expect(isValidCouponCode('-STARTS')).toBe(false);
    expect(isValidCouponCode(123)).toBe(false);
  });
});

describe('discount value ranges', () => {
  it('PERCENT must be an integer 1..99 (100 % is never allowed)', () => {
    expect(isValidDiscountValue(PERCENT, 1)).toBe(true);
    expect(isValidDiscountValue(PERCENT, 99)).toBe(true);
    expect(isValidDiscountValue(PERCENT, 0)).toBe(false);
    expect(isValidDiscountValue(PERCENT, 100)).toBe(false);
    expect(isValidDiscountValue(PERCENT, 12.5)).toBe(false);
  });

  it('FIXED must be an integer COP 1 000..1 000 000', () => {
    expect(isValidDiscountValue(FIXED, 1000)).toBe(true);
    expect(isValidDiscountValue(FIXED, 999)).toBe(false);
    expect(isValidDiscountValue(FIXED, 1_000_001)).toBe(false);
    expect(isValidDiscountValue('OTHER', 10)).toBe(false);
  });
});

describe('computeCouponDiscount', () => {
  it('10 % of 60 000 takes 6 000 off → 54 000', () => {
    const d = computeCouponDiscount({ discountType: PERCENT, discountValue: 10, originalAmount: 60000 });
    expect(d).toEqual({
      originalAmount: 60000,
      discountAmount: 6000,
      finalAmount: 54000,
      capped: false,
      applicable: true,
    });
  });

  it('rounds percentages to the nearest peso', () => {
    // 33 % of 10 001 = 3 300.33 → 3 300
    expect(rawCouponDiscount({ discountType: PERCENT, discountValue: 33, originalAmount: 10001 })).toBe(3300);
    // 15 % of 33 333 = 4 999.95 → 5 000
    expect(rawCouponDiscount({ discountType: PERCENT, discountValue: 15, originalAmount: 33333 })).toBe(5000);
  });

  it('a fixed discount takes exactly its value off', () => {
    const d = computeCouponDiscount({ discountType: FIXED, discountValue: 5000, originalAmount: 60000 });
    expect(d.discountAmount).toBe(5000);
    expect(d.finalAmount).toBe(55000);
    expect(d.capped).toBe(false);
  });

  it('caps the discount so the charge never drops below the Wompi minimum', () => {
    const d = computeCouponDiscount({ discountType: FIXED, discountValue: 100000, originalAmount: 60000 });
    expect(d.discountAmount).toBe(60000 - MIN_CHARGE_COP);
    expect(d.finalAmount).toBe(MIN_CHARGE_COP);
    expect(d.capped).toBe(true);
    expect(d.applicable).toBe(true);

    const p = computeCouponDiscount({ discountType: PERCENT, discountValue: 99, originalAmount: 2000 });
    expect(p.discountAmount).toBe(500); // 2 000 − 1 500, not 1 980
    expect(p.capped).toBe(true);
  });

  it('is not applicable when the price is already at/below the minimum charge', () => {
    const d = computeCouponDiscount({ discountType: FIXED, discountValue: 5000, originalAmount: MIN_CHARGE_COP });
    expect(d.discountAmount).toBe(0);
    expect(d.applicable).toBe(false);
    expect(computeCouponDiscount({ discountType: PERCENT, discountValue: 10, originalAmount: 0 }).applicable).toBe(false);
  });

  it('treats unknown types and bad values as no discount', () => {
    expect(rawCouponDiscount({ discountType: 'OTHER', discountValue: 10, originalAmount: 60000 })).toBe(0);
    expect(rawCouponDiscount({ discountType: PERCENT, discountValue: 'abc', originalAmount: 60000 })).toBe(0);
    expect(rawCouponDiscount({ discountType: PERCENT, discountValue: -5, originalAmount: 60000 })).toBe(0);
  });
});

describe('who absorbs the discount', () => {
  it('CALICO keeps the tutor whole: base = list price', () => {
    expect(tutorPayoutBaseFor({ absorber: CALICO, originalAmount: 60000, finalAmount: 54000 })).toBe(60000);
    // Unknown/missing absorber defaults to Calico absorbing.
    expect(tutorPayoutBaseFor({ absorber: undefined, originalAmount: 60000, finalAmount: 54000 })).toBe(60000);
  });

  it('SHARED: the tutor takes their 85 % on the discounted amount', () => {
    expect(tutorPayoutBaseFor({ absorber: SHARED, originalAmount: 60000, finalAmount: 54000 })).toBe(54000);
  });

  it('applyCoupon returns the four money figures the payment row stores', () => {
    const calico = applyCoupon({
      coupon: { discountType: PERCENT, discountValue: 10, absorber: CALICO },
      originalAmount: 60000,
    });
    expect(calico).toMatchObject({
      originalAmount: 60000, discountAmount: 6000, finalAmount: 54000, tutorPayoutBase: 60000, absorber: CALICO,
    });

    const shared = applyCoupon({
      coupon: { discountType: PERCENT, discountValue: 10, absorber: SHARED },
      originalAmount: 60000,
    });
    expect(shared).toMatchObject({
      originalAmount: 60000, discountAmount: 6000, finalAmount: 54000, tutorPayoutBase: 54000, absorber: SHARED,
    });
  });

  it('noCouponPricing has the same shape with no discount', () => {
    expect(noCouponPricing(50000)).toEqual({
      originalAmount: 50000,
      discountAmount: 0,
      finalAmount: 50000,
      tutorPayoutBase: 50000,
      absorber: null,
      capped: false,
      applicable: false,
    });
  });
});

describe('payment-intent snapshot', () => {
  const coupon = { id: 'coupon-1', code: 'PROMO10' };
  const pricing = { absorber: SHARED, originalAmount: 60000, discountAmount: 6000, tutorPayoutBase: 54000 };

  it('serialises to strings (Wompi metadata is string-typed) and reads back as numbers', () => {
    const snap = buildCouponSnapshot({ coupon, pricing, redemptionId: 'red-1' });
    expect(snap).toEqual({
      couponId: 'coupon-1',
      couponCode: 'PROMO10',
      couponAbsorber: 'SHARED',
      couponRedemptionId: 'red-1',
      originalAmount: '60000',
      discountAmount: '6000',
      tutorPayoutBase: '54000',
    });

    expect(readCouponSnapshot({ ...snap, studentId: '42' })).toEqual({
      couponId: 'coupon-1',
      couponCode: 'PROMO10',
      absorber: 'SHARED',
      redemptionId: 'red-1',
      originalAmount: 60000,
      discountAmount: 6000,
      tutorPayoutBase: 54000,
    });
  });

  it('returns null for intents without a coupon (legacy metadata included)', () => {
    expect(readCouponSnapshot(null)).toBeNull();
    expect(readCouponSnapshot({})).toBeNull();
    expect(readCouponSnapshot({ studentId: '42', originalAmount: '50000', discountAmount: '0' })).toBeNull();
    expect(readCouponSnapshot({ couponId: 'x', originalAmount: '0', discountAmount: '10' })).toBeNull();
  });

  it('defaults an unknown absorber to CALICO', () => {
    const snap = readCouponSnapshot({ couponId: 'c', originalAmount: '100000', discountAmount: '5000', tutorPayoutBase: '100000' });
    expect(snap.absorber).toBe('CALICO');
    expect(snap.redemptionId).toBeNull();
  });
});
