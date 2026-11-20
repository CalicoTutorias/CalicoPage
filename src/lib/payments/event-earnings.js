/**
 * Earnings of a repaso (group event): what its tutors and Calico get out of it.
 *
 * Business model (Nov 2026, "Especificación funcional: libro de movimientos"):
 *   - Each repaso carries a minimum per tutor, M (`events.tutor_min_payout`),
 *     set by the Calico team when the repaso is created — usually more than
 *     the same hours would pay as normal tutoring. Repasos created before the
 *     field existed fall back to `defaultTutorHourlyRate` × hours.
 *   - Net collection, R = what the CONFIRMED students paid − the Wompi fees of
 *     every charge of the repaso (Wompi keeps its fee on refunds too).
 *   - The tutors are owed max(n × M, 40 % × R), split in equal parts, so every
 *     tutor gets at least M. 40 % of R reaches the minimum when R = 2.5 × n × M.
 *   - The repaso is only held when R ≥ n × M: what was collected must cover
 *     the minimum of every tutor. Checked on money actually paid, not on a
 *     headcount, because early-bird seats and coupons make prices differ.
 *   - Calico's net = R − tutors' total. Calico also absorbs the 4x1000 of the
 *     transfers, which the ledger records when the money leaves the bank.
 *   - A free repaso collects nothing and owes its tutors nothing, whatever its
 *     headcount (the founders teach those themselves): Calico's net is 0, and
 *     with any attendee at all it counts as held.
 *   - A repaso marked `tutorsUnpaid` (the team teaches it, paid or not) owes its
 *     tutors nothing either: no minimum, no share, Calico keeps all of R, and
 *     with any confirmed student it counts as held.
 *
 * Repasos that had already happened when this rule arrived keep the rule
 * they were paid under (`earningsRule: 'LEGACY'`, see LEGACY_EVENT_EARNINGS_POLICY):
 * their tutors were already paid, so the new rule only applies going forward.
 *
 * Each rule stays a swappable piece: the numbers live in EVENT_EARNINGS_POLICY,
 * the tutors' total in a `tutorPoolRule` and the split in a `splitRule`.
 * Callers always go through `computeEventEarnings` and never re-implement the
 * math.
 *
 * Pure and client-safe. Amounts are integer COP; inputs may be strings or
 * Prisma Decimals.
 */

import { wompiFee } from './fees';

export const EVENT_EARNINGS_POLICY = Object.freeze({
  tutorShareOfNet:        0.40,   // tutors' share of the net collection once it beats the minimum
  defaultTutorHourlyRate: 60_000, // COP per hour: fallback M for repasos without a minimum
});

/**
 * Rule of the repasos held before Nov 2026 (`events.earnings_rule = LEGACY`):
 * 60 000/h × hours once 8 students are confirmed, plus 70 % of what each
 * student beyond the 8th paid. Kept so their history reads as it was paid.
 */
export const LEGACY_EVENT_EARNINGS_POLICY = Object.freeze({
  tutorHourlyRate:        60_000,
  minConfirmed:           8,
  extraStudentTutorShare: 0.70,
});

export const EARNINGS_RULES = Object.freeze({ LEGACY: 'LEGACY', MIN_OR_SHARE: 'MIN_OR_SHARE' });

function toNumber(v) {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const sum = (values) => values.reduce((acc, v) => acc + v, 0);

/** Length of a repaso in (possibly fractional) hours; 0 when the range is invalid. */
export function eventHours(startsAt, endsAt) {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 3_600_000 : 0;
}

/**
 * Minimum per tutor of a repaso: the one the team set, or the legacy hourly
 * fallback when the repaso has none.
 */
export function tutorMinimumOf({ tutorMinPayout, hours }, policy = EVENT_EARNINGS_POLICY) {
  const set = tutorMinPayout == null ? null : toNumber(tutorMinPayout);
  if (set != null && set > 0) return Math.round(set);
  return Math.round(policy.defaultTutorHourlyRate * toNumber(hours));
}

/**
 * Estimated confirmed students needed to cover the minimum at list price:
 * ⌈n × M / (price − Wompi fee per student)⌉. Only a reference for the admin;
 * whether the repaso is held is decided on what was actually paid.
 * null when it cannot be estimated (free or manual repaso, or no tutors).
 */
export function estimatedMinStudents({ price, tutorMin, tutorsCount, viaWompi = true }) {
  const p = toNumber(price);
  const required = toNumber(tutorMin) * Math.max(0, tutorsCount);
  if (p <= 0 || required <= 0) return null;
  const netPerStudent = viaWompi ? p - wompiFee(p) : p;
  if (netPerStudent <= 0) return null;
  return Math.ceil(required / netPerStudent);
}

/**
 * Default tutorPoolRule: max(n × M, share × R), once R covers n × M.
 * @returns {{ meetsMinimum: boolean, base: number, extra: number }}
 *   `base` = n × M, `extra` = what the share of R adds on top of it.
 */
export function minimumOrShareOfNet({ netCollected, tutorMin, tutorsCount, policy }) {
  const required = Math.round(tutorMin * tutorsCount);
  if (netCollected < required) return { meetsMinimum: false, base: 0, extra: 0 };
  const share = Math.round(netCollected * policy.tutorShareOfNet);
  return { meetsMinimum: true, base: required, extra: Math.max(0, share - required) };
}

/**
 * Default splitRule: equal parts in whole pesos. The leftover pesos go one
 * each to the first tutors, so the parts always add up to `total`.
 * @returns {Array<{ tutorId: string, amount: number }>}
 */
export function splitEqually(total, tutorIds) {
  const n = tutorIds.length;
  if (n === 0) return [];
  const share = Math.floor(total / n);
  const leftover = total - share * n;
  return tutorIds.map((tutorId, i) => ({ tutorId, amount: share + (i < leftover ? 1 : 0) }));
}

/**
 * Earnings of one repaso.
 *
 * @param {object}   input
 * @param {number}   input.hours           repaso length (see `eventHours`)
 * @param {Array}    input.amounts         what each CONFIRMED student paid
 * @param {Array}    [input.wompiCharges]  every Wompi charge of the event (the fee is kept on
 *                                         refunds too); empty for manual repasos
 * @param {string[]} [input.tutorIds]      the event's tutors, in display order
 * @param {number}   [input.tutorMinPayout] M set by the team (null → hourly fallback)
 * @param {number}   [input.price]         list price, only for the students estimate
 * @param {string}   [input.earningsRule]  'LEGACY' for repasos held before the rule changed (old hourly rule)
 * @param {boolean}  [input.tutorsUnpaid]  the tutors don't charge for this repaso (MIN_OR_SHARE only)
 * @param {object}   [rules]               override any piece of the model
 * @returns {{
 *   confirmed: number, minConfirmed: number|null, meetsMinimum: boolean,
 *   collected: number, wompiFees: number, netCollected: number,
 *   tutorMin: number, requiredForTutors: number,
 *   tutorBase: number, tutorExtra: number, tutorPayout: number,
 *   perTutor: Array<{ tutorId: string, amount: number }>, calicoNet: number,
 * }} A repaso below the minimum reports what was collected but earns 0 for everyone.
 *   `minConfirmed` is the estimated headcount that covers the minimum (null when
 *   it cannot be estimated).
 */
export function computeEventEarnings(
  {
    hours, amounts = [], wompiCharges = [], tutorIds = [], tutorMinPayout = null, price = 0,
    earningsRule = EARNINGS_RULES.MIN_OR_SHARE, tutorsUnpaid = false,
  },
  {
    policy = EVENT_EARNINGS_POLICY,
    tutorPoolRule = minimumOrShareOfNet,
    splitRule = splitEqually,
  } = {},
) {
  if (earningsRule === EARNINGS_RULES.LEGACY) {
    return computeLegacyEventEarnings({ hours, amounts, wompiCharges, tutorIds });
  }
  const paid = amounts.map(toNumber);
  const collected = Math.round(sum(paid));
  const wompiFees = Math.round(sum(wompiCharges.map((c) => wompiFee(toNumber(c)))));
  const netCollected = collected - wompiFees;
  const tutorsCount = tutorIds.length;
  const unpaid = Boolean(tutorsUnpaid);
  const tutorMin = unpaid ? 0 : tutorMinimumOf({ tutorMinPayout, hours }, policy);
  const requiredForTutors = tutorMin * tutorsCount;

  const head = {
    earningsRule: EARNINGS_RULES.MIN_OR_SHARE,
    tutorsUnpaid: unpaid,
    confirmed: paid.length,
    minConfirmed: estimatedMinStudents({
      price, tutorMin, tutorsCount, viaWompi: wompiCharges.length > 0 || paid.length === 0,
    }),
    collected,
    tutorMin,
    requiredForTutors,
  };

  // Free repaso, or tutors who don't charge: nobody is owed anything and it is
  // held with any confirmed student; Calico keeps the whole net collection.
  if (paid.length > 0 && (collected === 0 || unpaid)) {
    return {
      ...head, meetsMinimum: true, wompiFees, netCollected,
      tutorBase: 0, tutorExtra: 0, tutorPayout: 0,
      perTutor: splitRule(0, tutorIds), calicoNet: netCollected,
    };
  }

  const pool = paid.length === 0
    ? { meetsMinimum: false, base: 0, extra: 0 }
    : tutorPoolRule({ netCollected, tutorMin, tutorsCount, policy });

  if (!pool.meetsMinimum) {
    return {
      ...head, meetsMinimum: false, wompiFees: 0, netCollected,
      tutorBase: 0, tutorExtra: 0, tutorPayout: 0,
      perTutor: splitRule(0, tutorIds), calicoNet: 0,
    };
  }

  const tutorPayout = pool.base + pool.extra;
  return {
    ...head,
    meetsMinimum: true,
    wompiFees,
    netCollected,
    tutorBase:  pool.base,
    tutorExtra: pool.extra,
    tutorPayout,
    perTutor:   splitRule(tutorPayout, tutorIds),
    calicoNet:  netCollected - tutorPayout,
  };
}

/** Legacy tutorPoolRule: hourly base once the minimum headcount is met, plus a share of the extra students. */
export function hourlyBasePlusExtraShare({ hours, amounts, policy = LEGACY_EVENT_EARNINGS_POLICY }) {
  if (amounts.length > 0 && sum(amounts) === 0) return { meetsMinimum: true, base: 0, extra: 0 };
  if (amounts.length < policy.minConfirmed) return { meetsMinimum: false, base: 0, extra: 0 };
  const extra = sum(amounts.slice(policy.minConfirmed)) * policy.extraStudentTutorShare;
  return {
    meetsMinimum: true,
    base:  Math.round(policy.tutorHourlyRate * hours),
    extra: Math.round(extra),
  };
}

/** Earnings of a LEGACY repaso, in the same shape as `computeEventEarnings`. */
export function computeLegacyEventEarnings({ hours, amounts = [], wompiCharges = [], tutorIds = [] }) {
  const policy = LEGACY_EVENT_EARNINGS_POLICY;
  const paid = amounts.map(toNumber);
  const collected = Math.round(sum(paid));
  const pool = hourlyBasePlusExtraShare({ hours, amounts: paid, policy });
  const base = {
    earningsRule: EARNINGS_RULES.LEGACY,
    confirmed: paid.length,
    minConfirmed: policy.minConfirmed,
    meetsMinimum: pool.meetsMinimum,
    collected,
    tutorMin: null,
    requiredForTutors: null,
  };
  if (!pool.meetsMinimum) {
    return {
      ...base, wompiFees: 0, netCollected: collected, tutorBase: 0, tutorExtra: 0, tutorPayout: 0,
      perTutor: splitEqually(0, tutorIds), calicoNet: 0,
    };
  }
  const tutorPayout = pool.base + pool.extra;
  const wompiFees = Math.round(sum(wompiCharges.map((c) => wompiFee(toNumber(c)))));
  return {
    ...base,
    wompiFees,
    netCollected: collected - wompiFees,
    tutorBase: pool.base,
    tutorExtra: pool.extra,
    tutorPayout,
    perTutor: splitEqually(tutorPayout, tutorIds),
    calicoNet: collected - tutorPayout - wompiFees,
  };
}

/** Totals over several `computeEventEarnings` results; only repasos that met the minimum count. */
export function sumEventEarnings(list = []) {
  const totals = { events: 0, collected: 0, tutorPayout: 0, wompiFees: 0, calicoNet: 0 };
  for (const e of list) {
    if (!e.meetsMinimum) continue;
    totals.events      += 1;
    totals.collected   += e.collected;
    totals.tutorPayout += e.tutorPayout;
    totals.wompiFees   += e.wompiFees;
    totals.calicoNet   += e.calicoNet;
  }
  return totals;
}
