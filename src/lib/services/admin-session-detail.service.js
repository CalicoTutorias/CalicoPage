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
      ? { at: session.cancelledAt, reason: session.cancellationReason || null }
      : null,
    reassign: { allowed: blocker === null, blocker },
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

async function overlappingSessions(tutorId, session) {
  const rows = await sessionRepo.findByTutorInRange(
    tutorId,
    new Date(session.startTimestamp),
    new Date(session.endTimestamp),
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
