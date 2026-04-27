/**
 * Session Repository
 * Handles database operations for tutoring sessions and participants (PostgreSQL via Prisma).
 *
 * Models: Session, SessionParticipant
 */

import prisma from '../prisma';

// Standard includes for session queries
const SESSION_INCLUDE = {
  course: true,
  tutor: { select: { id: true, name: true, email: true, profilePictureUrl: true } },
  participants: {
    include: {
      student: { select: { id: true, name: true, email: true, profilePictureUrl: true } },
    },
  },
  payments: true,
};

// ===== SESSION CRUD =====

export async function findById(id) {
  return prisma.session.findUnique({
    where: { id },
    include: {
      ...SESSION_INCLUDE,
      reviews: true,
    },
  });
}

export async function findByTutor(tutorId, limit = 50) {
  return prisma.session.findMany({
    where: { tutorId },
    include: SESSION_INCLUDE,
    orderBy: { startTimestamp: 'desc' },
    take: limit,
  });
}

export async function findByStudent(studentId, limit = 50) {
  return prisma.session.findMany({
    where: {
      participants: { some: { studentId } },
    },
    include: {
      ...SESSION_INCLUDE,
      reviews: true,
    },
    orderBy: { startTimestamp: 'desc' },
    take: limit,
  });
}

export async function findByTutorAndStatus(tutorId, status, limit = 50) {
  return prisma.session.findMany({
    where: { tutorId, status },
    include: SESSION_INCLUDE,
    orderBy: { startTimestamp: 'desc' },
    take: limit,
  });
}

export async function findByStudentAndStatus(studentId, status, limit = 50) {
  return prisma.session.findMany({
    where: {
      status,
      participants: { some: { studentId } },
    },
    include: SESSION_INCLUDE,
    orderBy: { startTimestamp: 'desc' },
    take: limit,
  });
}

/**
 * Find sessions for a tutor within a time range (for conflict detection).
 */
export async function findByTutorInRange(tutorId, startTimestamp, endTimestamp) {
  return prisma.session.findMany({
    where: {
      tutorId,
      status: { notIn: ['Rejected', 'Canceled'] },
      startTimestamp: { lt: endTimestamp },
      endTimestamp: { gt: startTimestamp },
    },
    include: SESSION_INCLUDE,
  });
}

/**
 * Count active sessions for a tutor on a specific date (for maxSessionsPerDay).
 */
export async function countTutorSessionsOnDate(tutorId, dateStart, dateEnd) {
  return prisma.session.count({
    where: {
      tutorId,
      status: { notIn: ['Rejected', 'Canceled'] },
      startTimestamp: { gte: dateStart, lt: dateEnd },
    },
  });
}

/**
 * Create a session with its first participant in a single serializable transaction.
 * The overlap check is performed inside the transaction to prevent race conditions
 * when two payments are processed concurrently for the same time slot.
 */
export async function createSessionWithParticipant(sessionData, studentId, bufferMinutes = 15) {
  const bufferMs = bufferMinutes * 60_000;
  const bufferedStart = new Date(sessionData.startTimestamp.getTime() - bufferMs);
  const bufferedEnd = new Date(sessionData.endTimestamp.getTime() + bufferMs);

  const sessionId = await prisma.$transaction(
    async (tx) => {
      // Atomic overlap check — prevents double-booking under concurrent load
      const overlapping = await tx.session.findMany({
        where: {
          tutorId: sessionData.tutorId,
          status: { notIn: ['Rejected', 'Canceled'] },
          startTimestamp: { lt: bufferedEnd },
          endTimestamp: { gt: bufferedStart },
        },
        select: { id: true },
      });

      if (overlapping.length > 0) {
        const err = new Error('El tutor ya tiene una sesión en ese horario (incluyendo tiempo de buffer)');
        err.code = 'SESSION_CONFLICT';
        throw err;
      }

      const session = await tx.session.create({
        data: {
          courseId: sessionData.courseId,
          tutorId: sessionData.tutorId,
          sessionType: sessionData.sessionType,
          maxCapacity: sessionData.maxCapacity || 1,
          startTimestamp: sessionData.startTimestamp,
          endTimestamp: sessionData.endTimestamp,
          status: sessionData.status || 'Pending',
          locationType: sessionData.locationType,
          notes: sessionData.notes || null,
          topicsToReview: sessionData.topicsToReview || null,
        },
      });

      await tx.sessionParticipant.create({
        data: { sessionId: session.id, studentId },
      });

      return session.id;
    },
    { isolationLevel: 'Serializable', timeout: 15000 },
  );

  return prisma.session.findUnique({
    where: { id: sessionId },
    include: { ...SESSION_INCLUDE, reviews: true },
  });
}

export async function updateSession(id, data) {
  return prisma.session.update({
    where: { id },
    data,
    include: SESSION_INCLUDE,
  });
}

export async function deleteSession(id) {
  await prisma.session.delete({ where: { id } });
}

// ===== PARTICIPANTS =====

export async function addParticipant(sessionId, studentId) {
  return prisma.sessionParticipant.create({
    data: { sessionId, studentId },
    include: {
      student: { select: { id: true, name: true, email: true, profilePictureUrl: true } },
    },
  });
}

export async function removeParticipant(sessionId, studentId) {
  await prisma.sessionParticipant.delete({
    where: { sessionId_studentId: { sessionId, studentId } },
  });
}

export async function countParticipants(sessionId) {
  return prisma.sessionParticipant.count({
    where: { sessionId },
  });
}

export async function isStudentInSession(sessionId, studentId) {
  const count = await prisma.sessionParticipant.count({
    where: { sessionId, studentId },
  });
  return count > 0;
}

/**
 * Aggregate stats for a student's dashboard.
 */
export async function getStudentStats(studentId) {
  const now = new Date();
  // Monday of the current week
  const dayOfWeek = now.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - daysFromMonday);

  const [sessionsThisWeek, totalCompleted, activeSessions] = await Promise.all([
    prisma.session.count({
      where: {
        status: { notIn: ['Rejected', 'Canceled'] },
        startTimestamp: { gte: weekStart },
        participants: { some: { studentId } },
      },
    }),
    prisma.session.count({
      where: {
        status: 'Completed',
        participants: { some: { studentId } },
      },
    }),
    prisma.session.findMany({
      where: {
        status: { notIn: ['Rejected', 'Canceled'] },
        participants: { some: { studentId } },
      },
      select: { courseId: true },
    }),
  ]);

  const activeCoursesCount = new Set(activeSessions.map((s) => s.courseId)).size;

  return { sessionsThisWeek, totalCompleted, activeCoursesCount };
}

// ===== SESSION CANCELLATION =====

export async function updateSessionCancellation(sessionId, data) {
  const { cancellationReason, cancelledBy, refundAmount } = data;
  
  return prisma.session.update({
    where: { id: sessionId },
    data: {
      status: 'Canceled',
      cancellationReason,
      cancelledAt: new Date(),
      cancelledBy,
      refundAmount,
    },
    include: {
      ...SESSION_INCLUDE,
      reviews: true,
      cancelledByUser: { select: { id: true, name: true, email: true } },
    },
  });
}
