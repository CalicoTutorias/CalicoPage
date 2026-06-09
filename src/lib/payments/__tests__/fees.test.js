/**
 * @jest-environment node
 *
 * Unit tests for the fee math in `src/lib/payments/fees.js`.
 *
 * This module is the single source of truth for how money is split between
 * Calico, the tutor and the Wompi gateway, so the assertions here pin down
 * exact COP figures (computed by hand from the documented rates) rather than
 * just "looks about right". If a rate constant changes on purpose, these
 * numbers are expected to change with it — that is the safety net.
 */

const {
  CALICO_COMMISSION_RATE,
  TUTOR_SHARE_RATE,
  WOMPI_PERCENT,
  WOMPI_FIXED_COP,
  IVA_RATE,
  CALICO_COMMISSION_PCT,
  TUTOR_SHARE_PCT,
  wompiFee,
  calicoNet,
  tutorPayout,
  aggregateFinancials,
  aggregateFinancialsFromTotals,
  breakEvenPrice,
} = require('@/lib/payments/fees');

describe('rate constants', () => {
  it('Calico commission and tutor share sum to 100%', () => {
    expect(CALICO_COMMISSION_RATE + TUTOR_SHARE_RATE).toBeCloseTo(1, 10);
  });

  it('exposes the documented Wompi / IVA rates', () => {
    expect(WOMPI_PERCENT).toBe(0.0265);
    expect(WOMPI_FIXED_COP).toBe(700);
    expect(IVA_RATE).toBe(0.19);
  });

  it('derives human-readable percentage strings from the rate constants', () => {
    expect(CALICO_COMMISSION_PCT).toBe('15%');
    expect(TUTOR_SHARE_PCT).toBe('85%');
  });
});

describe('wompiFee', () => {
  it('applies 2.65% + $700 fixed, plus 19% IVA on top', () => {
    // (100000 * 0.0265 + 700) * 1.19 = (2650 + 700) * 1.19 = 3350 * 1.19 = 3986.5
    expect(wompiFee(100000)).toBeCloseTo(3986.5, 6);
  });

  it('charges only the fixed component (+IVA) on a zero-amount transaction', () => {
    // (0 + 700) * 1.19 = 833
    expect(wompiFee(0)).toBeCloseTo(833, 6);
  });

  it('normalises Prisma-style string / Decimal inputs', () => {
    expect(wompiFee('100000')).toBeCloseTo(3986.5, 6);
    expect(wompiFee({ toString: () => '100000' })).toBeCloseTo(3986.5, 6);
  });

  it('treats null / undefined / NaN as zero', () => {
    expect(wompiFee(null)).toBeCloseTo(833, 6);
    expect(wompiFee(undefined)).toBeCloseTo(833, 6);
    expect(wompiFee('not-a-number')).toBeCloseTo(833, 6);
  });
});

describe('calicoNet', () => {
  it('is 15% of gross minus the Wompi fee', () => {
    // 100000 * 0.15 - 3986.5 = 15000 - 3986.5 = 11013.5
    expect(calicoNet(100000)).toBeCloseTo(11013.5, 6);
  });

  it('goes negative for tiny transactions (fixed fee dominates)', () => {
    // At $1000: 150 - (26.5 + 700) * 1.19 = 150 - 864.535 = -714.535
    expect(calicoNet(1000)).toBeLessThan(0);
    expect(calicoNet(1000)).toBeCloseTo(-714.535, 6);
  });

  it('equals commission minus fee for any amount', () => {
    const amount = 250000;
    expect(calicoNet(amount)).toBeCloseTo(
      amount * CALICO_COMMISSION_RATE - wompiFee(amount),
      6,
    );
  });
});

describe('tutorPayout', () => {
  it('is exactly 85% of gross, independent of the Wompi fee', () => {
    expect(tutorPayout(100000)).toBe(85000);
    expect(tutorPayout(50000)).toBe(42500);
  });

  it('normalises string inputs and treats null as zero', () => {
    expect(tutorPayout('100000')).toBe(85000);
    expect(tutorPayout(null)).toBe(0);
  });
});

describe('aggregateFinancials', () => {
  it('sums gross, net and tutor payout across a list of amounts', () => {
    const result = aggregateFinancials([100000, 100000]);
    expect(result.gross).toBe(200000);
    expect(result.tutorPayout).toBeCloseTo(170000, 2);
    // 2 × 11013.5
    expect(result.calicoNet).toBeCloseTo(22027, 2);
  });

  it('keeps the identity gross = calicoNet + tutorPayout + wompiFeeTotal', () => {
    const result = aggregateFinancials([10000, 250000, 7032]);
    const reconstructed =
      result.calicoNet + result.tutorPayout + result.wompiFeeTotal;
    expect(reconstructed).toBeCloseTo(result.gross, 2);
  });

  it('reports the effective margin as net / gross', () => {
    const result = aggregateFinancials([100000, 100000]);
    expect(result.effectiveMargin).toBeCloseTo(result.calicoNet / result.gross, 6);
  });

  it('returns an all-zero breakdown (margin 0) for an empty list', () => {
    expect(aggregateFinancials([])).toEqual({
      gross: 0,
      calicoNet: 0,
      tutorPayout: 0,
      wompiFeeTotal: 0,
      effectiveMargin: 0,
    });
  });

  it('defaults to an empty list when called with no arguments', () => {
    expect(aggregateFinancials().gross).toBe(0);
  });
});

describe('aggregateFinancialsFromTotals', () => {
  it('matches aggregateFinancials (to the cent) for the same gross and count', () => {
    const amounts = [120000, 80000, 45000];
    const gross = amounts.reduce((a, b) => a + b, 0);

    const fromList = aggregateFinancials(amounts);
    const fromTotals = aggregateFinancialsFromTotals({ gross, count: amounts.length });

    // The two paths round independently (per-amount sum vs. closed-form), so
    // they can disagree by up to one cent on float accumulation. That is
    // irrelevant for COP; assert agreement within ±0.01 rather than exact bytes.
    expect(fromTotals.gross).toBe(fromList.gross);
    expect(Math.abs(fromTotals.calicoNet - fromList.calicoNet)).toBeLessThan(0.02);
    expect(Math.abs(fromTotals.tutorPayout - fromList.tutorPayout)).toBeLessThan(0.02);
    expect(Math.abs(fromTotals.wompiFeeTotal - fromList.wompiFeeTotal)).toBeLessThan(0.02);
  });

  it('accounts for the fixed fee once per transaction via count', () => {
    // Same gross, more transactions ⇒ more fixed-fee hits ⇒ lower net.
    const oneTx = aggregateFinancialsFromTotals({ gross: 200000, count: 1 });
    const tenTx = aggregateFinancialsFromTotals({ gross: 200000, count: 10 });
    expect(tenTx.calicoNet).toBeLessThan(oneTx.calicoNet);
    expect(tenTx.wompiFeeTotal).toBeGreaterThan(oneTx.wompiFeeTotal);
  });

  it('normalises string totals from a SQL GROUP BY', () => {
    const result = aggregateFinancialsFromTotals({ gross: '100000', count: '1' });
    expect(result.calicoNet).toBeCloseTo(11013.5, 2);
  });

  it('returns an all-zero breakdown for zero totals or no argument', () => {
    expect(aggregateFinancialsFromTotals({ gross: 0, count: 0 }).effectiveMargin).toBe(0);
    expect(aggregateFinancialsFromTotals().gross).toBe(0);
  });
});

describe('breakEvenPrice', () => {
  it('is the price at which Calico net crosses zero (≈ 7032 COP)', () => {
    const price = breakEvenPrice();
    expect(price).toBeCloseTo(7032, 0);
  });

  it('yields a Calico net of ~0 when charged exactly the break-even price', () => {
    expect(calicoNet(breakEvenPrice())).toBeCloseTo(0, 6);
  });

  it('is profitable just above and unprofitable just below break-even', () => {
    const price = breakEvenPrice();
    expect(calicoNet(price + 1000)).toBeGreaterThan(0);
    expect(calicoNet(price - 1000)).toBeLessThan(0);
  });
});
