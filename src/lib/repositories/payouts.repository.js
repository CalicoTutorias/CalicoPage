/**
 * Payouts Repository
 * Reads/writes for the tutor-payout fields on `payments`.
 *
 * "Pending payout" = the student paid (payment.status='paid'), the tutor has not
 * been paid yet (tutor_payout_status='pending') and the session already happened
 * (see payableSessionWhere): canceled sessions never show up, nor do ones still
 * to come.
 */

import prisma from '../prisma';
import { paymentTypeOf } from '../payments/payment-type';
import { COUNTED_SESSION_WHERE } from './metrics-exclusions';

/**
 * A session the tutor is owed for. Going by its end time and not only by the
 * `Completed` status, because no screen marks a tutoring session as Completed:
 * with that rule alone a paid session would never reach this list. Test courses
 * stay out, as in every money view. admin-users.repository applies this same
 * rule in raw SQL (earned_gross_pending).
 */
export function payableSessionWhere(now = new Date()) {
  return {
    ...COUNTED_SESSION_WHERE,
    OR: [
      { status: 'Completed' },
      { status: 'Accepted', endTimestamp: { lt: now } },
    ],
  };
}

function readyFilter(now) {
  return { status: 'paid', tutorPayoutStatus: 'pending', session: payableSessionWhere(now) };
}

const PAID_OUT_FILTER = { status: 'paid', tutorPayoutStatus: 'paid', session: COUNTED_SESSION_WHERE };

const TYPE_FILTERS = {
  wompi: { wompiId: { not: null } },
  manual: { session: { source: 'ManualAdmin' } },
};

const ORDER_BY_PAYOUT = {
  pending: { session: { startTimestamp: 'asc' } }, // the oldest tutoring session first
  paid: { tutorPayoutAt: 'desc' },
  all: { session: { startTimestamp: 'desc' } },
};

/**
 * One page of payments for the detail view, with who was paid and how the
 * student paid. Explicit select: the proof key and the admin ledger stay out.
 *
 * @param {object} [opts]
 * @param {'pending'|'paid'|'all'} [opts.payout] whether the tutor was already paid
 * @param {'all'|'wompi'|'manual'} [opts.type] how the student paid
 * @returns {Promise<{ items: object[], total: number }>}
 */
export async function findPayments({ payout = 'pending', type = 'all', limit = 25, offset = 0, now = new Date() } = {}) {
  const byPayout = {
    pending: readyFilter(now),
    paid: PAID_OUT_FILTER,
    all: { OR: [readyFilter(now), PAID_OUT_FILTER] },
  }[payout];
  const where = TYPE_FILTERS[type] ? { AND: [byPayout, TYPE_FILTERS[type]] } : byPayout;

  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [ORDER_BY_PAYOUT[payout], { id: 'asc' }],
      take: Math.min(limit, 100),
      skip: offset,
      select: {
        id: true,
        amount: true,
        originalAmount: true,
        discountAmount: true,
        tutorPayoutBase: true,
        wompiId: true,
        createdAt: true,
        tutorPayoutStatus: true,
        tutorPayoutAt: true,
        tutorPayoutNote: true,
        tutor: {
          select: {
            id: true, name: true, email: true,
            tutorProfile: { select: { llave: true } },
          },
        },
        session: {
          select: {
            id: true,
            status: true,
            source: true,
            startTimestamp: true,
            endTimestamp: true,
            course: { select: { id: true, code: true, name: true } },
          },
        },
      },
    }),
    prisma.payment.count({ where }),
  ]);
  return { items, total };
}

/**
 * Aggregated by tutor — what the weekly digest needs.
 * Returns `[{ tutor, totalGross, totalListGross, totalDiscount, totalTutorBase,
 *             wompiGross, wompiCount, typeCounts, sessions, paymentsCount, paymentIds }]`.
 *
 * `totalGross` sums `payments.amount` (charged); `totalTutorBase` sums
 * `tutor_payout_base`, which is what the tutor share (85% by default — see
 * `src/lib/payments/fees.js`) is computed on in the service via
 * `tutorPayout()`, so the percentage lives in one place. `wompiGross` /
 * `wompiCount` cover only real Wompi charges: nothing else pays the gateway fee.
 * `sessions` lists what is being paid for, oldest tutoring session first.
 */
export async function aggregatePendingByTutor({ now = new Date() } = {}) {
  const rows = await prisma.payment.findMany({
    where: readyFilter(now),
    select: {
      id: true,
      amount: true,
      originalAmount: true,
      discountAmount: true,
      tutorPayoutBase: true,
      tutorId: true,
      wompiId: true,
      session: {
        select: {
          source: true,
          startTimestamp: true,
          course: { select: { code: true, name: true } },
        },
      },
      tutor: {
        select: {
          id: true, name: true, email: true,
          tutorProfile: { select: { llave: true } },
        },
      },
    },
    orderBy: [{ session: { startTimestamp: 'asc' } }, { id: 'asc' }],
  });

  const groups = new Map();
  for (const p of rows) {
    const entry = groups.get(p.tutorId) || {
      tutor: p.tutor,
      paymentIds: [],
      totalGross: 0,
      totalListGross: 0,
      totalDiscount: 0,
      totalTutorBase: 0,
      wompiGross: 0,
      wompiCount: 0,
      typeCounts: { wompi: 0, manual: 0, courtesy: 0 },
      sessions: [],
      paymentsCount: 0,
    };
    entry.paymentIds.push(p.id);
    entry.sessions.push({
      paymentId: p.id,
      startTimestamp: p.session.startTimestamp,
      course: p.session.course,
    });
    entry.totalGross     += Number(p.amount);
    entry.totalListGross += Number(p.originalAmount ?? p.amount);
    entry.totalDiscount  += Number(p.discountAmount ?? 0);
    entry.totalTutorBase += Number(p.tutorPayoutBase ?? p.amount);
    if (p.wompiId && Number(p.amount) > 0) {
      entry.wompiGross += Number(p.amount);
      entry.wompiCount += 1;
    }
    entry.typeCounts[paymentTypeOf(p)] += 1;
    entry.paymentsCount += 1;
    groups.set(p.tutorId, entry);
  }
  return Array.from(groups.values());
}

/**
 * Mark one payment as paid out to the tutor. Idempotent: repeating it changes
 * nothing and returns the row as it stands.
 *
 * @returns {Promise<object|null>} the payment; null if it does not exist
 */
export async function markPayoutAsPaid(paymentId, { adminId, note }) {
  await markPayoutsAsPaid([paymentId], { adminId, note });
  return prisma.payment.findUnique({ where: { id: paymentId } });
}

/**
 * Bulk mark — used when paying a tutor's whole weekly batch in one go.
 *
 * Only moves payments the student paid and the tutor has not been paid for: a
 * stale tab cannot rewrite the date of an earlier transfer, and a manual session
 * still awaiting its proof cannot be marked. Each row moves on a conditional
 * update, so two concurrent requests cannot both count it.
 *
 * @returns {Promise<{ count: number }>} how many actually moved
 */
export async function markPayoutsAsPaid(paymentIds, { adminId, note }) {
  if (!paymentIds.length) return { count: 0 };

  const movedByTutor = new Map();
  const count = await prisma.$transaction(async (tx) => {
    const candidates = await tx.payment.findMany({
      where: { id: { in: paymentIds } },
      select: { id: true, tutorId: true, amount: true, tutorPayoutBase: true },
    });

    const now = new Date();
    let moved = 0;
    for (const payment of candidates) {
      const result = await tx.payment.updateMany({
        where: { id: payment.id, status: 'paid', tutorPayoutStatus: 'pending' },
        data: {
          tutorPayoutStatus: 'paid',
          tutorPayoutAt:     now,
          tutorPayoutById:   adminId,
          tutorPayoutNote:   note ?? null,
        },
      });
      if (result.count === 0) continue;
      moved += 1;
      const base = Number(payment.tutorPayoutBase ?? payment.amount);
      movedByTutor.set(payment.tutorId, (movedByTutor.get(payment.tutorId) ?? 0) + base);
    }
    return moved;
  }, { timeout: 15_000 });

  await discountPendingBalances(movedByTutor);
  return { count };
}

/**
 * Take what was transferred off each tutor's `next_payment`. Best effort and
 * outside the transaction: this counter is a cached figure no screen shows (the
 * amounts come from the payment rows), so it must never undo a transfer already
 * recorded. Never below zero: it may have missed a credit on an older payment.
 */
async function discountPendingBalances(movedByTutor) {
  for (const [tutorId, amount] of movedByTutor) {
    try {
      await prisma.$executeRaw`
        UPDATE tutor_profiles
        SET next_payment = GREATEST(next_payment - ${amount}::numeric, 0)
        WHERE user_id = ${tutorId};
      `;
    } catch (err) {
      console.error(`[payouts] Failed to update next_payment of tutor ${tutorId}: ${err.message}`);
    }
  }
}
