/**
 * Reschedule by agreement.
 *
 * The tutor or the student who booked proposes a new start for a session; the
 * other one accepts or declines. Accepting moves the session — same duration,
 * payment, Meet and Calendar event — and Google tells every attendee. The
 * rules are in src/lib/sessions/reschedule.js; the writes that race are
 * settled in session-reschedule.repository under a lock on the session row.
 *
 * What each person gets:
 *   - whoever must answer: an email, a notification and a card on their home;
 *   - whoever proposed: the answer by email and notification;
 *   - the guests of a group session (they do not vote): a notification when
 *     the session moves, plus Google's update of the calendar event.
 *
 * Calico (admin) moves a session without asking anyone, with no time limit:
 * admin-session-detail.service → rescheduleSession.
 */

import * as Sentry from '@sentry/nextjs';
import { waitUntil } from '@vercel/functions';
import * as rescheduleRepo from '../repositories/session-reschedule.repository';
import * as sessionRepo from '../repositories/session.repository';
import * as emailService from './email.service';
import * as notificationService from './notification.service';
import * as calicoCalendar from './calico-calendar.service';
import {
  RESCHEDULE_MESSAGE_MAX,
  cleanRescheduleMessage,
  isRescheduleRequestOpen,
  proposedStartBlocker,
  rescheduleRoleOf,
  rescheduleSessionBlocker,
  rescheduledEnd,
} from '../sessions/reschedule';
import { organizerIdOf } from '../sessions/group-session';

/** Codes the routes answer as-is (4xx); anything else is a 500. */
export const RESCHEDULE_ERROR_STATUS = Object.freeze({
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  GUEST_CANNOT_RESCHEDULE: 403,
  INVALID_TIME: 400,
  START_IN_PAST: 400,
  SAME_TIME: 400,
  TOO_FAR_AHEAD: 400,
  MESSAGE_TOO_LONG: 400,
  NO_COUNTERPART: 409,
  SESSION_NOT_ACTIVE: 409,
  SESSION_STARTED: 409,
  SESSION_CHANGED: 409,
  SESSION_CONFLICT: 409,
  TUTOR_ALREADY_PAID: 409,
  REQUEST_PENDING: 409,
  REQUEST_NOT_PENDING: 409,
  REQUEST_EXPIRED: 409,
  TRY_AGAIN: 409,
  REQUEST_LIMIT: 429,
});

export function isRescheduleError(err) {
  return Boolean(err?.code) && Object.prototype.hasOwnProperty.call(RESCHEDULE_ERROR_STATUS, err.code);
}

function fail(code, message = code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function keepAlive(promise) {
  waitUntil(Promise.resolve(promise).catch(() => {}));
}

function firstName(name) {
  return String(name ?? '').trim().split(/\s+/)[0] || '';
}

function sessionLink(sessionId) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/detail`;
}

/** "3 de diciembre de 2026, 4:00 p. m. – 5:30 p. m." in Bogotá time. */
function formatRange(start, end) {
  const day = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' });
  const hour = new Intl.DateTimeFormat('es-CO', { timeStyle: 'short', timeZone: 'America/Bogota' });
  return `${day.format(new Date(start))} – ${hour.format(new Date(end))}`;
}

// ─── Who is who ──────────────────────────────────────────────────────────

async function loadSession(sessionId) {
  const session = await sessionRepo.findById(sessionId);
  if (!session) throw fail('NOT_FOUND', 'Session not found');
  return session;
}

/** The user's account in the session payload (tutor or one of the students). */
function personOf(session, userId) {
  if (session.tutorId === userId) return session.tutor;
  return session.participants.find((p) => p.studentId === userId)?.student ?? null;
}

/** The session, for the tutor or the student who booked. Guests get a 403 of their own. */
async function loadAsParty(sessionId, userId) {
  const session = await loadSession(sessionId);
  const role = rescheduleRoleOf(session, userId);
  if (!role) throw fail('NOT_FOUND', 'Session not found');
  if (role === 'guest') throw fail('GUEST_CANNOT_RESCHEDULE', 'Solo quien agendó la tutoría puede cambiar su horario');
  return { session, role };
}

function shape(request, session, userId, role, now) {
  const mine = request.requestedById === userId;
  const party = role === 'tutor' || role === 'organizer';
  return {
    id: request.id,
    fromStart: request.fromStart,
    fromEnd: request.fromEnd,
    toStart: request.toStart,
    toEnd: request.toEnd,
    requestedBy: request.requestedById === session.tutorId ? 'tutor' : 'student',
    requestedByName: firstName(request.requestedBy?.name ?? personOf(session, request.requestedById)?.name) || null,
    // The note is between the two who decide; guests only see that it is pending.
    message: party ? request.message : null,
    mine,
    canRespond: request.respondentId === userId && isRescheduleRequestOpen(request, session, now),
    canWithdraw: mine,
    createdAt: request.createdAt,
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────

/**
 * The open proposal of a session (if any) and whether the user can make one.
 * Anyone in the session can read it; only the tutor and the student who
 * booked can act.
 *
 * @returns {Promise<{ request: object|null, canPropose: boolean, role: string }>}
 */
export async function getForSession({ sessionId, userId, now = new Date() }) {
  const session = await loadSession(sessionId);
  const role = rescheduleRoleOf(session, userId);
  if (!role) throw fail('NOT_FOUND', 'Session not found');

  const pending = await rescheduleRepo.findPendingBySession(sessionId);
  const open = pending && isRescheduleRequestOpen(pending, session, now) ? pending : null;
  const party = role === 'tutor' || role === 'organizer';
  const counterpartId = role === 'tutor' ? organizerIdOf(session) : session.tutorId;
  return {
    role,
    request: open ? shape(open, session, userId, role, now) : null,
    canPropose: party
      && !open
      && Boolean(counterpartId)
      && rescheduleSessionBlocker(session, now) === null,
  };
}

/** Proposals waiting for the user's answer, for sessions still to come. */
export async function listMine(userId, now = new Date()) {
  const requests = await rescheduleRepo.findPendingForRespondent(userId, now);
  return requests
    .filter((r) => isRescheduleRequestOpen(r, r.session, now))
    .map((r) => ({
      id: r.id,
      sessionId: r.session.id,
      course: r.session.course,
      requestedBy: r.requestedById === r.session.tutorId ? 'tutor' : 'student',
      requestedByName: firstName(r.requestedBy?.name) || null,
      fromStart: r.fromStart,
      toStart: r.toStart,
      toEnd: r.toEnd,
    }));
}

// ─── Writes ──────────────────────────────────────────────────────────────

/**
 * Propose moving the session to `startTimestamp` (same duration).
 * The other side gets an email and a notification.
 *
 * @returns {Promise<{ request: object, emailSent: boolean }>}
 */
export async function propose({ sessionId, userId, startTimestamp, message = null, now = new Date() }) {
  const { session, role } = await loadAsParty(sessionId, userId);

  const blocker = rescheduleSessionBlocker(session, now);
  if (blocker) throw fail(blocker);

  // Whole minutes: a time typed in a form, never a stray second.
  const start = new Date(startTimestamp);
  start.setUTCSeconds(0, 0);
  const startBlocker = proposedStartBlocker(session, start, now);
  if (startBlocker) throw fail(startBlocker);

  const note = cleanRescheduleMessage(message);
  if (note && note.length > RESCHEDULE_MESSAGE_MAX) throw fail('MESSAGE_TOO_LONG');

  const respondentId = role === 'tutor' ? organizerIdOf(session) : session.tutorId;
  if (!respondentId || respondentId === userId) throw fail('NO_COUNTERPART', 'La tutoría no tiene con quién acordar el cambio');

  const result = await rescheduleRepo.create({
    sessionId,
    tutorId: session.tutorId,
    requestedById: userId,
    respondentId,
    fromStart: session.startTimestamp,
    toStart: start,
    toEnd: rescheduledEnd(session, start),
    message: note,
    now,
  });
  if (result.refusal) throw fail(result.refusal);
  const { request } = result;

  const actorName = firstName(personOf(session, userId)?.name) || (role === 'tutor' ? 'Tu tutor' : 'Tu estudiante');
  const respondent = personOf(session, respondentId);

  // Awaited: the proposer is told whether the email went out. The proposal
  // stands either way — the notification and the home card still show it.
  let emailSent = false;
  if (respondent?.email) {
    try {
      await emailService.sendSessionRescheduleEmail(respondent.email, 'requested', {
        actorName,
        courseName: session.course?.name,
        fromTime: formatRange(request.fromStart, request.fromEnd),
        toTime: formatRange(request.toStart, request.toEnd),
        message: request.message,
        sessionLink: sessionLink(session.id),
      });
      emailSent = true;
    } catch (err) {
      console.error(`[reschedule] Email for request ${request.id} failed: ${err.message}`);
    }
  }
  await notificationService.notifyRescheduleRequested(respondentId, { session, request, actorName });

  return { request: shape({ ...request, requestedBy: null }, session, userId, role, now), emailSent };
}

/** Tell whoever proposed what the answer was (email + notification). Never throws. */
function tellProposer({ session, request, actorName, accepted }) {
  const proposer = personOf(session, request.requestedById);
  if (proposer?.email) {
    keepAlive(
      emailService
        .sendSessionRescheduleEmail(proposer.email, accepted ? 'accepted' : 'declined', {
          actorName,
          courseName: session.course?.name,
          fromTime: formatRange(request.fromStart, request.fromEnd),
          toTime: formatRange(request.toStart, request.toEnd),
          sessionLink: sessionLink(session.id),
        })
        .catch((err) => console.error(`[reschedule] Answer email for request ${request.id} failed: ${err.message}`)),
    );
  }
  keepAlive(notificationService.notifyRescheduleAnswered(request.requestedById, { session, request, actorName, accepted }));
}

async function loadOwnRequest({ sessionId, requestId, userId }) {
  const { session, role } = await loadAsParty(sessionId, userId);
  const request = await rescheduleRepo.findById(requestId);
  if (!request || request.sessionId !== session.id) throw fail('NOT_FOUND', 'Request not found');
  return { session, role, request };
}

/**
 * Accept a proposal: the session moves. The Calendar event moves after it and
 * never undoes it — its outcome is reported, and a failure is sent to Sentry
 * so the event can be fixed by hand.
 *
 * @returns {Promise<{ session: object, calendar: 'updated'|'failed'|'none' }>}
 */
export async function accept({ sessionId, requestId, userId, now = new Date() }) {
  const { session: before, request: found } = await loadOwnRequest({ sessionId, requestId, userId });
  if (found.respondentId !== userId) throw fail('FORBIDDEN', 'Esta propuesta no es para ti');

  const result = await rescheduleRepo.accept({ requestId, userId, now });
  if (result.refusal) throw fail(result.refusal);
  const { request } = result;

  let calendar = 'none';
  if (before.googleCalendarEventId) {
    try {
      await calicoCalendar.rescheduleTutoringSessionEvent(before.googleCalendarEventId, {
        startDateTime: request.toStart,
        endDateTime: request.toEnd,
      });
      calendar = 'updated';
    } catch (err) {
      calendar = 'failed';
      console.error('[reschedule] Calendar move failed', { sessionId, code: err?.code });
      Sentry.captureException(err, {
        level: 'error',
        tags: { domain: 'sessions', service: 'session-reschedule', operation: 'calendar-move' },
        extra: { sessionId, requestId, toStart: new Date(request.toStart).toISOString() },
      });
    }
  }

  const session = await sessionRepo.findById(sessionId);
  const actorName = firstName(personOf(before, userId)?.name) || 'La otra persona';
  tellProposer({ session: before, request, actorName, accepted: true });

  // Guests of a group session did not vote: tell them it moved.
  const deciders = new Set([request.requestedById, request.respondentId]);
  const guests = before.participants.map((p) => p.studentId).filter((id) => !deciders.has(id));
  if (guests.length > 0) keepAlive(notificationService.notifySessionRescheduled(guests, { session: before, request }));

  return { session, calendar };
}

/** Decline a proposal: the session stays where it is. */
export async function decline({ sessionId, requestId, userId, now = new Date() }) {
  const { session, request } = await loadOwnRequest({ sessionId, requestId, userId });
  if (request.respondentId !== userId) throw fail('FORBIDDEN', 'Esta propuesta no es para ti');

  const closed = await rescheduleRepo.close(requestId, 'Declined', { respondentId: userId }, now);
  if (!closed) throw fail('REQUEST_NOT_PENDING', 'La propuesta ya fue respondida');

  tellProposer({
    session, request, actorName: firstName(personOf(session, userId)?.name) || 'La otra persona', accepted: false,
  });
  return { success: true };
}

/** Whoever proposed takes the proposal back before it is answered. */
export async function withdraw({ sessionId, requestId, userId, now = new Date() }) {
  const { session, request } = await loadOwnRequest({ sessionId, requestId, userId });
  if (request.requestedById !== userId) throw fail('FORBIDDEN', 'Solo quien propuso el cambio puede retirarlo');

  const closed = await rescheduleRepo.close(requestId, 'Withdrawn', { requestedById: userId }, now);
  if (!closed) throw fail('REQUEST_NOT_PENDING', 'La propuesta ya fue respondida');

  keepAlive(notificationService.notifyRescheduleWithdrawn(request.respondentId, {
    session, request, actorName: firstName(personOf(session, userId)?.name) || 'La otra persona',
  }));
  return { success: true };
}
