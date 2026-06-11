/**
 * Payouts Repository
 * Reads/writes for the tutor-payout fields on `payments`.
 *
 * "Pending payout" = payment.status='paid' AND tutor_payout_status='pending'
 * AND the underlying session is Completed (we only owe a tutor for sessions
 * that actually happened — canceled/refunded sessions should never show up).
 */

import prisma from '../prisma';

const READY_FILTER = {
  status: 'paid',
  tutorPayoutStatus: 'pending',
  session: { status: 'Completed' },
};

/**
 * Flat list of individual pending payouts. One row per payment.
 */
export async function findPendingPayments({ limit = 200, offset = 0 } = {}) {
  return prisma.payment.findMany({
    where: READY_FILTER,
    orderBy: { createdAt: 'asc' },
    take: Math.min(limit, 500),
    skip: offset,
    include: {
      tutor: {
        select: {
          id: true, name: true, email: true,
          tutorProfile: { select: { llave: true } },
        },
      },
      session: {
        select: {
          id: true,
          startTimestamp: true,
          endTimestamp: true,
          course: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });
}

/**
 * Aggregated by tutor — what the weekly digest needs.
 * Returns `[{ tutor, llave, totalGross, paymentsCount, sessionsCount, paymentIds }]`.
 *
 * `totalGross` is the sum of `payments.amount` (gross). The tutor share
 * (85% by default — see `src/lib/payments/fees.js`) is computed in the
 * service via `tutorPayout()` so the percentage lives in one place.
 */
export async function aggregatePendingByTutor() {
  const rows = await prisma.payment.findMany({
    where: READY_FILTER,
    select: {
      id: true,
      amount: true,
      tutorId: true,
      tutor: {
        select: {
          id: true, name: true, email: true,
          tutorProfile: { select: { llave: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map();
  for (const p of rows) {
    const entry = groups.get(p.tutorId) || {
      tutor: p.tutor,
      paymentIds: [],
      totalGross: 0,
      paymentsCount: 0,
    };
    entry.paymentIds.push(p.id);
    entry.totalGross += Number(p.amount);
    entry.paymentsCount += 1;
    groups.set(p.tutorId, entry);
  }
  return Array.from(groups.values());
}

/**
 * Mark one payment as paid out to the tutor. Idempotent.
 */
export async function markPayoutAsPaid(paymentId, { adminId, note }) {
  return prisma.payment.update({
    where: { id: paymentId },
    data: {
      tutorPayoutStatus: 'paid',
      tutorPayoutAt:     new Date(),
      tutorPayoutById:   adminId,
      tutorPayoutNote:   note ?? null,
    },
  });
}

/**
 * Bulk mark — used when paying a tutor's whole weekly batch in one go.
 */
export async function markPayoutsAsPaid(paymentIds, { adminId, note }) {
  if (!paymentIds.length) return { count: 0 };
  return prisma.payment.updateMany({
    where: { id: { in: paymentIds } },
    data: {
      tutorPayoutStatus: 'paid',
      tutorPayoutAt:     new Date(),
      tutorPayoutById:   adminId,
      tutorPayoutNote:   note ?? null,
    },
  });
}

/**
 * Optional: find payments already paid out, for an "history" tab.
 */
export async function findPaidOutPayments({ limit = 100, offset = 0, tutorId } = {}) {
  return prisma.payment.findMany({
    where: {
      tutorPayoutStatus: 'paid',
      ...(tutorId && { tutorId }),
    },
    orderBy: { tutorPayoutAt: 'desc' },
    take: Math.min(limit, 500),
    skip: offset,
    include: {
      tutor: { select: { id: true, name: true, email: true } },
    },
  });
}
