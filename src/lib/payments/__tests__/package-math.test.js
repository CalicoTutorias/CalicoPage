import {
  isValidPackageHours,
  packagePricing,
  packageSettlement,
  tierForHours,
  tierForMinutes,
} from '../package-math';
import { aggregateFinancials, paymentBreakdown, tutorPayout } from '../fees';

describe('tierForHours', () => {
  it.each([
    [1, 0, 0],
    [2, 0, 0],
    [3, 10, 100],
    [5, 10, 100],
    [6, 15, 50],
    [8, 15, 50],
    [10, 15, 50],
    [11, 20, 50],
    [40, 20, 50],
  ])('%i h → %i %% (tutor %i %% of it)', (hours, discountPercent, tutorSharePercent) => {
    expect(tierForHours(hours)).toMatchObject({ discountPercent, tutorSharePercent });
  });

  it('counts fractional hours from minutes (5 h 30 min stays in the 10 % tier)', () => {
    expect(tierForMinutes(330).discountPercent).toBe(10);
    expect(tierForMinutes(360).discountPercent).toBe(15);
  });
});

describe('isValidPackageHours', () => {
  it('accepts whole hours from 3', () => {
    expect(isValidPackageHours(3)).toBe(true);
    expect(isValidPackageHours(8)).toBe(true);
    expect(isValidPackageHours(2)).toBe(false);
    expect(isValidPackageHours(4.5)).toBe(false);
    expect(isValidPackageHours('x')).toBe(false);
  });
});

describe('packagePricing', () => {
  const LIST = 110_000; // 2 h at 55 000

  it('3–5 h: 10 % off, all of it from the tutor', () => {
    const p = packagePricing({ originalAmount: LIST, ...tierForHours(4) });
    expect(p).toMatchObject({ finalAmount: 99_000, discountAmount: 11_000, tutorPayoutBase: 99_000 });
    expect(tutorPayout(p.tutorPayoutBase)).toBeCloseTo(84_150);
  });

  it('6–10 h: 15 % off, 7.5 % tutor and 7.5 % Calico, then the commission', () => {
    const p = packagePricing({ originalAmount: LIST, ...tierForHours(8) });
    expect(p).toMatchObject({
      finalAmount: 93_500, discountAmount: 16_500, tutorPayoutBase: 101_750, tutorDiscount: 8_250, calicoDiscount: 8_250,
    });
    const b = paymentBreakdown({ ...p, amount: p.finalAmount, viaWompi: false });
    expect(b.tutorOwed).toBeCloseTo(86_487.5);
    expect(b.calicoNet).toBeCloseTo(7_012.5);
    expect(b.discountAbsorber).toBe('MIXED');
  });

  it('11 h or more: 20 % off, 10 % tutor and 10 % Calico', () => {
    const p = packagePricing({ originalAmount: LIST, ...tierForHours(12) });
    expect(p).toMatchObject({ finalAmount: 88_000, tutorPayoutBase: 99_000 });
    const agg = aggregateFinancials([{ ...p, amount: p.finalAmount, viaWompi: false }]);
    expect(agg.calicoNet).toBeCloseTo(3_850);
    expect(agg.discountCalico).toBeCloseTo(11_000);
  });

  it('no tier: list price for everybody', () => {
    expect(packagePricing({ originalAmount: LIST, ...tierForHours(2) }))
      .toMatchObject({ finalAmount: LIST, discountAmount: 0, tutorPayoutBase: LIST });
  });
});

describe('packageSettlement', () => {
  const session = (tier) => {
    const p = packagePricing({ originalAmount: 110_000, ...tier });
    return { originalAmount: p.originalAmount, discountAmount: p.discountAmount, minutes: 120 };
  };
  const t8 = tierForHours(8);

  it('8 h agreed, 6 taken: still in the 15 % tier, nothing to return', () => {
    const r = packageSettlement({ discountPercent: 15, payments: [session(t8), session(t8), session(t8)] });
    expect(r).toMatchObject({ usedMinutes: 360, settlementAmount: 0 });
  });

  it('8 h agreed, 4 taken: returns the gap down to the 10 % tier', () => {
    const r = packageSettlement({ discountPercent: 15, payments: [session(t8), session(t8)] });
    // each: got 16 500, deserved 11 000 → 5 500 × 2
    expect(r).toMatchObject({ usedMinutes: 240, settlementAmount: 11_000 });
    expect(r.actualTier.discountPercent).toBe(10);
  });

  it('8 h agreed, 2 taken: returns the whole discount', () => {
    const r = packageSettlement({ discountPercent: 15, payments: [session(t8)] });
    expect(r.settlementAmount).toBe(16_500);
  });
});
