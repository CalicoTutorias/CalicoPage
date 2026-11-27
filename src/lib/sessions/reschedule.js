/**
 * Rescheduling a session by agreement. Client-safe (no server imports): the
 * session card shows exactly what the server will accept.
 *
 *  - The tutor or the student who booked proposes a new start; the session
 *    keeps its duration, payment, Meet and Calendar event.
 *  - The other one answers: the tutor answers a student's proposal, the
 *    student who booked answers the tutor's. In a group session the guests do
 *    not vote — whoever booked speaks for the group — but they are told and
 *    can leave if the new time does not suit them.
 *  - Only for a Pending/Accepted session that has not started, and only while
 *    the tutor has not been paid for it. The new start must be in the future.
 *  - One proposal at a time per session. A proposal stops counting when the
 *    session starts, when the proposed time passes, or when the session is no
 *    longer where it was when proposed (cancelled, moved by Calico, given to
 *    another tutor): `isRescheduleRequestOpen`.
 *  - The proposed time does NOT have to be inside the tutor's published
 *    availability: the tutor agrees to it by proposing or accepting. It only
 *    cannot overlap another session of that tutor.
 *
 * Calico (admin) moves a session without asking anyone:
 * src/lib/services/admin-session-detail.service.js → rescheduleSession.
 */

import { organizerIdOf } from './group-session';

export const RESCHEDULABLE_STATUSES = Object.freeze(['Pending', 'Accepted']);

/** Characters of the optional note that travels with a proposal. */
export const RESCHEDULE_MESSAGE_MAX = 300;
/** Proposals one person can make for the same session (they send email). */
export const RESCHEDULE_MAX_PER_USER = 5;
/** How far ahead a session can be moved. */
export const RESCHEDULE_MAX_DAYS_AHEAD = 90;

const DAY_MS = 24 * 60 * 60_000;

function ms(value) {
  return value == null ? NaN : new Date(value).getTime();
}

/**
 * Who the user is in a session.
 * @returns {'tutor' | 'organizer' | 'guest' | null}
 */
export function rescheduleRoleOf(session, userId) {
  if (!session || !userId) return null;
  if (session.tutorId === userId) return 'tutor';
  const participants = session.participants || [];
  if (!participants.some((p) => p.studentId === userId)) return null;
  // Student payloads of a group session carry `organizerId` (their payments
  // are stripped for guests); everything else is resolved like the server does.
  const organizerId = session.organizerId ?? organizerIdOf(session);
  return organizerId === userId ? 'organizer' : 'guest';
}

/**
 * Why this session cannot be rescheduled by agreement right now, or null.
 * @returns {null | 'SESSION_NOT_ACTIVE' | 'SESSION_STARTED'}
 */
export function rescheduleSessionBlocker(session, now = new Date()) {
  if (!session || !RESCHEDULABLE_STATUSES.includes(session.status)) return 'SESSION_NOT_ACTIVE';
  if (!(ms(session.startTimestamp) > ms(now))) return 'SESSION_STARTED';
  return null;
}

/**
 * Why `start` cannot be proposed for this session, or null.
 * @returns {null | 'INVALID_TIME' | 'START_IN_PAST' | 'SAME_TIME' | 'TOO_FAR_AHEAD'}
 */
export function proposedStartBlocker(session, start, now = new Date()) {
  const at = ms(start);
  if (!Number.isFinite(at)) return 'INVALID_TIME';
  if (at <= ms(now)) return 'START_IN_PAST';
  if (at === ms(session.startTimestamp)) return 'SAME_TIME';
  if (at > ms(now) + RESCHEDULE_MAX_DAYS_AHEAD * DAY_MS) return 'TOO_FAR_AHEAD';
  return null;
}

/** End of a session moved to `start`: same duration as today. */
export function rescheduledEnd(session, start) {
  return new Date(ms(start) + (ms(session.endTimestamp) - ms(session.startTimestamp)));
}

/**
 * Whether a proposal can still be answered: pending, about the session as it
 * is now (same time, same tutor), and neither the session nor the proposed
 * time has arrived.
 */
export function isRescheduleRequestOpen(request, session, now = new Date()) {
  if (!request || request.status !== 'Pending') return false;
  if (rescheduleSessionBlocker(session, now)) return false;
  if (ms(request.fromStart) !== ms(session.startTimestamp)) return false;
  if (!(ms(request.toStart) > ms(now))) return false;
  const people = [request.requestedById, request.respondentId];
  return people.includes(session.tutorId);
}

/** Trim the note of a proposal; null when empty. Does NOT cut it. */
export function cleanRescheduleMessage(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}
