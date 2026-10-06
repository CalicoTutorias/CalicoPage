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
 * excluded (its upsert replaces it). Checkout callers hold the event lock;
 * the public event page reads it lock-free, only to show the viewer's quote.
 * reserved_at is a `timestamp` holding UTC wall time, so it is compared with
 * NOW() AT TIME ZONE 'UTC', never with NOW(): that would depend on the
 * session TimeZone.
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
               AND reserved_at > (NOW() AT TIME ZONE 'UTC') - (${holdMinutes}::int * INTERVAL '1 minute')))`;
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
               AND reserved_at > (NOW() AT TIME ZONE 'UTC') - (${holdMinutes}::int * INTERVAL '1 minute')))
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

// ─── Admin reads and operations ──────────────────────────────────────────

const REFUND_REGISTRATION_SELECT = {
  refundMethod: true,
  refundMethodDetails: true,
  user: { select: { name: true, email: true } },
};

/** Every registration of an event with the registrant, career and survey answer. */
export async function findRegistrationsAdmin(eventId) {
  return prisma.eventRegistration.findMany({
    where: { eventId },
    orderBy: { createdAt: 'asc' },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          phoneNumber: true,
          marketingOptInAt: true,
          career: { select: { name: true } },
        },
      },
      surveyResponse: { select: { attended: true } },
    },
  });
}

/** Every payment of an event with its registration and registrant. */
export async function findPaymentsAdmin(eventId) {
  return prisma.eventPayment.findMany({
    where: { registration: { eventId } },
    orderBy: { createdAt: 'desc' },
    include: { registration: { select: REFUND_REGISTRATION_SELECT } },
  });
}

/** A payment scoped to its event (null when it belongs to another event). */
export async function findEventPayment(eventId, paymentId) {
  return prisma.eventPayment.findFirst({
    where: { id: paymentId, registration: { eventId } },
    include: { registration: { select: REFUND_REGISTRATION_SELECT } },
  });
}

/** Pending to Refunded, atomically. @returns the number of rows changed (0 or 1) */
export async function markPaymentRefunded(paymentId, { refundedById, now }) {
  const { count } = await prisma.eventPayment.updateMany({
    where: { id: paymentId, refundStatus: 'Pending' },
    data: { refundStatus: 'Refunded', refundedAt: now, refundedById },
  });
  return count;
}

/** Confirmed / responded / attended counts and the event rating average. */
export async function surveyAggregates(eventId) {
  const [confirmedCount, responseCount, attendedCount, rating] = await Promise.all([
    prisma.eventRegistration.count({ where: { eventId, status: 'Confirmed' } }),
    prisma.eventSurveyResponse.count({ where: { registration: { eventId } } }),
    prisma.eventSurveyResponse.count({ where: { registration: { eventId }, attended: true } }),
    prisma.eventSurveyResponse.aggregate({
      where: { registration: { eventId }, eventRating: { not: null } },
      _avg: { eventRating: true },
    }),
  ]);
  return { confirmedCount, responseCount, attendedCount, eventAverage: rating._avg.eventRating };
}
