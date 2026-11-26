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
  tutor: { select: { id: true, name: true, email: true, profilePictureUrl: true, verifiedUniversity: true } },
  participants: {
    include: {
      student: { select: { id: true, name: true, email: true, profilePictureUrl: true, verifiedUniversity: true } },
    },
  },
  // Only the figures both parties may see. Payout state/notes, the Wompi id
  // and the tutor payout base stay out — a session is read by the student AND
  // the tutor, and neither should see the other side's ledger.
  payments: {
    select: {
      id: true,
      amount: true,
      originalAmount: true,
      discountAmount: true,
      status: true,
      createdAt: true,
    },
  },
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

/**
 * Active session booked by a paid intent. session-checkout.service
 * (recordPaidSessionBooking) stamps its notes with
 * `Booked via payment intent <reference>`.
 */
export async function findSessionByIntentReference(reference) {
  if (!reference) return null;
  return prisma.session.findFirst({
    where: {
      notes: `Booked via payment intent ${reference}`,
      status: { notIn: ['Canceled', 'Rejected'] },
    },
    include: {
      ...SESSION_INCLUDE,
      reviews: true,
    },
  });
}

/**
 * First active (not Canceled/Rejected) session of `studentId` with `tutorId`
 * for `courseId` created after `createdAfter`, other than the one booked by
 * the intent `excludeIntentReference` itself (same notes stamp as
 * findSessionByIntentReference). Used by the payment sweeper to spot a lost
 * payment the team already fixed by hand with a session not linked to it.
 */
export async function findActiveSessionCreatedAfter({ studentId, tutorId, courseId, createdAfter, excludeIntentReference }) {
  return prisma.session.findFirst({
    where: {
      tutorId: String(tutorId),
      courseId: String(courseId),
      createdAt: { gt: createdAfter },
      status: { notIn: ['Canceled', 'Rejected'] },
      participants: { some: { studentId: String(studentId) } },
      OR: [{ notes: null }, { notes: { not: `Booked via payment intent ${excludeIntentReference}` } }],
    },
    select: { id: true, source: true, status: true, startTimestamp: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
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
      _count: { select: { materials: true } },
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
 * Minutes of active sessions a tutor has starting in [dateStart, dateEnd)
 * (for the tutor's max hours per day).
 */
export async function sumTutorSessionMinutesOnDate(tutorId, dateStart, dateEnd) {
  const sessions = await prisma.session.findMany({
    where: {
      tutorId,
      status: { notIn: ['Rejected', 'Canceled'] },
      startTimestamp: { gte: dateStart, lt: dateEnd },
    },
    select: { startTimestamp: true, endTimestamp: true },
  });
  return sessions.reduce(
    (total, s) => total + Math.max(0, Math.round((s.endTimestamp - s.startTimestamp) / 60_000)),
    0,
  );
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
          source: sessionData.source || 'Platform',
          manualCreatedById: sessionData.manualCreatedById || null,
        },
      });

      await tx.sessionParticipant.create({
        data: { sessionId: session.id, studentId },
      });

      // Increment tutor's session counter
      await tx.tutorProfile.update({
        where: { userId: sessionData.tutorId },
        data: { numSessions: { increment: 1 } },
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

// ===== MANUAL SESSIONS (admin) =====

// The admin contacts this student to collect the payment, so unlike the
// dashboard history this select does carry phone and email. Admin routes only.
const MANUAL_SESSION_SELECT = {
  id: true,
  status: true,
  startTimestamp: true,
  endTimestamp: true,
  googleMeetLink: true,
  course: { select: { id: true, code: true, name: true } },
  tutor: { select: { id: true, name: true } },
  participants: {
    select: {
      student: { select: { id: true, name: true, kind: true, email: true, phoneNumber: true, whatsappTag: true } },
    },
  },
  payments: {
    select: {
      id: true, amount: true, originalAmount: true, discountAmount: true, status: true,
      proofS3Key: true, proofUploadedAt: true, coupon: { select: { code: true } },
      package: { select: { id: true, committedMinutes: true, discountPercent: true } },
    },
  },
  _count: { select: { materials: true } },
};

const MANUAL_SESSION_WHERE = { source: 'ManualAdmin' };

/** One page of manual sessions, latest session date first. */
export async function findManualSessions({ limit = 20, offset = 0 } = {}) {
  const [rows, total] = await Promise.all([
    prisma.session.findMany({
      where: MANUAL_SESSION_WHERE,
      orderBy: [{ startTimestamp: 'desc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
      select: MANUAL_SESSION_SELECT,
    }),
    prisma.session.count({ where: MANUAL_SESSION_WHERE }),
  ]);
  return { rows, total };
}

export async function findManualSessionById(id) {
  return prisma.session.findFirst({
    where: { id, ...MANUAL_SESSION_WHERE },
    select: MANUAL_SESSION_SELECT,
  });
}

/**
 * Accepted → Completed, only if the session is still Accepted. Answers whether
 * this call made the move, so two triggers at once (the student's review and
 * the daily job) cannot both run what follows a completion.
 */
export async function markCompletedIfAccepted(id) {
  const { count } = await prisma.session.updateMany({
    where: { id, status: 'Accepted' },
    data: { status: 'Completed' },
  });
  return count === 1;
}

/**
 * Accepted sessions that ended before `endedBefore`, for the daily job that
 * completes them. A manual session whose student payment is still pending is
 * left out: uploading the proof is what completes it (manual-session.service).
 */
export async function findSessionsToAutoComplete({ endedBefore, limit = 200 }) {
  return prisma.session.findMany({
    where: {
      status: 'Accepted',
      endTimestamp: { lt: endedBefore },
      NOT: { source: 'ManualAdmin', payments: { some: { status: 'pending' } } },
    },
    select: {
      id: true,
      tutorId: true,
      endTimestamp: true,
      participants: { select: { student: { select: { kind: true } } } },
    },
    orderBy: { endTimestamp: 'asc' },
    take: limit,
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

// ===== ADMIN: DETAIL & TUTOR REASSIGNMENT =====

/**
 * One session as the admin "Tutorías" detail shows it: people with contact,
 * the student's files (session_attachments) and, per payment, what decides
 * whether the tutor can still be swapped (payout state, hours package).
 * Admin-only: callers never pass this to a student or a tutor.
 */
export async function findAdminDetailById(id) {
  return prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      source: true,
      sessionType: true,
      locationType: true,
      startTimestamp: true,
      endTimestamp: true,
      createdAt: true,
      notes: true,
      topicsToReview: true,
      googleCalendarEventId: true,
      googleMeetLink: true,
      cancelledAt: true,
      cancelledBy: true,
      cancellationReason: true,
      courseId: true,
      tutorId: true,
      course: { select: { id: true, code: true, name: true } },
      tutor: { select: { id: true, name: true, email: true, phoneNumber: true } },
      participants: {
        select: { student: { select: { id: true, name: true, email: true, phoneNumber: true } } },
      },
      attachments: {
        select: { id: true, s3Key: true, fileName: true, fileSize: true, mimeType: true, uploadedAt: true },
        orderBy: { uploadedAt: 'asc' },
      },
      payments: {
        select: {
          id: true,
          status: true,
          amount: true,
          tutorPayoutStatus: true,
          packageId: true,
          wompiId: true,
        },
      },
      _count: { select: { reviews: true, studentReviews: true } },
    },
  });
}

/**
 * Moves a session and its payments from one tutor to another, atomically and
 * only from the state the service checked: the session still belongs to
 * `fromTutorId` and is Pending/Accepted, and no payment of it was paid out to
 * the tutor yet. Returns false (nothing written) when that state changed.
 */
export async function reassignTutor({ sessionId, fromTutorId, toTutorId }) {
  return prisma.$transaction(async (tx) => {
    const paidOut = await tx.payment.count({
      where: { sessionId, tutorPayoutStatus: { not: 'pending' } },
    });
    if (paidOut > 0) return false;

    const { count } = await tx.session.updateMany({
      where: { id: sessionId, tutorId: fromTutorId, status: { in: ['Pending', 'Accepted'] } },
      data: { tutorId: toTutorId },
    });
    if (count !== 1) return false;

    await tx.payment.updateMany({
      where: { sessionId, tutorId: fromTutorId },
      data: { tutorId: toTutorId },
    });
    return true;
  });
}

/** Ids of the tutor's Pending/Accepted sessions that start after `now`, soonest first. */
export async function findUpcomingActiveIdsByTutor(tutorId, now = new Date()) {
  const rows = await prisma.session.findMany({
    where: { tutorId, status: { in: ['Pending', 'Accepted'] }, startTimestamp: { gt: now } },
    select: { id: true },
    orderBy: { startTimestamp: 'asc' },
  });
  return rows.map((r) => r.id);
}

/**
 * Admin cancellation: Pending/Accepted → Canceled, guarded so it only happens
 * while the session is still in that state and no tutor payout has been made.
 * @returns {Promise<boolean>} false when the session changed meanwhile.
 */
export async function cancelByAdmin({ sessionId, adminId, reason, now = new Date() }) {
  return prisma.$transaction(async (tx) => {
    const paidOut = await tx.payment.count({
      where: { sessionId, tutorPayoutStatus: { not: 'pending' } },
    });
    if (paidOut > 0) return false;

    const { count } = await tx.session.updateMany({
      where: { id: sessionId, status: { in: ['Pending', 'Accepted'] } },
      data: {
        status: 'Canceled',
        cancelledAt: now,
        cancelledBy: adminId,
        cancellationReason: reason,
      },
    });
    return count === 1;
  });
}

/**
 * Admin reschedule: moves a Pending/Accepted session to [toStart, toEnd),
 * guarded so it only happens while it is still active, still at `fromStart`
 * and no tutor payout has been made.
 * @returns {Promise<boolean>} false when the session changed meanwhile.
 */
export async function rescheduleByAdmin({ sessionId, fromStart, toStart, toEnd }) {
  return prisma.$transaction(async (tx) => {
    const paidOut = await tx.payment.count({
      where: { sessionId, tutorPayoutStatus: { not: 'pending' } },
    });
    if (paidOut > 0) return false;

    const { count } = await tx.session.updateMany({
      where: { id: sessionId, status: { in: ['Pending', 'Accepted'] }, startTimestamp: fromStart },
      data: { startTimestamp: toStart, endTimestamp: toEnd },
    });
    return count === 1;
  });
}

/** Points the session at another Meet link (one shared with a back-to-back session). */
export async function updateMeetLink(sessionId, googleMeetLink) {
  await prisma.session.update({ where: { id: sessionId }, data: { googleMeetLink } });
}

/**
 * Other Pending/Accepted sessions of the same tutor with any of these students
 * that have not ended and own a Calendar event with a Meet: the ones whose
 * Meet a rescheduled session can share when they end up back to back.
 */
export async function findMeetSiblings({ sessionId, tutorId, studentIds, now = new Date() }) {
  if (!studentIds.length) return [];
  return prisma.session.findMany({
    where: {
      id: { not: sessionId },
      tutorId,
      status: { in: ['Pending', 'Accepted'] },
      endTimestamp: { gt: now },
      googleCalendarEventId: { not: null },
      googleMeetLink: { not: null },
      participants: { some: { studentId: { in: studentIds } } },
    },
    select: {
      id: true,
      startTimestamp: true,
      endTimestamp: true,
      googleMeetLink: true,
      googleCalendarEventId: true,
    },
    orderBy: { startTimestamp: 'asc' },
    take: 50,
  });
}

// ===== PARTICIPANTS =====

export async function addParticipant(sessionId, studentId) {
  return prisma.sessionParticipant.create({
    data: { sessionId, studentId },
    include: {
      student: { select: { id: true, name: true, email: true, profilePictureUrl: true, verifiedUniversity: true } },
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

  const [sessionsThisWeek, totalCompleted, activeCourses] = await Promise.all([
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
    prisma.session.groupBy({
      by: ['courseId'],
      where: {
        status: { notIn: ['Rejected', 'Canceled'] },
        participants: { some: { studentId } },
      },
    }),
  ]);

  const activeCoursesCount = activeCourses.length;

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
    },
  });
}
