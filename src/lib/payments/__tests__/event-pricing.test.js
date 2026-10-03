const p = require('@/lib/payments/event-pricing');

describe('validateEventPricing', () => {
  it.each([
    [{ price: 0 }, null],
    [{ price: 1500 }, null],
    [{ price: 20000, earlyBirdSlots: 5, earlyBirdPercent: 10 }, null],
    [{ price: -1 }, 'PRICE_INVALID'],
    [{ price: 1000.5 }, 'PRICE_INVALID'],
    [{ price: 1000 }, 'PRICE_BELOW_MINIMUM'],
    [{ price: 20000, earlyBirdSlots: 5 }, 'EARLY_BIRD_INCOMPLETE'],
    [{ price: 0, earlyBirdSlots: 5, earlyBirdPercent: 10 }, 'EARLY_BIRD_ON_FREE'],
    [{ price: 20000, earlyBirdSlots: 0, earlyBirdPercent: 10 }, 'EARLY_BIRD_SLOTS_INVALID'],
    [{ price: 20000, earlyBirdSlots: 5, earlyBirdPercent: 100 }, 'EARLY_BIRD_PERCENT_INVALID'],
    [{ price: 1600, earlyBirdSlots: 1, earlyBirdPercent: 10 }, 'EARLY_BIRD_BELOW_MINIMUM'], // 1600 − 160 = 1440 < 1500
  ])('%j → %s', (input, expected) => {
    expect(p.validateEventPricing(input)).toBe(expected);
  });
});

describe('quoteEvent', () => {
  it('applies the rounded early-bird discount only when asked', () => {
    expect(p.quoteEvent({ price: 1999, earlyBirdPercent: 10 }, { earlyBird: true }))
      .toEqual({ listPrice: 1999, discountAmount: 200, finalAmount: 1799, earlyBird: true });
    expect(p.quoteEvent({ price: 1999, earlyBirdPercent: 10 }, { earlyBird: false }))
      .toEqual({ listPrice: 1999, discountAmount: 0, finalAmount: 1999, earlyBird: false });
  });
  it('accepts Prisma Decimal-like prices', () => {
    expect(p.quoteEvent({ price: { toString: () => '2000.00', valueOf: () => '2000.00' }, earlyBirdPercent: 10 }, { earlyBird: true }).finalAmount).toBe(1800);
  });
});

describe('isRefundableAt', () => {
  const start = new Date('2026-10-18T23:00:00.000Z');
  const before = (ms) => new Date(start.getTime() - ms);

  it('is true when the start is at least 6 h away (exactly 6 h included)', () => {
    expect(p.isRefundableAt(start, before(6 * 3_600_000))).toBe(true);
    expect(p.isRefundableAt(start.toISOString(), before(48 * 3_600_000))).toBe(true);
  });

  it('is false under 6 h, at the start and after it', () => {
    expect(p.isRefundableAt(start, before(6 * 3_600_000 - 60_000))).toBe(false); // 5 h 59 min
    expect(p.isRefundableAt(start, start)).toBe(false);
    expect(p.isRefundableAt(start, new Date(start.getTime() + 60_000))).toBe(false);
  });
});
