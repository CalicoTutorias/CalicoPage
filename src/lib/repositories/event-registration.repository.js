/**
 * Event registrations + event payments. Concurrency model: every decision
 * that depends on "how many registrations / which state" runs inside a
 * transaction that first takes a row lock on the event (lockEvent), so
 * checkouts, fulfilments and cancellations of the same event are serialised.
 */

import prisma from '../prisma';

/** Row lock on the event. @returns the locked row (snake_case columns) or null */
export async function lockEvent(tx, eventId) {
  const rows = await tx.$queryRaw`
    SELECT id, status::text AS status, starts_at, ends_at, price, early_bird_slots, early_bird_percent
    FROM events WHERE id = ${eventId} FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * Cancel every live registration of an event and queue refunds for every
 * payment not yet in the refund flow. Caller holds the event lock.
 */
export async function cancelAllForEvent(tx, eventId, now) {
  const confirmed = await tx.eventRegistration.findMany({
    where: { eventId, status: 'Confirmed' },
    select: { id: true, userId: true, finalAmount: true },
  });
  await tx.eventRegistration.updateMany({
    where: { eventId, status: { in: ['Confirmed', 'PendingPayment'] } },
    data: { status: 'Canceled', canceledAt: now, canceledBy: 'admin' },
  });
  await tx.eventPayment.updateMany({
    where: { registration: { eventId }, refundStatus: 'None' },
    data: { refundStatus: 'Pending' },
  });
  return { confirmed };
}
