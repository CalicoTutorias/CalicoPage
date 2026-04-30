/**
 * Session Service
 * Business logic for tutoring session lifecycle:
 *   create → accept/reject → complete/cancel
 *
 * Integrates with Google Calendar via calico-calendar.service.js
 * for accepted/cancelled sessions.
 */

import * as sessionRepo from '../repositories/session.repository';
import * as availabilityRepo from '../repositories/availability.repository';
import * as userRepo from '../repositories/user.repository';
import * as reviewRepo from '../repositories/review.repository';
import * as tutorProfileRepo from '../repositories/tutor-profile.repository';
import * as paymentRepo from '../repositories/payment.repository';
import * as notificationService from './notification.service';
import * as calicoCalendar from './calico-calendar.service';
import * as emailService from './email.service';
import * as attachmentService from './session-attachment.service';

/** en-US short weekday → JS getDay() (0 Sun … 6 Sat), aligned with Availability.dayOfWeek */
const WEEKDAY_SHORT_EN_TO_NUM = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Wall-clock in IANA timezone (same meaning as weekly availability: dayOfWeek + TIME in that zone).
 */
function getWallClockInTimeZone(date, timeZone) {
  const tz = timeZone || 'America/Bogota';
  const tryFormat = (z) => {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: z,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const map = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    const dayOfWeek = WEEKDAY_SHORT_EN_TO_NUM[map.weekday];
    if (dayOfWeek === undefined) {
      throw new Error(`Unexpected weekday: ${map.weekday}`);
    }
    return {
      dayOfWeek,
      hour: parseInt(map.hour, 10),
      minute: parseInt(map.minute, 10),
      second: parseInt(map.second || '0', 10),
    };
  };
  try {
    return tryFormat(tz);
  } catch {
    return tryFormat('America/Bogota');
  }
}

/** Match Prisma @db.Time (epoch date) for numeric compare */
function wallClockToEpochDate({ hour, minute, second }) {
  return new Date(Date.UTC(1970, 0, 1, hour, minute, second || 0));
}

/** Prisma Date or API string HH:mm:ss → comparable epoch Date */
function availabilityTimeToComparableDate(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      return new Date(
        Date.UTC(1970, 0, 1, parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3] || '0', 10)),
      );
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ===== QUERIES =====

export async function getSessionById(id) {
  const session = await sessionRepo.findById(id);
  if (!session) {
    const err = new Error('Session not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return session;
}

export async function getSessionsByTutor(tutorId, limit = 50) {
  return sessionRepo.findByTutor(tutorId, limit);
}

export async function getSessionsByStudent(studentId, limit = 50) {
  return sessionRepo.findByStudent(studentId, limit);
}

export async function getStudentHistory(studentId, limit = 50) {
  // Get all sessions where student participated
  const sessions = await sessionRepo.findByStudent(studentId, limit);
  
  // Ensure pending reviews exist for past sessions
  const now = new Date();
  let reviewsCreated = 0;
  for (const session of sessions) {
    const isPast = session.endTimestamp < now;
    
    // Only create pending reviews for sessions that actually ran (not canceled/rejected)
    const isEligible = isPast &&
      session.status !== 'Canceled' &&
      session.status !== 'Rejected';

    if (isEligible) {
      // Check if a pending review already exists
      const existingPendingReview = session.reviews?.find(
        (r) => r.studentId === studentId && r.tutorId === session.tutorId && r.status === 'pending' && r.rating === null
      );

      // If no pending review exists, create one automatically
      if (!existingPendingReview) {
        try {
          const created = await reviewRepo.upsertReview({
            sessionId: session.id,
            studentId: studentId,
            tutorId: session.tutorId,
            rating: null,
            status: 'pending',
            comment: null,
          });
          reviewsCreated++;
          console.log(`✓ Pending review created for session ${session.id}: review.id=${created.id}, status=${created.status}`);
        } catch (err) {
          // Log error but continue
          console.error(`✗ Failed to create pending review for session ${session.id}:`, err.message);
        }
      }
    }
  }
  
  if (reviewsCreated > 0) {
    console.log(` Created ${reviewsCreated} pending reviews for past sessions`);
  }
  
  // Re-fetch sessions to get the newly created reviews
  const sessionsWithReviews = await sessionRepo.findByStudent(studentId, limit);
  
  // Enrich with review info
  const enriched = await Promise.all(
    sessionsWithReviews.map(async (session) => {
      // Find pending review: one where student is reviewer and tutor is reviewee, rating is null
      const pendingReview = session.reviews?.find(
        (r) => r.studentId === studentId && r.tutorId === session.tutorId && r.rating === null
      ) || null;

      if (pendingReview) {
        console.log(`✓ Session ${session.id}: Found pending review (status=${pendingReview.status}, rating=${pendingReview.rating})`);
      } else {
        console.log(` Session ${session.id}: No pending review found for student=${studentId}, tutor=${session.tutorId}`);
        console.log(`  → session.reviews: ${session.reviews?.length || 0} reviews present`);
        if (session.reviews && session.reviews.length > 0) {
          console.log(`  → Reviews in session:`, session.reviews.map((r) => `(id=${r.id}, studentId=${r.studentId}, tutorId=${r.tutorId}, status=${r.status}, rating=${r.rating})`));
        }
      }

      return {
        ...session,
        pendingReview,
      };
    })
  );

  return enriched;
}

export async function getSessionsByTutorAndStatus(tutorId, status, limit = 50) {
  return sessionRepo.findByTutorAndStatus(tutorId, status, limit);
}

export async function getStudentStats(userId) {
  const [sessionStats, ratingStats] = await Promise.all([
    sessionRepo.getStudentStats(userId),
    reviewRepo.getAverageScore(userId),
  ]);
  return {
    sessionsThisWeek: sessionStats.sessionsThisWeek,
    totalCompleted: sessionStats.totalCompleted,
    activeCoursesCount: sessionStats.activeCoursesCount,
    averageRating: ratingStats.count > 0 ? Math.round(ratingStats.average * 10) / 10 : null,
  };
}

// ===== CREATE SESSION (Student books a tutor) =====

/**
 * Validates availability and creates a session with the student as first participant.
 *
 * Anti-overbooking checks:
 * 1. The requested time slot must fall within one of the tutor's weekly availability blocks.
 * 2. The tutor must not have an overlapping active session (respecting bufferTime).
 * 3. The tutor must not exceed maxSessionsPerDay.
 */
export async function createSession(studentId, data, options = {}) {
  const { courseId, tutorId, sessionType, startTimestamp, endTimestamp, locationType, notes, topicsToReview } = data;
  const { forceAutoAccept = false } = options;

  // 1. Cannot book yourself
  if (studentId === tutorId) {
    const err = new Error('No puedes reservar una sesión contigo mismo');
    err.code = 'SELF_BOOKING';
    throw err;
  }

  // 2. Verify the tutor is approved
  const tutor = await userRepo.findById(tutorId);
  if (!tutor || !tutor.isTutorApproved) {
    const err = new Error('El tutor no existe o no está aprobado');
    err.code = 'TUTOR_NOT_APPROVED';
    throw err;
  }

  const start = new Date(startTimestamp);
  const end = new Date(endTimestamp);

  if (start >= end) {
    const err = new Error('startTimestamp must be before endTimestamp');
    err.code = 'INVALID_TIMES';
    throw err;
  }

  // Schedule first: timezone defines how weekly TIME + dayOfWeek match the session instant
  const schedule = await availabilityRepo.findScheduleByUserId(tutorId);
  const tutorTimeZone = schedule?.timezone || 'America/Bogota';

  // 3. Check availability — same calendar day & wall-clock in tutor TZ as stored blocks (not UTC)
  const localStart = getWallClockInTimeZone(start, tutorTimeZone);
  const localEnd = getWallClockInTimeZone(end, tutorTimeZone);

  if (localStart.dayOfWeek !== localEnd.dayOfWeek) {
    const err = new Error(
      'La sesión debe comenzar y terminar el mismo día (zona horaria del tutor)',
    );
    err.code = 'INVALID_TIMES';
    throw err;
  }

  const tutorBlocks = await availabilityRepo.findAvailabilityByDay(tutorId, localStart.dayOfWeek);

  const sessionStartTime = wallClockToEpochDate(localStart);
  const sessionEndTime = wallClockToEpochDate(localEnd);

  const withinBlock = tutorBlocks.some((block) => {
    const bStart = availabilityTimeToComparableDate(block.startTime);
    const bEnd = availabilityTimeToComparableDate(block.endTime);
    if (!bStart || !bEnd) return false;
    return bStart <= sessionStartTime && bEnd >= sessionEndTime;
  });

  if (!withinBlock) {
    const err = new Error('El horario solicitado no está dentro de la disponibilidad del tutor');
    err.code = 'OUTSIDE_AVAILABILITY';
    throw err;
  }

  // 4. Tutor schedule config (bufferTime, maxSessionsPerDay, auto-accept)
  const bufferMinutes = schedule?.bufferTime ?? 15;
  const maxPerDay = schedule?.maxSessionsPerDay ?? 5;

  // 5. Check maxSessionsPerDay
  const dayStart = new Date(start);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(start);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const sessionsToday = await sessionRepo.countTutorSessionsOnDate(tutorId, dayStart, dayEnd);
  if (sessionsToday >= maxPerDay) {
    const err = new Error(`El tutor ya alcanzó el máximo de ${maxPerDay} sesiones para este día`);
    err.code = 'MAX_SESSIONS_REACHED';
    throw err;
  }

  // 7. Determine auto-accept — caller override takes precedence (used by paid-booking flow)
  const autoAccept = forceAutoAccept || (schedule?.autoAcceptSession ?? false);
  const status = autoAccept ? 'Accepted' : 'Pending';

  // 8. Create session + participant atomically (overlap check inside transaction)
  const session = await sessionRepo.createSessionWithParticipant(
    {
      courseId,
      tutorId,
      sessionType: sessionType || 'Individual',
      maxCapacity: sessionType === 'Group' ? (data.maxCapacity || 5) : 1,
      startTimestamp: start,
      endTimestamp: end,
      status,
      locationType: locationType || 'Virtual',
      notes: notes || null,
      topicsToReview: topicsToReview || null,
    },
    studentId,
    bufferMinutes,
  );

  // 9. Create pending review placeholder immediately (rating=null, status='pending')
  try {
    await reviewRepo.upsertReview({
      sessionId: session.id,
      studentId,
      tutorId,
      rating: null,
      status: 'pending',
      comment: null,
    });
  } catch (err) {
    // Silently continue if review creation fails
  }

  // 10. If auto-accepted, create Google Calendar event
  if (autoAccept) {
    await syncCalendarCreate(session, tutor);
  }

  return session;
}

// ===== BOOK PAID SESSION (post-payment auto-accept flow) =====

/**
 * Book and auto-accept a session that was just paid for.
 *
 * The booking UI only surfaces time slots that fall within the tutor's weekly
 * availability, and `createSession` re-validates that invariant server-side.
 * Because the payment already succeeded by the time this runs, we skip the
 * manual accept/reject step and transition straight to `Accepted`.
 *
 * Side effects (besides those of `createSession`):
 *   - Registers any pre-uploaded attachments.
 *   - Sends the "tutoría confirmada" email (template 7) to tutor and student.
 *   - Creates in-app notifications for both parties.
 *
 * Validation errors bubble up unchanged with their `err.code` set
 * (SELF_BOOKING, TUTOR_NOT_APPROVED, INVALID_TIMES, OUTSIDE_AVAILABILITY,
 *  MAX_SESSIONS_REACHED, SESSION_CONFLICT) so callers can react (e.g. the
 *  Wompi webhook flags business-logic conflicts for manual refund).
 */
export async function bookPaidSession({
  studentId,
  tutorId,
  courseId,
  sessionType = 'Individual',
  maxCapacity,
  startTimestamp,
  endTimestamp,
  locationType = 'Virtual',
  notes = null,
  topicsToReview = null,
  attachments = [],
}) {
  // 1. Create + auto-accept (reuses all validation, overlap/buffer checks,
  //    pending review and Google Calendar event creation from `createSession`)
  const created = await createSession(
    studentId,
    {
      courseId,
      tutorId,
      sessionType,
      maxCapacity,
      startTimestamp,
      endTimestamp,
      locationType,
      notes,
      topicsToReview,
    },
    { forceAutoAccept: true },
  );

  // 2. Register attachments (non-blocking — session is valid either way)
  if (Array.isArray(attachments) && attachments.length > 0) {
    try {
      await attachmentService.registerAttachments(created.id, attachments);
    } catch (err) {
      console.warn(`[session] Attachment registration failed for ${created.id}: ${err.message}`);
    }
  }

  // 3. Re-fetch so we have the google_meet_link stored by syncCalendarCreate
  const session = await sessionRepo.findById(created.id);
  const tutor = session.tutor;
  const student = session.participants?.find((p) => p.studentId === studentId)?.student;

  // 4. Fire-and-forget: emails + in-app notifications
  sendSessionConfirmedEmails(session, tutor, student);
  notificationService.notifySessionAccepted(session, tutor?.name || 'Tu tutor');
  notificationService.notifySessionConfirmedToTutor(session, student?.name || 'Un estudiante');

  return session;
}

/** Sends template-7 "tutoría confirmada" to both tutor and student. */
function sendSessionConfirmedEmails(session, tutor, student) {
  try {
    const dateFmt = new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/Bogota',
    });
    const startTime = dateFmt.format(new Date(session.startTimestamp));
    const endTime = dateFmt.format(new Date(session.endTimestamp));
    const courseName = session.course?.name || 'Tutoría';
    const meetLink = session.googleMeetLink || '';

    const base = {
      tutorName: tutor?.name || '',
      studentName: student?.name || 'Estudiante',
      courseName,
      startTime,
      endTime,
      meetLink,
    };

    if (tutor?.email) {
      emailService
        .sendSessionConfirmedEmail(tutor.email, { recipientName: tutor.name || '', ...base })
        .catch((err) => console.error(`[session] Confirmation email to tutor failed: ${err.message}`));
    }
    if (student?.email) {
      emailService
        .sendSessionConfirmedEmail(student.email, { recipientName: student.name || 'Estudiante', ...base })
        .catch((err) => console.error(`[session] Confirmation email to student failed: ${err.message}`));
    }
  } catch (err) {
    console.error(`[session] Error preparing confirmation emails: ${err.message}`);
  }
}

// ===== STATUS TRANSITIONS (Tutor actions) =====

export async function acceptSession(sessionId, tutorId) {
  const session = await getSessionById(sessionId);

  if (session.tutorId !== tutorId) {
    const err = new Error('Solo el tutor asignado puede aceptar esta sesión');
    err.code = 'FORBIDDEN';
    throw err;
  }
  if (session.status !== 'Pending') {
    const err = new Error(`No se puede aceptar una sesión con status "${session.status}"`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  const updated = await sessionRepo.updateSession(sessionId, { status: 'Accepted' });

  // Create Google Calendar event
  const tutor = await userRepo.findById(tutorId);
  await syncCalendarCreate(updated, tutor);

  // Notify students that session was accepted (fire-and-forget)
  notificationService.notifySessionAccepted(session, tutor?.name || 'Tu tutor');

  return updated;
}

export async function rejectSession(sessionId, tutorId) {
  const session = await getSessionById(sessionId);

  if (session.tutorId !== tutorId) {
    const err = new Error('Solo el tutor asignado puede rechazar esta sesión');
    err.code = 'FORBIDDEN';
    throw err;
  }
  if (session.status !== 'Pending') {
    const err = new Error(`No se puede rechazar una sesión con status "${session.status}"`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  const updated = await sessionRepo.updateSession(sessionId, { status: 'Rejected' });

  // Notify students that session was rejected (fire-and-forget)
  const tutor = await userRepo.findById(tutorId);
  notificationService.notifySessionRejected(session, tutor?.name || 'Tu tutor');

  return updated;
}

export async function cancelSession(sessionId, userId) {
  const session = await getSessionById(sessionId);

  // Both tutor and participants can cancel
  const isTutor = session.tutorId === userId;
  const isParticipant = session.participants?.some((p) => p.studentId === userId);

  if (!isTutor && !isParticipant) {
    const err = new Error('No tienes permiso para cancelar esta sesión');
    err.code = 'FORBIDDEN';
    throw err;
  }

  if (session.status === 'Completed' || session.status === 'Canceled' || session.status === 'Rejected') {
    const err = new Error(`No se puede cancelar una sesión con status "${session.status}"`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  // If session has a paid payment, decrement tutor stats before cancelling
  if (session.status === 'Accepted') {
    try {
      const payment = await paymentRepo.findBySessionId(sessionId);
      if (payment && payment.status === 'paid') {
        // Decrement tutor's statistics: numSessions and totalEarning
        await tutorProfileRepo.decrementStats(session.tutorId, payment.amount);
      }
    } catch (err) {
      console.warn(`Failed to decrement tutor stats for cancelled session: ${err.message}`);
    }
  }

  const updated = await sessionRepo.updateSession(sessionId, { status: 'Canceled' });

  // Notify the other party (fire-and-forget)
  notificationService.notifySessionCancelled(session, userId);

  // Cancel Google Calendar event if it was previously accepted
  if (session.googleCalendarEventId) {
    try {
      await calicoCalendar.cancelTutoringSessionEvent(session.googleCalendarEventId);
    } catch (calErr) {
      console.warn(`Failed to cancel calendar event: ${calErr.message}`);
    }
  }

  return updated;
}

export async function completeSession(sessionId, tutorId) {
  const session = await getSessionById(sessionId);

  if (session.tutorId !== tutorId) {
    const err = new Error('Solo el tutor asignado puede completar esta sesión');
    err.code = 'FORBIDDEN';
    throw err;
  }
  if (session.status !== 'Accepted') {
    const err = new Error(`No se puede completar una sesión con status "${session.status}"`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  // Mark session as completed
  const updated = await sessionRepo.updateSession(sessionId, { status: 'Completed' });

  // If session has a paid payment, increment tutor stats
  try {
    const payment = await paymentRepo.findBySessionId(sessionId);
    if (payment && payment.status === 'paid') {
      // Increment tutor's statistics: numSessions and totalEarning
      await tutorProfileRepo.incrementStats(tutorId, payment.amount);
    }
  } catch (err) {
    console.warn(`Failed to increment tutor stats for completed session: ${err.message}`);
  }

  // Notify students to leave a review (fire-and-forget)
  const tutor = await userRepo.findById(tutorId);
  notificationService.notifySessionCompleted(session, tutor?.name || 'Tu tutor');

  // Auto-create pending review placeholders (student → tutor, one per participant)
  const participants = session.participants || [];
  await Promise.all(
    participants.map((p) =>
      reviewRepo.upsertReview({
        sessionId,
        studentId: p.studentId,
        tutorId,
        rating: null,
        status: 'pending',
        comment: null,
      })
    )
  );

  return updated;
}

// ===== JOIN GROUP SESSION =====

export async function joinSession(sessionId, studentId) {
  const session = await getSessionById(sessionId);

  if (session.sessionType !== 'Group') {
    const err = new Error('Solo se puede unir a sesiones grupales');
    err.code = 'NOT_GROUP';
    throw err;
  }

  if (session.status !== 'Pending' && session.status !== 'Accepted') {
    const err = new Error(`No se puede unir a una sesión con status "${session.status}"`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  if (session.tutorId === studentId) {
    const err = new Error('El tutor no puede unirse como participante');
    err.code = 'SELF_BOOKING';
    throw err;
  }

  const alreadyIn = await sessionRepo.isStudentInSession(sessionId, studentId);
  if (alreadyIn) {
    const err = new Error('Ya estás inscrito en esta sesión');
    err.code = 'ALREADY_JOINED';
    throw err;
  }

  const currentCount = await sessionRepo.countParticipants(sessionId);
  if (currentCount >= session.maxCapacity) {
    const err = new Error('La sesión grupal está llena');
    err.code = 'SESSION_FULL';
    throw err;
  }

  const participant = await sessionRepo.addParticipant(sessionId, studentId);

  // Notify tutor that a student joined (fire-and-forget)
  const student = await userRepo.findById(studentId);
  notificationService.notifyStudentJoinedGroup(session, student?.name || 'Un estudiante');

  return participant;
}

// ===== GOOGLE CALENDAR SYNC (internal) =====

async function syncCalendarCreate(session, tutor) {
  try {
    // Check if calendar event already exists (created during payment)
    if (session.googleCalendarEventId) {
      console.log(`✓ Calendar event already exists for session ${session.id}: ${session.googleCalendarEventId}`);
      return; // Skip duplicate creation
    }

    const studentEmails = session.participants
      ?.map((p) => p.student?.email)
      .filter(Boolean) || [];

    const courseName = session.course?.name || 'Tutoría';

    const result = await calicoCalendar.createTutoringSessionEvent({
      summary: `Tutoría ${courseName}`,
      description: `Sesión de tutoría agendada a través de Calico.\n\nMateria: ${courseName}\nTutor: ${tutor?.name || tutor?.email}\n\nID de sesión: ${session.id}`,
      startDateTime: session.startTimestamp,
      endDateTime: session.endTimestamp,
      attendees: studentEmails,
      location: session.locationType === 'Virtual' ? 'Google Meet (enlace adjunto)' : 'Por definir',
      tutorEmail: tutor?.email || '',
      tutorName: tutor?.name || '',
      tutorId: tutor?.id || session.tutorId,
    });

    if (result.success && result.eventId) {
      // Store the calendar event ID and Meet link on the session
      const prisma = (await import('../prisma')).default;
      await prisma.session.update({
        where: { id: session.id },
        data: {
          googleCalendarEventId: result.eventId,
          googleMeetLink: result.meetLink,
        },
      });
      
      console.log(` Calendar event created for session ${session.id}: ${result.eventId}, meet: ${result.meetLink || 'none'}`);
    }
  } catch (calErr) {
    // Calendar creation is non-blocking — session is still valid
    console.warn(`Calendar sync failed for session ${session.id}: ${calErr.message}`);
  }
}
