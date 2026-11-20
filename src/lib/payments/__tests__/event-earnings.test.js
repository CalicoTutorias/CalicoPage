import {
  EVENT_EARNINGS_POLICY,
  computeEventEarnings,
  estimatedMinStudents,
  eventHours,
  minimumOrShareOfNet,
  splitEqually,
  sumEventEarnings,
  tutorMinimumOf,
} from '../event-earnings';
import { wompiFee } from '../fees';

const START = '2026-11-20T14:00:00.000Z';
const END_4H = '2026-11-20T18:00:00.000Z';
const fee40 = wompiFee(40_000); // 2 094.4

/** n students paying 40 000 through Wompi. */
function wompiStudents(n) {
  const amounts = Array.from({ length: n }, () => 40_000);
  return { amounts, wompiCharges: amounts };
}

describe('EVENT_EARNINGS_POLICY', () => {
  it('pins the current business numbers', () => {
    expect(EVENT_EARNINGS_POLICY).toEqual({ tutorShareOfNet: 0.4, defaultTutorHourlyRate: 60_000 });
    expect(Object.isFrozen(EVENT_EARNINGS_POLICY)).toBe(true);
  });
});

describe('eventHours', () => {
  it('measures the repaso length in hours', () => {
    expect(eventHours(START, END_4H)).toBe(4);
  });

  it('returns 0 for an empty, inverted or invalid range', () => {
    expect(eventHours(START, START)).toBe(0);
    expect(eventHours(END_4H, START)).toBe(0);
    expect(eventHours('nope', END_4H)).toBe(0);
  });
});

describe('tutorMinimumOf', () => {
  it('uses the minimum the team set', () => {
    expect(tutorMinimumOf({ tutorMinPayout: 240_000, hours: 4 })).toBe(240_000);
    expect(tutorMinimumOf({ tutorMinPayout: '250000.00', hours: 4 })).toBe(250_000);
  });

  it('falls back to the hourly rate × hours for repasos without one', () => {
    expect(tutorMinimumOf({ tutorMinPayout: null, hours: 4 })).toBe(240_000);
    expect(tutorMinimumOf({ tutorMinPayout: 0, hours: 3 })).toBe(180_000);
  });
});

describe('estimatedMinStudents', () => {
  it('is ⌈n × M / (price − Wompi fee)⌉', () => {
    expect(estimatedMinStudents({ price: 40_000, tutorMin: 240_000, tutorsCount: 1 })).toBe(7);
    expect(estimatedMinStudents({ price: 40_000, tutorMin: 240_000, tutorsCount: 2 })).toBe(13);
  });

  it('ignores the fee for manual repasos', () => {
    expect(estimatedMinStudents({ price: 40_000, tutorMin: 240_000, tutorsCount: 1, viaWompi: false })).toBe(6);
  });

  it('is null when it cannot be estimated', () => {
    expect(estimatedMinStudents({ price: 0, tutorMin: 240_000, tutorsCount: 1 })).toBeNull();
    expect(estimatedMinStudents({ price: 40_000, tutorMin: 240_000, tutorsCount: 0 })).toBeNull();
  });
});

describe('computeEventEarnings — the spec table (1 tutor, M = 240 000, 40 000 by Wompi)', () => {
  const run = (n) => computeEventEarnings({
    hours: 4, ...wompiStudents(n), tutorIds: ['t1'], tutorMinPayout: 240_000, price: 40_000,
  });

  it('is not held when the net collection does not cover the minimum (6 students)', () => {
    const e = run(6);
    expect(e.netCollected).toBe(240_000 - Math.round(6 * fee40));
    expect(e).toMatchObject({ meetsMinimum: false, tutorPayout: 0, calicoNet: 0, minConfirmed: 7 });
  });

  it('pays the minimum with 7 students', () => {
    const e = run(7);
    expect(e).toMatchObject({ meetsMinimum: true, tutorPayout: 240_000, tutorBase: 240_000, tutorExtra: 0 });
    expect(e.wompiFees).toBe(14_661);
    expect(e.calicoNet).toBe(280_000 - 14_661 - 240_000);
  });

  it('still pays the minimum with 10 students (40 % is below it)', () => {
    const e = run(10);
    expect(e.tutorPayout).toBe(240_000);
    expect(e.calicoNet).toBe(400_000 - 20_944 - 240_000);
  });

  it('pays 40 % of the net once it beats the minimum (16 students)', () => {
    const e = run(16);
    const net = 640_000 - Math.round(16 * fee40);
    expect(e.tutorPayout).toBe(Math.round(net * 0.4));
    expect(e.tutorExtra).toBe(e.tutorPayout - 240_000);
    expect(e.calicoNet).toBe(net - e.tutorPayout);
  });

  it('20 students: tutor 303 245, Calico 454 867', () => {
    const e = run(20);
    expect(e.tutorPayout).toBe(303_245);
    expect(e.calicoNet).toBe(454_867);
  });
});

describe('computeEventEarnings — several tutors', () => {
  it('the minimum is per tutor and the total is split in equal parts', () => {
    const below = computeEventEarnings({ hours: 4, ...wompiStudents(12), tutorIds: ['a', 'b'], tutorMinPayout: 240_000 });
    expect(below.meetsMinimum).toBe(false);
    expect(below.requiredForTutors).toBe(480_000);

    const held = computeEventEarnings({ hours: 4, ...wompiStudents(13), tutorIds: ['a', 'b'], tutorMinPayout: 240_000 });
    expect(held.meetsMinimum).toBe(true);
    expect(held.tutorPayout).toBe(480_000);
    expect(held.perTutor).toEqual([{ tutorId: 'a', amount: 240_000 }, { tutorId: 'b', amount: 240_000 }]);
  });
});

describe('computeEventEarnings — manual and free repasos', () => {
  it('a manual repaso has no Wompi fee: R is what was collected', () => {
    const e = computeEventEarnings({ hours: 4, amounts: Array(8).fill(40_000), tutorIds: ['t'], tutorMinPayout: 240_000 });
    expect(e.wompiFees).toBe(0);
    expect(e.netCollected).toBe(320_000);
    expect(e.tutorPayout).toBe(240_000);
    expect(e.calicoNet).toBe(80_000);
  });

  it('a free repaso owes nothing and counts as held with any attendee', () => {
    const e = computeEventEarnings({ hours: 2, amounts: [0, 0], tutorIds: ['t'], tutorMinPayout: 240_000 });
    expect(e).toMatchObject({ meetsMinimum: true, tutorPayout: 0, calicoNet: 0 });
  });

  it('with nobody confirmed it is not held', () => {
    const e = computeEventEarnings({ hours: 2, amounts: [], tutorIds: ['t'] });
    expect(e).toMatchObject({ meetsMinimum: false, confirmed: 0, tutorPayout: 0, calicoNet: 0 });
  });

  it('uses the hourly fallback when the repaso has no minimum', () => {
    const e = computeEventEarnings({ hours: 3, amounts: Array(10).fill(40_000), tutorIds: ['t'] });
    expect(e.tutorMin).toBe(180_000);
    expect(e.tutorPayout).toBe(180_000);
  });

  it('counts fees on charges that are not confirmed any more (refunds keep the fee)', () => {
    const e = computeEventEarnings({
      hours: 4, amounts: Array(8).fill(40_000), wompiCharges: Array(9).fill(40_000), tutorIds: ['t'], tutorMinPayout: 200_000,
    });
    expect(e.wompiFees).toBe(Math.round(9 * fee40));
  });

  it('accepts Prisma Decimals / strings', () => {
    const e = computeEventEarnings({ hours: 4, amounts: Array(8).fill('40000.00'), tutorIds: ['t'], tutorMinPayout: '240000' });
    expect(e.collected).toBe(320_000);
    expect(e.tutorPayout).toBe(240_000);
  });
});

describe('splitEqually', () => {
  it('splits in equal parts and gives the leftover pesos to the first tutors', () => {
    expect(splitEqually(100, ['a', 'b', 'c'])).toEqual([
      { tutorId: 'a', amount: 34 }, { tutorId: 'b', amount: 33 }, { tutorId: 'c', amount: 33 },
    ]);
    expect(splitEqually(100, [])).toEqual([]);
  });
});

describe('swappable rules', () => {
  it('a different policy changes the numbers without touching the math', () => {
    const e = computeEventEarnings(
      { hours: 4, amounts: Array(20).fill(40_000), tutorIds: ['t'], tutorMinPayout: 100_000 },
      { policy: { ...EVENT_EARNINGS_POLICY, tutorShareOfNet: 0.5 } },
    );
    expect(e.tutorPayout).toBe(400_000);
  });

  it('minimumOrShareOfNet is exported for reuse', () => {
    expect(minimumOrShareOfNet({ netCollected: 1_000_000, tutorMin: 100_000, tutorsCount: 2, policy: EVENT_EARNINGS_POLICY }))
      .toEqual({ meetsMinimum: true, base: 200_000, extra: 200_000 });
  });
});

describe('sumEventEarnings', () => {
  it('adds up only the repasos that met the minimum', () => {
    const totals = sumEventEarnings([
      { meetsMinimum: true, collected: 10, tutorPayout: 5, wompiFees: 1, calicoNet: 4 },
      { meetsMinimum: false, collected: 99, tutorPayout: 0, wompiFees: 0, calicoNet: 0 },
    ]);
    expect(totals).toEqual({ events: 1, collected: 10, tutorPayout: 5, wompiFees: 1, calicoNet: 4 });
  });
});

describe('LEGACY repasos (held before the rule changed)', () => {
  it('keep the old rule: 60 000/h from 8 students + 70 % of each extra student', () => {
    const e = computeEventEarnings({
      hours: 4, amounts: Array(10).fill(40_000), tutorIds: ['t1'], tutorMinPayout: 999_999, earningsRule: 'LEGACY',
    });
    expect(e).toMatchObject({ earningsRule: 'LEGACY', meetsMinimum: true, tutorBase: 240_000, tutorExtra: 56_000, tutorPayout: 296_000 });
    expect(e.calicoNet).toBe(400_000 - 296_000);
  });

  it('below 8 students the old rule did not hold the repaso', () => {
    const e = computeEventEarnings({ hours: 4, amounts: Array(7).fill(40_000), tutorIds: ['t1'], earningsRule: 'LEGACY' });
    expect(e.meetsMinimum).toBe(false);
  });

  it('new repasos say which rule they used', () => {
    expect(computeEventEarnings({ hours: 4, amounts: [], tutorIds: [] }).earningsRule).toBe('MIN_OR_SHARE');
  });
});

describe('repasos whose tutors do not charge (tutorsUnpaid)', () => {
  it('owe the tutors nothing and Calico keeps the whole net collection', () => {
    const e = computeEventEarnings({ hours: 4, ...wompiStudents(3), tutorIds: ['t1', 't2'], tutorMinPayout: 240_000, tutorsUnpaid: true });
    const net = 120_000 - Math.round(3 * fee40);
    expect(e).toMatchObject({
      tutorsUnpaid: true, meetsMinimum: true, tutorMin: 0, requiredForTutors: 0, minConfirmed: null,
      tutorPayout: 0, netCollected: net, calicoNet: net,
    });
    expect(e.perTutor).toEqual([{ tutorId: 't1', amount: 0 }, { tutorId: 't2', amount: 0 }]);
  });

  it('are held with a single confirmed student, below any minimum', () => {
    const e = computeEventEarnings({ hours: 4, ...wompiStudents(1), tutorIds: ['t1'], tutorsUnpaid: true });
    expect(e.meetsMinimum).toBe(true);
  });

  it('without registrations they are not held', () => {
    const e = computeEventEarnings({ hours: 4, amounts: [], tutorIds: ['t1'], tutorsUnpaid: true });
    expect(e).toMatchObject({ meetsMinimum: false, tutorPayout: 0, calicoNet: 0 });
  });

  it('by default the tutors are paid', () => {
    expect(computeEventEarnings({ hours: 4, ...wompiStudents(20), tutorIds: ['t1'] })).toMatchObject({ tutorsUnpaid: false });
  });
});
