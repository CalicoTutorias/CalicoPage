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
import * as calicoCalendar from './calico-calendar.service';

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
export async function createSession(studentId, data) {
  const { courseId, tutorId, sessionType, startTimestamp, endTimestamp, locationType, notes } = data;

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

  // 3. Check availability — does the requested time fall within a weekly block?
  const start = new Date(startTimestamp);
  const end = new Date(endTimestamp);

  if (start >= end) {
    const err = new Error('startTimestamp must be before endTimestamp');
    err.code = 'INVALID_TIMES';
    throw err;
  }

  const dayOfWeek = start.getUTCDay(); // 0=Sun … 6=Sat
  const tutorBlocks = await availabilityRepo.findAvailabilityByDay(tutorId, dayOfWeek);

  // Convert session times to time-only for comparison with availability blocks
  const sessionStartTime = new Date(`1970-01-01T${start.toISOString().slice(11, 19)}.000Z`);
  const sessionEndTime = new Date(`1970-01-01T${end.toISOString().slice(11, 19)}.000Z`);

  const withinBlock = tutorBlocks.some(
    (block) => block.startTime <= sessionStartTime && block.endTime >= sessionEndTime
  );

  if (!withinBlock) {
    const err = new Error('El horario solicitado no está dentro de la disponibilidad del tutor');
    err.code = 'OUTSIDE_AVAILABILITY';
    throw err;
  }

  // 4. Load tutor's schedule config for bufferTime and maxSessionsPerDay
  const schedule = await availabilityRepo.findScheduleByUserId(tutorId);
  const bufferMinutes = schedule?.bufferTime ?? 15;
  const maxPerDay = schedule?.maxSessionsPerDay ?? 5;

  // 5. Check overlapping sessions (with buffer)
  const bufferedStart = new Date(start.getTime() - bufferMinutes * 60_000);
  const bufferedEnd = new Date(end.getTime() + bufferMinutes * 60_000);

  const overlapping = await sessionRepo.findByTutorInRange(tutorId, bufferedStart, bufferedEnd);
  if (overlapping.length > 0) {
    const err = new Error('El tutor ya tiene una sesión en ese horario (incluyendo tiempo de buffer)');
    err.code = 'SESSION_CONFLICT';
    throw err;
  }

  // 6. Check maxSessionsPerDay
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

  // 7. Determine auto-accept
  const autoAccept = schedule?.autoAcceptSession ?? false;
  const status = autoAccept ? 'Accepted' : 'Pending';

  // 8. Create session + participant atomically
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
    },
    studentId,
  );

  // 9. If auto-accepted, create Google Calendar event
  if (autoAccept) {
    await syncCalendarCreate(session, tutor);
  }

  return session;
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

  return sessionRepo.updateSession(sessionId, { status: 'Rejected' });
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

  const updated = await sessionRepo.updateSession(sessionId, { status: 'Canceled' });

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

  return sessionRepo.updateSession(sessionId, { status: 'Completed' });
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

  return sessionRepo.addParticipant(sessionId, studentId);
}

// ===== GOOGLE CALENDAR SYNC (internal) =====

async function syncCalendarCreate(session, tutor) {
  try {
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
      // Store the calendar event ID on the session for future cancel/update
      // We use a raw Prisma update to add this metadata
      const prisma = (await import('../prisma')).default;
      // Note: googleCalendarEventId is not in schema yet — we skip for now
      // and log it. In a future migration, add this column.
      console.log(`Calendar event created for session ${session.id}: ${result.eventId}, meet: ${result.meetLink || 'none'}`);
    }
  } catch (calErr) {
    // Calendar creation is non-blocking — session is still valid
    console.warn(`Calendar sync failed for session ${session.id}: ${calErr.message}`);
  }
}
