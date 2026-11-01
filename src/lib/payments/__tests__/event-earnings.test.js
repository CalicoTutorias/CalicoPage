/**
 * @jest-environment node
 *
 * Unit tests for the repaso earnings model in
 * `src/lib/payments/event-earnings.js`. The figures follow the "Guía para el
 * tutor" of the EDA repaso (Oct 2026): 60 000/h, minimum of 8 confirmed,
 * 70 % of each extra student to the tutors, equal split, Calico absorbs
 * Wompi. If the policy changes on purpose, these numbers change with it.
 */

const {
  EVENT_EARNINGS_POLICY,
  eventHours,
  hourlyBasePlusExtraShare,
  splitEqually,
  computeEventEarnings,
  sumEventEarnings,
} = require('@/lib/payments/event-earnings');
const { wompiFee } = require('@/lib/payments/fees');

const EARLY = 36000; // 40 000 with the 10 % early-bird discount
const FULL = 40000;
/** n confirmed students in confirmation order: the first 5 early-bird, the rest full price. */
const students = (n) => Array.from({ length: n }, (_, i) => (i < 5 ? EARLY : FULL));

describe('EVENT_EARNINGS_POLICY', () => {
  it('pins the current business numbers', () => {
    expect(EVENT_EARNINGS_POLICY).toEqual({ tutorHourlyRate: 60000, minConfirmed: 8, extraStudentTutorShare: 0.7 });
    expect(Object.isFrozen(EVENT_EARNINGS_POLICY)).toBe(true);
  });
});

describe('eventHours', () => {
  it('measures the repaso length in hours', () => {
    expect(eventHours('2026-11-01T16:00:00Z', '2026-11-01T20:00:00Z')).toBe(4);
    expect(eventHours('2026-11-01T16:00:00Z', '2026-11-01T18:30:00Z')).toBe(2.5);
  });

  it('returns 0 for an empty, inverted or invalid range', () => {
    expect(eventHours('2026-11-01T16:00:00Z', '2026-11-01T16:00:00Z')).toBe(0);
    expect(eventHours('2026-11-01T18:00:00Z', '2026-11-01T16:00:00Z')).toBe(0);
    expect(eventHours('nope', '2026-11-01T16:00:00Z')).toBe(0);
  });
});

describe('computeEventEarnings — the guide\'s table (4 h, manual)', () => {
  it.each([
    [8, 300000, 240000, 60000],
    [9, 340000, 268000, 72000],
    [10, 380000, 296000, 84000],
    [11, 420000, 324000, 96000],
    [12, 460000, 352000, 108000],
  ])('%i confirmed → collected %i, tutors %i, Calico %i', (n, collected, tutors, calico) => {
    const out = computeEventEarnings({ hours: 4, amounts: students(n), tutorIds: ['t1'] });
    expect(out.meetsMinimum).toBe(true);
    expect(out.collected).toBe(collected);
    expect(out.tutorPayout).toBe(tutors);
    expect(out.wompiFees).toBe(0);
    expect(out.calicoNet).toBe(calico);
    expect(out.perTutor).toEqual([{ tutorId: 't1', amount: tutors }]);
  });

  it('separates the base from the extra-student share', () => {
    const out = computeEventEarnings({ hours: 4, amounts: students(10) });
    expect(out.tutorBase).toBe(240000);
    expect(out.tutorExtra).toBe(56000); // 2 × 70 % × 40 000
  });
});

describe('computeEventEarnings — below the minimum', () => {
  it('earns nothing for anyone but still reports what was collected', () => {
    const out = computeEventEarnings({ hours: 4, amounts: students(7), wompiCharges: [EARLY], tutorIds: ['t1', 't2'] });
    expect(out).toMatchObject({
      confirmed: 7, minConfirmed: 8, meetsMinimum: false,
      collected: 5 * EARLY + 2 * FULL,
      tutorBase: 0, tutorExtra: 0, tutorPayout: 0, wompiFees: 0, calicoNet: 0,
    });
    expect(out.perTutor).toEqual([{ tutorId: 't1', amount: 0 }, { tutorId: 't2', amount: 0 }]);
  });

  it('handles a repaso with nobody confirmed', () => {
    const out = computeEventEarnings({ hours: 2, amounts: [] });
    expect(out.meetsMinimum).toBe(false);
    expect(out.collected).toBe(0);
  });
});

describe('computeEventEarnings — free repaso', () => {
  it('owes the tutors nothing and leaves Calico at 0, whatever the headcount', () => {
    const out = computeEventEarnings({ hours: 3.5, amounts: Array(30).fill(0), tutorIds: ['a', 'b', 'c'] });
    expect(out).toMatchObject({
      confirmed: 30, meetsMinimum: true, collected: 0,
      tutorBase: 0, tutorExtra: 0, tutorPayout: 0, wompiFees: 0, calicoNet: 0,
    });
    expect(out.perTutor).toEqual([
      { tutorId: 'a', amount: 0 }, { tutorId: 'b', amount: 0 }, { tutorId: 'c', amount: 0 },
    ]);
  });

  it('counts as held even below the minimum, because the minimum is about paying the tutors', () => {
    expect(computeEventEarnings({ hours: 3.5, amounts: [0, 0] })).toMatchObject({
      confirmed: 2, meetsMinimum: true, tutorPayout: 0, calicoNet: 0,
    });
  });

  it('with nobody confirmed it is still below the minimum', () => {
    expect(computeEventEarnings({ hours: 3.5, amounts: [] })).toMatchObject({ meetsMinimum: false, tutorPayout: 0 });
  });

  it('a single paying student keeps the normal base', () => {
    const out = computeEventEarnings({ hours: 4, amounts: [...Array(7).fill(0), FULL] });
    expect(out).toMatchObject({ meetsMinimum: true, tutorBase: 240000 });
  });
});

describe('computeEventEarnings — hours, Wompi and amounts', () => {
  it('scales the base with the repaso length (3 h → 180 000)', () => {
    const out = computeEventEarnings({ hours: 3, amounts: Array(22).fill(FULL) });
    expect(out.tutorBase).toBe(180000);
    expect(out.tutorExtra).toBe(392000); // 14 × 28 000
    expect(out.calicoNet).toBe(880000 - 572000);
  });

  it('Calico absorbs the Wompi fee of every charge', () => {
    const amounts = students(9);
    const out = computeEventEarnings({ hours: 4, amounts, wompiCharges: amounts });
    const fees = Math.round(amounts.reduce((acc, a) => acc + wompiFee(a), 0));
    expect(out.wompiFees).toBe(fees);
    expect(out.tutorPayout).toBe(268000); // the tutors' pay ignores the fee
    expect(out.calicoNet).toBe(340000 - 268000 - fees);
  });

  it('counts fees on charges that are not confirmed any more (refunds keep the fee)', () => {
    const out = computeEventEarnings({ hours: 4, amounts: students(8), wompiCharges: [...students(8), FULL] });
    expect(out.wompiFees).toBe(Math.round([...students(8), FULL].reduce((acc, a) => acc + wompiFee(a), 0)));
  });

  it('takes the extra share on what each extra student actually paid', () => {
    // An early-bird seat past the minimum (more seats than the minimum) pays 36 000.
    const out = computeEventEarnings({ hours: 4, amounts: [...Array(8).fill(FULL), EARLY] });
    expect(out.tutorExtra).toBe(25200); // 70 % × 36 000
  });

  it('accepts Prisma Decimals / strings', () => {
    const out = computeEventEarnings({ hours: 4, amounts: Array(9).fill('40000.00') });
    expect(out.collected).toBe(360000);
    expect(out.tutorPayout).toBe(268000);
  });
});

describe('splitEqually', () => {
  it('splits in equal parts', () => {
    expect(splitEqually(300000, ['a', 'b', 'c'])).toEqual([
      { tutorId: 'a', amount: 100000 }, { tutorId: 'b', amount: 100000 }, { tutorId: 'c', amount: 100000 },
    ]);
  });

  it('gives the leftover pesos to the first tutors so the parts add up', () => {
    const parts = splitEqually(100, ['a', 'b', 'c']);
    expect(parts.map((p) => p.amount)).toEqual([34, 33, 33]);
    expect(parts.reduce((acc, p) => acc + p.amount, 0)).toBe(100);
  });

  it('returns no parts without tutors', () => {
    expect(splitEqually(1000, [])).toEqual([]);
  });

  it('is what computeEventEarnings uses for several tutors', () => {
    const out = computeEventEarnings({ hours: 4, amounts: students(9), tutorIds: ['a', 'b', 'c'] });
    expect(out.perTutor.map((p) => p.amount)).toEqual([89334, 89333, 89333]);
  });
});

describe('swappable rules', () => {
  it('a different policy changes the numbers without touching the math', () => {
    const policy = { tutorHourlyRate: 50000, minConfirmed: 6, extraStudentTutorShare: 0.5 };
    const out = computeEventEarnings({ hours: 4, amounts: Array(8).fill(FULL) }, { policy });
    expect(out.tutorBase).toBe(200000);
    expect(out.tutorExtra).toBe(40000); // 2 × 50 % × 40 000
    expect(out.minConfirmed).toBe(6);
  });

  it('a custom tutorPoolRule replaces the default model', () => {
    const revenueShare = ({ amounts }) => ({
      meetsMinimum: amounts.length > 0,
      base: 0,
      extra: Math.round(amounts.reduce((a, b) => a + b, 0) * 0.6),
    });
    const out = computeEventEarnings({ hours: 4, amounts: [FULL, FULL] }, { tutorPoolRule: revenueShare });
    expect(out.tutorPayout).toBe(48000);
    expect(out.calicoNet).toBe(32000);
  });

  it('a custom splitRule replaces the equal split', () => {
    const allToLead = (total, ids) => ids.map((tutorId, i) => ({ tutorId, amount: i === 0 ? total : 0 }));
    const out = computeEventEarnings({ hours: 4, amounts: students(8), tutorIds: ['lead', 'helper'] }, { splitRule: allToLead });
    expect(out.perTutor).toEqual([{ tutorId: 'lead', amount: 240000 }, { tutorId: 'helper', amount: 0 }]);
  });

  it('hourlyBasePlusExtraShare is exported for reuse', () => {
    expect(hourlyBasePlusExtraShare({ hours: 1, amounts: Array(8).fill(1), policy: EVENT_EARNINGS_POLICY }))
      .toEqual({ meetsMinimum: true, base: 60000, extra: 0 });
  });
});

describe('sumEventEarnings', () => {
  it('adds up only the repasos that met the minimum', () => {
    const held = computeEventEarnings({ hours: 4, amounts: students(8) });
    const below = computeEventEarnings({ hours: 4, amounts: students(3) });
    expect(sumEventEarnings([held, below])).toEqual({
      events: 1, collected: 300000, tutorPayout: 240000, wompiFees: 0, calicoNet: 60000,
    });
  });

  it('is all zeros for no repasos', () => {
    expect(sumEventEarnings()).toEqual({ events: 0, collected: 0, tutorPayout: 0, wompiFees: 0, calicoNet: 0 });
  });
});
