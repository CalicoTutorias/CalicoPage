/**
 * Session Reschedule Repository
 * Proposals to move a session to another time (PostgreSQL via Prisma).
 *
 * Model: SessionRescheduleRequest. Business rules live in
 * src/lib/services/session-reschedule.service.js and
 * src/lib/sessions/reschedule.js; this file guarantees that the writes that
 * race are decided in one transaction with the session row locked:
 *   - two proposals for the same session at once → one;
 *   - a proposal accepted twice, or accepted while it is withdrawn → once;
 *   - a proposal accepted while the session is cancelled or moved → refused.
 * Accepting also runs Serializable, like booking a session
 * (session.repository → createSessionWithParticipant): a booking that lands
 * on the proposed time at the same instant makes one of the two fail instead
 * of leaving the tutor with two sessions at once.
 */

import prisma from '../prisma';
import { RESCHEDULABLE_STATUSES, RESCHEDULE_MAX_PER_USER } from '../sessions/reschedule';

const USER_NAME = { select: { id: true, name: true } };

// What a proposal shows of its session: enough for a home card and an email.
const REQUEST_WITH_SESSION = {
  requestedBy: USER_NAME,
  session: {
    select: {
      id: true,
      status: true,
      sessionType: true,
      tutorId: true,
      startTimestamp: true,
      endTimestamp: true,
      course: { select: { id: true, name: true, code: true } },
      tutor: USER_NAME,
    },
  },
};

/** Lock the session row for the rest of the transaction. */
async function lockSession(tx, sessionId) {
  const rows = await tx.$queryRaw`
    SELECT id, status::text AS status, tutor_id AS "tutorId",
           start_timestamp AS "startTimestamp", end_timestamp AS "endTimestamp"
    FROM sessions WHERE id = ${sessionId} FOR UPDATE`;
  return rows[0] ?? null;
}

function sameInstant(a, b) {
  return new Date(a).getTime() === new Date(b).getTime();
}

/** Why the locked session cannot be rescheduled by agreement, or null. */
function sessionRefusal(session, now) {
  if (!session) return 'NOT_FOUND';
  if (!RESCHEDULABLE_STATUSES.includes(session.status)) return 'SESSION_NOT_ACTIVE';
  if (new Date(session.startTimestamp).getTime() <= now.getTime()) return 'SESSION_STARTED';
  return null;
}

/** Whether a pending proposal is still about the session as it is now. */
function stillStands(request, session, now) {
  return sameInstant(request.fromStart, session.startTimestamp)
    && new Date(request.toStart).getTime() > now.getTime()
    && [request.requestedById, request.respondentId].includes(session.tutorId);
}

async function tutorWasPaid(tx, sessionId) {
  const paidOut = await tx.payment.count({ where: { sessionId, tutorPayoutStatus: { not: 'pending' } } });
  return paidOut > 0;
}

/** Another live session of the tutor that overlaps [start, end). */
async function tutorIsBusy(tx, { tutorId, sessionId, start, end }) {
  const overlapping = await tx.session.count({
    where: {
      id: { not: sessionId },
      tutorId,
      status: { notIn: ['Rejected', 'Canceled'] },
      startTimestamp: { lt: end },
      endTimestamp: { gt: start },
    },
  });
  return overlapping > 0;
}

/**
 * A transaction Postgres aborted because it raced with another one (40001
 * serialization failure, 40P01 deadlock): nothing was written, retry it.
 * Prisma reports it as P2034, but with the pg driver adapter it can also
 * surface raw, as a DriverAdapterError named after its kind.
 */
function isSerializationFailure(err) {
  if (!err) return false;
  if (err.code === 'P2034' || err.cause?.kind === 'TransactionWriteConflict') return true;
  if (['40001', '40P01'].includes(err.cause?.originalCode ?? err.code)) return true;
  return /TransactionWriteConflict|write conflict|could not serialize|deadlock detected/i.test(String(err.message ?? ''));
}

// ===== READS =====

export function findById(id) {
  return prisma.sessionRescheduleRequest.findUnique({ where: { id } });
}

/** The pending proposal of a session (the newest, should two ever exist). */
export function findPendingBySession(sessionId) {
  return prisma.sessionRescheduleRequest.findFirst({
    where: { sessionId, status: 'Pending' },
    orderBy: { createdAt: 'desc' },
    include: { requestedBy: USER_NAME },
  });
}

/**
 * Pending proposals waiting for `userId`'s answer, for sessions still to come
 * and proposed times still to come. The caller drops the ones whose session
 * moved since (a column-to-column comparison Prisma cannot express).
 */
export function findPendingForRespondent(userId, now = new Date()) {
  return prisma.sessionRescheduleRequest.findMany({
    where: {
      respondentId: userId,
      status: 'Pending',
      toStart: { gt: now },
      session: { status: { in: [...RESCHEDULABLE_STATUSES] }, startTimestamp: { gt: now } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: REQUEST_WITH_SESSION,
  });
}

// ===== WRITES =====

/**
 * Write a proposal, atomically.
 *
 * Under the session lock: the session must still be active, not started, at
 * `fromStart` and taught by `tutorId` (what the caller validated against);
 * pending proposals that no longer stand are closed as Expired; one that
 * still stands blocks a new one.
 *
 * @returns {Promise<{ request: object } | { refusal: string }>} refusal:
 *   NOT_FOUND | SESSION_NOT_ACTIVE | SESSION_STARTED | SESSION_CHANGED |
 *   TUTOR_ALREADY_PAID | REQUEST_PENDING | REQUEST_LIMIT | SESSION_CONFLICT
 */
export async function create({
  sessionId, tutorId, requestedById, respondentId, fromStart, toStart, toEnd, message = null, now = new Date(),
}) {
  return prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    const refusal = sessionRefusal(session, now);
    if (refusal) return { refusal };
    if (session.tutorId !== tutorId || !sameInstant(session.startTimestamp, fromStart)) return { refusal: 'SESSION_CHANGED' };
    if (await tutorWasPaid(tx, sessionId)) return { refusal: 'TUTOR_ALREADY_PAID' };

    const pending = await tx.sessionRescheduleRequest.findMany({ where: { sessionId, status: 'Pending' } });
    const stale = pending.filter((r) => !stillStands(r, session, now));
    if (stale.length > 0) {
      await tx.sessionRescheduleRequest.updateMany({
        where: { id: { in: stale.map((r) => r.id) }, status: 'Pending' },
        data: { status: 'Expired', respondedAt: now },
      });
    }
    if (pending.length > stale.length) return { refusal: 'REQUEST_PENDING' };

    const made = await tx.sessionRescheduleRequest.count({ where: { sessionId, requestedById } });
    if (made >= RESCHEDULE_MAX_PER_USER) return { refusal: 'REQUEST_LIMIT' };

    if (await tutorIsBusy(tx, { tutorId, sessionId, start: toStart, end: toEnd })) return { refusal: 'SESSION_CONFLICT' };

    const request = await tx.sessionRescheduleRequest.create({
      data: {
        sessionId,
        requestedById,
        respondentId,
        fromStart: session.startTimestamp,
        fromEnd: session.endTimestamp,
        toStart,
        toEnd,
        message,
      },
    });
    return { request };
  });
}

async function acceptOnce({ requestId, userId, now }) {
  return prisma.$transaction(
    async (tx) => {
      const found = await tx.sessionRescheduleRequest.findUnique({ where: { id: requestId }, select: { sessionId: true } });
      if (!found) return { refusal: 'NOT_FOUND' };

      const session = await lockSession(tx, found.sessionId);
      // Re-read under the lock: a concurrent accept/withdraw has already committed.
      const request = await tx.sessionRescheduleRequest.findUnique({ where: { id: requestId } });
      if (!request || request.respondentId !== userId) return { refusal: 'NOT_FOUND' };
      if (request.status !== 'Pending') return { refusal: 'REQUEST_NOT_PENDING' };

      // A proposal that can never be accepted any more is closed on the way out.
      const expire = async (refusal) => {
        await tx.sessionRescheduleRequest.update({ where: { id: requestId }, data: { status: 'Expired', respondedAt: now } });
        return { refusal, expired: true };
      };
      const refusal = sessionRefusal(session, now);
      if (refusal) return expire(refusal);
      if (!stillStands(request, session, now)) {
        return expire(new Date(request.toStart).getTime() <= now.getTime() ? 'REQUEST_EXPIRED' : 'SESSION_CHANGED');
      }
      if (await tutorWasPaid(tx, session.id)) return expire('TUTOR_ALREADY_PAID');

      // The slot may free up again (the other session is cancelled): the
      // proposal stays pending and the answer is just "not now".
      if (await tutorIsBusy(tx, { tutorId: session.tutorId, sessionId: session.id, start: request.toStart, end: request.toEnd })) {
        return { refusal: 'SESSION_CONFLICT' };
      }

      await tx.session.update({
        where: { id: session.id },
        data: { startTimestamp: request.toStart, endTimestamp: request.toEnd },
      });
      const accepted = await tx.sessionRescheduleRequest.update({
        where: { id: requestId },
        data: { status: 'Accepted', respondedAt: now },
      });
      return { request: accepted };
    },
    { isolationLevel: 'Serializable', timeout: 15000 },
  );
}

/**
 * Accept a proposal: the session moves to the proposed time.
 *
 * @returns {Promise<{ request: object } | { refusal: string, expired?: boolean }>}
 *   refusal: NOT_FOUND | REQUEST_NOT_PENDING | SESSION_NOT_ACTIVE |
 *   SESSION_STARTED | REQUEST_EXPIRED | SESSION_CHANGED | TUTOR_ALREADY_PAID |
 *   SESSION_CONFLICT | TRY_AGAIN (lost a race twice; nothing was changed)
 */
export async function accept({ requestId, userId, now = new Date() }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await acceptOnce({ requestId, userId, now });
    } catch (err) {
      if (!isSerializationFailure(err)) throw err;
    }
  }
  return { refusal: 'TRY_AGAIN' };
}

/**
 * Pending → Declined (by the respondent) or Withdrawn (by whoever proposed).
 * `where` pins who may do it; false when it was no longer pending.
 */
export async function close(id, status, { requestedById, respondentId } = {}, now = new Date()) {
  const { count } = await prisma.sessionRescheduleRequest.updateMany({
    where: {
      id,
      status: 'Pending',
      ...(requestedById ? { requestedById } : {}),
      ...(respondentId ? { respondentId } : {}),
    },
    data: { status, respondedAt: now },
  });
  return count > 0;
}
