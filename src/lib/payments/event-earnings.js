/**
 * Earnings of a repaso (group event): what its tutors and Calico get out of it.
 *
 * Business model (Oct 2026, "Guía para el tutor" of the EDA repaso):
 *   - Below `minConfirmed` confirmed students the repaso is not held and
 *     nobody earns anything.
 *   - From the minimum on, the tutors are owed a base of
 *     `tutorHourlyRate` × the repaso's hours.
 *   - Every confirmed student beyond the minimum adds
 *     `extraStudentTutorShare` (70 %) of what they paid to the tutors; the
 *     rest stays with Calico. "Beyond the minimum" follows confirmation
 *     order, so the early-bird seats (the first ones) are inside it.
 *   - The tutors' total is split in equal parts among the event's tutors.
 *   - Calico absorbs Wompi's fee when students paid through Wompi; manual
 *     repasos (approval events, settled outside the platform) carry none.
 *   - Calico's net = collected − tutors' total − Wompi fees.
 *
 *   Example, 4 h, 5 early-bird seats at 36 000 + 3 at 40 000:
 *     collected 300 000 · tutors 240 000 · Calico 60 000; each extra student
 *     at 40 000 → +28 000 tutors, +12 000 Calico.
 *
 * The model is expected to change, so each rule is its own swappable piece:
 * the numbers live in EVENT_EARNINGS_POLICY, the tutors' total in a
 * `tutorPoolRule` and the split in a `splitRule`. Callers always go through
 * `computeEventEarnings` and never re-implement the math.
 *
 * Pure and client-safe. Amounts are integer COP; inputs may be strings or
 * Prisma Decimals.
 */

import { wompiFee } from './fees';

export const EVENT_EARNINGS_POLICY = Object.freeze({
  tutorHourlyRate:        60_000, // COP per hour of repaso
  minConfirmed:           8,      // below this the repaso is not held
  extraStudentTutorShare: 0.70,   // tutors' share of each student beyond the minimum
});

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
 * Default tutorPoolRule: a base of hourly rate × hours once the minimum is
 * met, plus the tutors' share of every confirmed student beyond it.
 * `amounts` = what each confirmed student paid, in confirmation order.
 * @returns {{ meetsMinimum: boolean, base: number, extra: number }}
 */
export function hourlyBasePlusExtraShare({ hours, amounts, policy }) {
  if (amounts.length < policy.minConfirmed) return { meetsMinimum: false, base: 0, extra: 0 };
  const extra = sum(amounts.slice(policy.minConfirmed)) * policy.extraStudentTutorShare;
  return {
    meetsMinimum: true,
    base:  Math.round(policy.tutorHourlyRate * hours),
    extra: Math.round(extra),
  };
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
 * @param {number}   input.hours          repaso length (see `eventHours`)
 * @param {Array}    input.amounts        what each CONFIRMED student paid, in confirmation order
 * @param {Array}    [input.wompiCharges] every Wompi charge of the event (the fee is kept on
 *                                        refunds too); empty for manual repasos
 * @param {string[]} [input.tutorIds]     the event's tutors, in display order
 * @param {object}   [rules]              override any piece of the model
 * @returns {{
 *   confirmed: number, minConfirmed: number, meetsMinimum: boolean,
 *   collected: number, tutorBase: number, tutorExtra: number, tutorPayout: number,
 *   perTutor: Array<{ tutorId: string, amount: number }>,
 *   wompiFees: number, calicoNet: number,
 * }} A repaso below the minimum reports what was collected but earns 0 for everyone.
 */
export function computeEventEarnings(
  { hours, amounts = [], wompiCharges = [], tutorIds = [] },
  {
    policy = EVENT_EARNINGS_POLICY,
    tutorPoolRule = hourlyBasePlusExtraShare,
    splitRule = splitEqually,
  } = {},
) {
  const paid = amounts.map(toNumber);
  const collected = Math.round(sum(paid));
  const pool = tutorPoolRule({ hours, amounts: paid, policy });
  const head = { confirmed: paid.length, minConfirmed: policy.minConfirmed, meetsMinimum: pool.meetsMinimum, collected };

  if (!pool.meetsMinimum) {
    return {
      ...head, tutorBase: 0, tutorExtra: 0, tutorPayout: 0,
      perTutor: splitRule(0, tutorIds), wompiFees: 0, calicoNet: 0,
    };
  }

  const tutorPayout = pool.base + pool.extra;
  const wompiFees = Math.round(sum(wompiCharges.map((c) => wompiFee(toNumber(c)))));
  return {
    ...head,
    tutorBase:  pool.base,
    tutorExtra: pool.extra,
    tutorPayout,
    perTutor:   splitRule(tutorPayout, tutorIds),
    wompiFees,
    calicoNet:  collected - tutorPayout - wompiFees,
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
