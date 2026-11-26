/**
 * Admin "Tutorías" → detail of one session and tutor reassignment.
 *
 * Detail: who is in it (with contact), what the student asked for and the files
 * they uploaded (session_attachments, with short-lived download links). The
 * tutor's study material has its own endpoints (/api/sessions/[id]/materials),
 * which already let an admin list, download and upload.
 *
 * Reassignment: when the tutor cannot give a session, an admin hands it to
 * another tutor who offers the course. The session keeps its id, payment,
 * files and Google Calendar event (so the Meet link does not change); only the
 * tutor moves, on the session and on its payments, so the 85 % is paid to
 * whoever gives it. Afterwards the calendar invite moves to the new tutor and
 * everyone is told. Allowed only while nothing tied to the old tutor exists
 * yet: no payout made, no reviews, no hours package (bound to one tutor).
 *
 * Cancellation: an admin cancels a Pending/Accepted session on anyone's behalf,
 * with no 6-hour limit (it can even be one that already ended without being
 * given). Blocked once the tutor was paid for it. The Calendar event is
 * deleted, tutor and students get the cancellation email and notification,
 * and a paid session lands in Finanzas → Devoluciones; the student picks the
 * refund method from their history like after a tutor cancellation.
 *
 * Reschedule: an admin moves a Pending/Accepted session to another start time
 * (same duration) when tutor and student agree on a new one, including one
 * whose original time already passed without being given. Same session,
 * payment and Calendar event; the event moves and Google tells everyone. A
 * session that ends up back to back with another one of the same tutor and
 * student can take that one's Meet, so a block of hours has one link.
 *
 * Errors carry a business code; the HTTP map is in the routes' _shared.js.
 */

import * as s3 from '../s3';
import * as sessionRepo from '../repositories/session.repository';
import * as academicRepo from '../repositories/academic.repository';
import * as calicoCalendar from './calico-calendar.service';
import * as emailService from './email.service';
import * as notificationService from './notification.service';
import * as auditService from './admin-audit.service';
import { sessionConfirmedEmailParams } from './session.service';

const { ADMIN_ACTIONS } = auditService;

const ATTACHMENT_URL_EXPIRY = 900; // 15 min: the panel stays open while the admin reads
const REASSIGNABLE_STATUSES = new Set(['Pending', 'Accepted']);
const CANCELABLE_STATUSES = REASSIGNABLE_STATUSES;
const RESCHEDULABLE_STATUSES = REASSIGNABLE_STATUSES;

function detailError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

/**
 * Why this session cannot change tutor now, or null when it can.
 * @returns {null | 'SESSION_NOT_REASSIGNABLE' | 'SESSION_ENDED' | 'TUTOR_ALREADY_PAID' | 'PACKAGE_SESSION' | 'SESSION_HAS_REVIEWS'}
 */
export function reassignBlocker(session, now = new Date()) {
  if (!REASSIGNABLE_STATUSES.has(session.status)) return 'SESSION_NOT_REASSIGNABLE';
  if (new Date(session.endTimestamp).getTime() <= now.getTime()) return 'SESSION_ENDED';
  if (session.payments.some((p) => p.tutorPayoutStatus !== 'pending')) return 'TUTOR_ALREADY_PAID';
  if (session.payments.some((p) => p.packageId)) return 'PACKAGE_SESSION';
  if (session._count.reviews > 0 || session._count.studentReviews > 0) return 'SESSION_HAS_REVIEWS';
  return null;
}

/**
 * Why an admin cannot cancel this session, or null when they can.
 * @returns {null | 'SESSION_NOT_CANCELABLE' | 'TUTOR_ALREADY_PAID'}
 */
export function cancelBlocker(session) {
  if (!CANCELABLE_STATUSES.has(session.status)) return 'SESSION_NOT_CANCELABLE';
  if (session.payments.some((p) => p.tutorPayoutStatus !== 'pending')) return 'TUTOR_ALREADY_PAID';
  return null;
}

/**
 * Why an admin cannot reschedule this session, or null when they can. No time
 * limit: a session whose slot passed without being given can still be moved.
 * @returns {null | 'SESSION_NOT_RESCHEDULABLE' | 'TUTOR_ALREADY_PAID'}
 */
export function rescheduleBlocker(session) {
  if (!RESCHEDULABLE_STATUSES.has(session.status)) return 'SESSION_NOT_RESCHEDULABLE';
  if (session.payments.some((p) => p.tutorPayoutStatus !== 'pending')) return 'TUTOR_ALREADY_PAID';
  return null;
}

/** 'tutor' | 'student' | 'other' (an admin, a job…) | null when unknown. */
function cancelledByRole(session) {
  if (!session.cancelledBy) return null;
  if (session.cancelledBy === session.tutorId) return 'tutor';
  if (session.participants.some((p) => p.student?.id === session.cancelledBy)) return 'student';
  return 'other';
}

async function loadSession(sessionId) {
  const session = await sessionRepo.findAdminDetailById(sessionId);
  if (!session) throw detailError('SESSION_NOT_FOUND');
  return session;
}

const students = (session) => session.participants.map((p) => p.student);

async function serializeDetail(session, now) {
  const attachments = await Promise.all(
    session.attachments.map(async (a) => ({
      id:         a.id,
      fileName:   a.fileName,
      fileSize:   a.fileSize,
      mimeType:   a.mimeType,
      uploadedAt: a.uploadedAt,
      downloadUrl: await s3.generateDownloadUrl(a.s3Key, ATTACHMENT_URL_EXPIRY),
    })),
  );
  const blocker = reassignBlocker(session, now);
  const cancelBlock = cancelBlocker(session);
  const rescheduleBlock = rescheduleBlocker(session);
  return {
    id:             session.id,
    status:         session.status,
    source:         session.source,
    sessionType:    session.sessionType,
    locationType:   session.locationType,
    startTimestamp: session.startTimestamp,
    endTimestamp:   session.endTimestamp,
    createdAt:      session.createdAt,
    course:         session.course,
    tutor:          session.tutor,
    students:       students(session),
    topicsToReview: session.topicsToReview || null,
    notes:          session.notes || null,
    meetLink:       session.googleMeetLink || null,
    hasCalendarEvent: Boolean(session.googleCalendarEventId),
    attachments,
    payments: session.payments.map((p) => ({
      id:                p.id,
      status:            p.status,
      amount:            Number(p.amount),
      viaWompi:          Boolean(p.wompiId),
      tutorPayoutStatus: p.tutorPayoutStatus,
    })),
    cancellation: session.status === 'Canceled'
      ? { at: session.cancelledAt, reason: session.cancellationReason || null, by: cancelledByRole(session) }
      : null,
    reassign: { allowed: blocker === null, blocker },
    cancel: { allowed: cancelBlock === null, blocker: cancelBlock },
    reschedule: { allowed: rescheduleBlock === null, blocker: rescheduleBlock },
  };
}

/** Everything the admin detail panel shows for one session. */
export async function getSessionDetail(sessionId, now = new Date()) {
  return serializeDetail(await loadSession(sessionId), now);
}

/**
 * Tutors who could take this session: offering its course today, other than
 * the current tutor and the students, each flagged `busy` when they already
 * have an active session overlapping it.
 * @returns {Promise<Array<{ id, name, email, busy }>>}
 */
export async function listReassignCandidates(sessionId) {
  const session = await loadSession(sessionId);
  const excluded = new Set([session.tutorId, ...students(session).map((u) => u.id)]);
  const tutors = (await academicRepo.findOfferingTutorsForCourse(session.courseId))
    .filter((t) => !excluded.has(t.id));
  return Promise.all(tutors.map(async (t) => ({
    ...t,
    busy: (await overlappingSessions(t.id, session)).length > 0,
  })));
}

async function overlappingSessions(tutorId, session, range = session) {
  const rows = await sessionRepo.findByTutorInRange(
    tutorId,
    new Date(range.startTimestamp),
    new Date(range.endTimestamp),
  );
  return rows.filter((s) => s.id !== session.id);
}

function calendarDescription(session, tutor) {
  const courseName = session.course?.name || 'Tutoría';
  return `Sesión de tutoría agendada a través de Calico.\n\nMateria: ${courseName}\nTutor: ${tutor.name || tutor.email}\n\nID de sesión: ${session.id}`;
}

/**
 * Hands the session to `newTutorId`. The data change is atomic and audited;
 * calendar, emails and notifications run after it and never undo it — their
 * outcome is reported so the admin knows what to fix by hand.
 * @returns {Promise<{ session: object, calendar: 'updated'|'failed'|'none', emailsSent: number, emailsFailed: number }>}
 */
export async function reassignTutor({ sessionId, newTutorId, reason = null, adminId, request = null, now = new Date() }) {
  const session = await loadSession(sessionId);
  const blocker = reassignBlocker(session, now);
  if (blocker) throw detailError(blocker);
  if (newTutorId === session.tutorId) throw detailError('SAME_TUTOR');
  if (students(session).some((u) => u.id === newTutorId)) throw detailError('SELF_BOOKING');

  const newTutor = (await academicRepo.findOfferingTutorsForCourse(session.courseId))
    .find((t) => t.id === newTutorId);
  if (!newTutor) throw detailError('TUTOR_NOT_OFFERING');
  if ((await overlappingSessions(newTutorId, session)).length > 0) throw detailError('SESSION_CONFLICT');

  const moved = await sessionRepo.reassignTutor({
    sessionId, fromTutorId: session.tutorId, toTutorId: newTutorId,
  });
  if (!moved) throw detailError('SESSION_CHANGED');

  const oldTutor = session.tutor;
  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.SESSION_REASSIGN_TUTOR,
    targetType: 'Session',
    targetId: session.id,
    payload: {
      fromTutor: { id: oldTutor.id, name: oldTutor.name },
      toTutor: { id: newTutor.id, name: newTutor.name },
      paymentIds: session.payments.map((p) => p.id),
      reason: reason || null,
    },
    request,
  });

  // ── Side effects: report, never throw ──
  let calendar = 'none';
  if (session.googleCalendarEventId) {
    try {
      await calicoCalendar.replaceTutoringSessionTutor(session.googleCalendarEventId, {
        fromEmail: oldTutor.email,
        toEmail: newTutor.email,
        toName: newTutor.name,
        description: calendarDescription(session, newTutor),
      });
      calendar = 'updated';
    } catch (err) {
      console.error('[admin-session-detail] Calendar tutor swap failed', { sessionId, code: err?.code });
      calendar = 'failed';
    }
  }

  const sessionStudents = students(session);
  const firstStudent = sessionStudents[0];
  const base = sessionConfirmedEmailParams(session, newTutor, firstStudent);
  const recipients = [newTutor, ...sessionStudents].filter((u) => u?.email);
  const sent = await Promise.allSettled(recipients.map((u) => emailService.sendSessionConfirmedEmail(
    u.email,
    { recipientName: u.name || '', ...base },
  )));
  const emailsFailed = sent.filter((r) => r.status === 'rejected').length;
  if (emailsFailed) console.error(`[admin-session-detail] ${emailsFailed} reassignment email(s) failed`, { sessionId });

  try {
    await notificationService.notifySessionReassigned({
      session,
      fromTutorId: oldTutor.id,
      toTutor: newTutor,
      studentName: firstStudent?.name,
    });
  } catch (err) {
    console.error('[admin-session-detail] Reassignment notifications failed', { sessionId, err: err?.message });
  }

  return {
    session: await getSessionDetail(sessionId, now),
    calendar,
    emailsSent: recipients.length - emailsFailed,
    emailsFailed,
  };
}

/**
 * Cancels the session on behalf of Calico. The status change is guarded and
 * audited; calendar, emails and notifications run after it and never undo it —
 * their outcome is reported so the admin knows what to fix by hand.
 *
 * @param {object} args
 * @param {boolean} [args.notifyTutor] false when the tutor already hears it
 *   another way (their suspension): only the students get email + notification.
 * @param {string|null} [args.trigger] why it happened when it is not a one-off
 *   cancellation (e.g. 'TUTOR_SUSPENDED'), recorded in the audit payload.
 * @param {boolean} [args.withDetail] false to skip rebuilding the detail
 *   (bulk callers do not show it; it presigns every attachment link).
 * @returns {Promise<{ session: object|null, calendar: 'deleted'|'failed'|'none', emailsSent: number, emailsFailed: number, refundPending: boolean }>}
 */
export async function cancelSession({
  sessionId, reason, adminId, request = null, now = new Date(),
  notifyTutor = true, trigger = null, withDetail = true,
}) {
  const session = await loadSession(sessionId);
  const blocker = cancelBlocker(session);
  if (blocker) throw detailError(blocker);

  const canceled = await sessionRepo.cancelByAdmin({ sessionId, adminId, reason, now });
  if (!canceled) throw detailError('SESSION_CHANGED');

  const paidPayments = session.payments.filter((p) => p.status === 'paid' && Number(p.amount) > 0);
  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.SESSION_CANCEL,
    targetType: 'Session',
    targetId: session.id,
    payload: {
      previousStatus: session.status,
      tutor: { id: session.tutor.id, name: session.tutor.name },
      paymentIds: session.payments.map((p) => p.id),
      reason,
      ...(trigger ? { trigger } : {}),
    },
    request,
  });

  // ── Side effects: report, never throw ──
  let calendar = 'none';
  if (session.googleCalendarEventId) {
    try {
      await calicoCalendar.cancelTutoringSessionEvent(session.googleCalendarEventId);
      calendar = 'deleted';
    } catch (err) {
      console.error('[admin-session-detail] Calendar event delete failed', { sessionId, code: err?.code });
      calendar = 'failed';
    }
  }

  const sessionStudents = students(session).filter((u) => u?.email);
  const sends = [
    ...sessionStudents.map((u) => emailService.sendSessionCancellationToStudent(u.email, u.name, session, reason, null, null)),
    ...(notifyTutor && session.tutor?.email
      ? [emailService.sendSessionCancellationToTutor(session.tutor.email, session.tutor.name, session, reason)]
      : []),
  ];
  const sent = await Promise.allSettled(sends);
  const emailsFailed = sent.filter((r) => r.status === 'rejected').length;
  if (emailsFailed) console.error(`[admin-session-detail] ${emailsFailed} cancellation email(s) failed`, { sessionId });

  try {
    await notificationService.notifySessionCancelledByCalico(session, { includeTutor: notifyTutor });
  } catch (err) {
    console.error('[admin-session-detail] Cancellation notifications failed', { sessionId, err: err?.message });
  }

  return {
    session: withDetail ? await getSessionDetail(sessionId, now) : null,
    calendar,
    emailsSent: sends.length - emailsFailed,
    emailsFailed,
    refundPending: paidPayments.length > 0,
  };
}

function meetSiblings(session, now) {
  return sessionRepo.findMeetSiblings({
    sessionId: session.id,
    tutorId: session.tutorId,
    studentIds: students(session).map((u) => u.id),
    now,
  });
}

/**
 * Other upcoming sessions of the same tutor and student that own a Meet: the
 * form offers sharing one's link when the new time lands right before or
 * after it.
 * @returns {Promise<Array<{ id, startTimestamp, endTimestamp, meetLink }>>}
 */
export async function listRescheduleSiblings(sessionId, now = new Date()) {
  const session = await loadSession(sessionId);
  const siblings = await meetSiblings(session, now);
  return siblings.map((s) => ({
    id: s.id,
    startTimestamp: s.startTimestamp,
    endTimestamp: s.endTimestamp,
    meetLink: s.googleMeetLink,
  }));
}

/**
 * Moves the session to `startTimestamp`, keeping its duration. The data change
 * is guarded and audited; the Calendar move (and the shared Meet) run after it
 * and never undo it — their outcome is reported so the admin knows what to fix
 * by hand.
 *
 * @param {object} args
 * @param {string|null} [args.shareMeetWithSessionId] a sibling (same tutor and
 *   student) that ends exactly at the new start or starts exactly at the new
 *   end: this session takes its Meet.
 * @returns {Promise<{ session: object, calendar: 'updated'|'failed'|'none', meet: 'shared'|'failed'|null }>}
 */
export async function rescheduleSession({
  sessionId, startTimestamp, shareMeetWithSessionId = null, adminId, request = null, now = new Date(),
}) {
  const session = await loadSession(sessionId);
  const blocker = rescheduleBlocker(session);
  if (blocker) throw detailError(blocker);

  const oldStart = new Date(session.startTimestamp);
  const oldEnd = new Date(session.endTimestamp);
  const newStart = new Date(startTimestamp);
  const newEnd = new Date(newStart.getTime() + (oldEnd.getTime() - oldStart.getTime()));
  if (newStart.getTime() <= now.getTime()) throw detailError('START_IN_PAST');
  if (newStart.getTime() === oldStart.getTime()) throw detailError('SAME_TIME');

  let sibling = null;
  if (shareMeetWithSessionId) {
    if (!session.googleCalendarEventId) throw detailError('MEET_NOT_SHAREABLE');
    sibling = (await meetSiblings(session, now)).find((s) => s.id === shareMeetWithSessionId);
    if (!sibling) throw detailError('MEET_NOT_SHAREABLE');
    const backToBack = new Date(sibling.endTimestamp).getTime() === newStart.getTime()
      || new Date(sibling.startTimestamp).getTime() === newEnd.getTime();
    if (!backToBack) throw detailError('MEET_NOT_ADJACENT');
  }

  const range = { startTimestamp: newStart, endTimestamp: newEnd };
  if ((await overlappingSessions(session.tutorId, session, range)).length > 0) throw detailError('SESSION_CONFLICT');

  const moved = await sessionRepo.rescheduleByAdmin({ sessionId, fromStart: oldStart, toStart: newStart, toEnd: newEnd });
  if (!moved) throw detailError('SESSION_CHANGED');

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.SESSION_RESCHEDULE,
    targetType: 'Session',
    targetId: session.id,
    payload: {
      from: { start: oldStart.toISOString(), end: oldEnd.toISOString() },
      to: { start: newStart.toISOString(), end: newEnd.toISOString() },
      sharedMeetWith: sibling?.id || null,
    },
    request,
  });

  // ── Side effects: report, never throw ──
  let calendar = 'none';
  let meet = sibling ? 'failed' : null;
  if (session.googleCalendarEventId) {
    let eventMeetLink = null;
    try {
      const res = await calicoCalendar.rescheduleTutoringSessionEvent(session.googleCalendarEventId, {
        startDateTime: newStart,
        endDateTime: newEnd,
        conferenceFromEventId: sibling?.googleCalendarEventId || null,
      });
      calendar = 'updated';
      eventMeetLink = res?.meetLink || null;
    } catch (err) {
      console.error('[admin-session-detail] Calendar reschedule failed', { sessionId, code: err?.code });
      calendar = 'failed';
    }
    // Only point the session at the shared link once the invite carries it too.
    if (sibling && eventMeetLink && eventMeetLink === sibling.googleMeetLink) {
      try {
        await sessionRepo.updateMeetLink(sessionId, sibling.googleMeetLink);
        meet = 'shared';
      } catch (err) {
        console.error('[admin-session-detail] Shared Meet link not saved', { sessionId, err: err?.message });
      }
    }
  }

  return { session: await getSessionDetail(sessionId, now), calendar, meet };
}

// A session another path already moved, or one whose tutor was paid: left as is.
const SKIPPED_CANCEL_CODES = new Set(['SESSION_NOT_CANCELABLE', 'TUTOR_ALREADY_PAID', 'SESSION_CHANGED', 'SESSION_NOT_FOUND']);

/**
 * Cancels every Pending/Accepted session of `tutorId` that has not started yet,
 * one by one through cancelSession (so each gets its calendar cleanup, student
 * emails, notifications, refund queue entry and audit row). The tutor is not
 * emailed per session. Never throws: what could not be done is counted.
 * @returns {Promise<{ canceled: number, skipped: number, failed: number, calendarFailed: number, emailsFailed: number, refundsPending: number }>}
 */
export async function cancelFutureSessionsOfTutor({ tutorId, reason, adminId, trigger = null, request = null, now = new Date() }) {
  const summary = { canceled: 0, skipped: 0, failed: 0, calendarFailed: 0, emailsFailed: 0, refundsPending: 0 };
  const ids = await sessionRepo.findUpcomingActiveIdsByTutor(tutorId, now);
  // Sequential: keeps the Calendar and Brevo calls paced.
  for (const sessionId of ids) {
    try {
      const r = await cancelSession({
        sessionId, reason, adminId, request, now, notifyTutor: false, trigger, withDetail: false,
      });
      summary.canceled += 1;
      if (r.calendar === 'failed') summary.calendarFailed += 1;
      summary.emailsFailed += r.emailsFailed;
      if (r.refundPending) summary.refundsPending += 1;
    } catch (err) {
      if (SKIPPED_CANCEL_CODES.has(err?.code)) {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
        console.error('[admin-session-detail] Could not cancel a session of the tutor', { sessionId, tutorId, err: err?.message });
      }
    }
  }
  return summary;
}
