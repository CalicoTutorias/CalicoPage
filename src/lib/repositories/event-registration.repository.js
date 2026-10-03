/**
 * Event registrations + event payments. Concurrency model: every decision
 * that depends on "how many registrations / which state" runs inside a
 * transaction that first takes a row lock on the event (lockEvent), so
 * checkouts, fulfilments and cancellations of the same event are serialised.
 */

import prisma from '../prisma';
import { EVENT_PUBLIC_INCLUDE } from './event.repository';

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

export async function findRegistration(tx, eventId, userId) {
  return tx.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } } });
}

/** Row lock on the registration. @returns the registration (Prisma shape) or null */
export async function lockRegistration(tx, registrationId) {
  await tx.$queryRaw`SELECT id FROM event_registrations WHERE id = ${registrationId} FOR UPDATE`;
  return tx.eventRegistration.findUnique({ where: { id: registrationId } });
}

/**
 * Early-bird seats in use: confirmed early-bird registrations plus live
 * early-bird holds younger than the hold window. The caller's own row is
 * excluded (its upsert replaces it). Caller holds the event lock.
 */
export async function countEarlyBirdUsage(tx, { eventId, excludeUserId, holdMinutes }) {
  const rows = await tx.$queryRaw`
    SELECT COUNT(*)::int AS n
    FROM event_registrations
    WHERE event_id = ${eventId}
      AND early_bird = true
      AND user_id <> ${excludeUserId}
      AND (status = 'Confirmed'
           OR (status = 'PendingPayment'
               AND reserved_at > NOW() - (${holdMinutes}::int * INTERVAL '1 minute')))`;
  return rows[0]?.n ?? 0;
}

/** Same count for many events at once (public listing "N discounted spots left"). */
export async function earlyBirdUsageByEvent(eventIds, holdMinutes) {
  if (!eventIds.length) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT event_id, COUNT(*)::int AS n
    FROM event_registrations
    WHERE event_id = ANY(${eventIds})
      AND early_bird = true
      AND (status = 'Confirmed'
           OR (status = 'PendingPayment'
               AND reserved_at > NOW() - (${holdMinutes}::int * INTERVAL '1 minute')))
    GROUP BY event_id`;
  return new Map(rows.map((r) => [r.event_id, r.n]));
}

export async function findPaymentByWompiId(tx, wompiId) {
  return tx.eventPayment.findUnique({ where: { wompiId } });
}

/** The viewer's row on the public event page (with whether the survey was answered). */
export async function findViewerRegistration(eventId, userId) {
  return prisma.eventRegistration.findUnique({
    where: { eventId_userId: { eventId, userId } },
    include: { surveyResponse: { select: { id: true } } },
  });
}

/** "My events": Confirmed and Canceled rows with their event, soonest first. */
export async function findUserRegistrations(userId) {
  return prisma.eventRegistration.findMany({
    where: { userId, status: { in: ['Confirmed', 'Canceled'] } },
    orderBy: { event: { startsAt: 'asc' } },
    include: { event: { include: EVENT_PUBLIC_INCLUDE }, surveyResponse: { select: { id: true } } },
  });
}
