/**
 * Student Review Repository
 * Handles database operations for tutor→student reviews (PostgreSQL via Prisma).
 *
 * Model: StudentReview (tutorId = reviewer, studentId = reviewee, tied to a Session).
 * PRIVACY: these reviews are never public. The aggregate lives denormalized on
 * users.student_rating / users.student_rating_count (stripped from generic user
 * fetches by user.repository sanitize) and is only attached to tutor-facing
 * session payloads, the owner's own-rating endpoint, and admin views.
 */

import prisma from '../prisma';

export async function findById(id) {
  return prisma.studentReview.findUnique({
    where: { id },
    include: {
      tutor: { select: { id: true, name: true, profilePictureUrl: true } },
      student: { select: { id: true, name: true, profilePictureUrl: true } },
    },
  });
}

/**
 * All student reviews for a session (admin / internal use — includes comments).
 */
export async function findBySession(sessionId) {
  return prisma.studentReview.findMany({
    where: { sessionId },
    include: {
      tutor: { select: { id: true, name: true, profilePictureUrl: true } },
      student: { select: { id: true, name: true, profilePictureUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Reviews written by a tutor for one session (edit prefill / pending state).
 * Safe to return to that tutor: they authored them.
 */
export async function findBySessionForTutor(sessionId, tutorId) {
  return prisma.studentReview.findMany({
    where: { sessionId, tutorId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Batch variant for tutor session lists: all reviews this tutor wrote across
 * many sessions, in a single query. Returns a Map keyed by sessionId.
 */
export async function findBySessionIdsForTutor(sessionIds, tutorId) {
  const map = new Map();
  if (!sessionIds || sessionIds.length === 0) return map;
  const rows = await prisma.studentReview.findMany({
    where: { sessionId: { in: sessionIds }, tutorId },
    orderBy: { createdAt: 'asc' },
  });
  for (const r of rows) {
    if (!map.has(r.sessionId)) map.set(r.sessionId, []);
    map.get(r.sessionId).push(r);
  }
  return map;
}

/**
 * Reviews received by a student (admin moderation view — includes comments,
 * tutor identity and session course).
 */
export async function findReceivedByStudent(studentId, limit = 50) {
  return prisma.studentReview.findMany({
    where: { studentId, status: 'done' },
    include: {
      tutor: { select: { id: true, name: true, profilePictureUrl: true } },
      session: { select: { id: true, startTimestamp: true, course: { select: { id: true, name: true, code: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Create or update a tutor→student review. Unlike the legacy reviews table,
 * student_reviews was born with its compound unique constraint, so we can use
 * Prisma's native atomic upsert.
 */
export async function upsertStudentReview({ sessionId, tutorId, studentId, rating, status, comment }) {
  return prisma.studentReview.upsert({
    where: {
      sessionId_tutorId_studentId: { sessionId, tutorId, studentId },
    },
    update: {
      rating: rating ?? undefined,
      status: status ?? undefined,
      comment: comment ?? undefined,
    },
    create: {
      sessionId,
      tutorId,
      studentId,
      rating: rating ?? null,
      status: status ?? 'pending',
      comment: comment ?? null,
    },
    include: {
      student: { select: { id: true, name: true, profilePictureUrl: true } },
    },
  });
}

/**
 * Create a pending placeholder (null rating) — used by completeSession.
 * Idempotent: if a row already exists it is left untouched (update with all
 * undefined fields is a no-op write of the same values).
 */
export async function createPendingStudentReview(sessionId, tutorId, studentId) {
  return prisma.studentReview.upsert({
    where: {
      sessionId_tutorId_studentId: { sessionId, tutorId, studentId },
    },
    update: {},
    create: { sessionId, tutorId, studentId, rating: null, status: 'pending', comment: null },
  });
}

/**
 * Recompute the student's denormalized aggregate (users.student_rating /
 * student_rating_count) from scratch inside a transaction — same proven
 * pattern as review.repository.updateTutorReviewStats, so edits stay
 * consistent under concurrency.
 */
export async function updateStudentRatingStats(studentId) {
  try {
    return await prisma.$transaction(async (tx) => {
      const reviews = await tx.studentReview.findMany({
        where: { studentId, status: 'done', rating: { not: null } },
        select: { rating: true },
      });

      let newAverage = 0;
      const newCount = reviews.length;
      if (newCount > 0) {
        const total = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);
        newAverage = Math.round((total / newCount) * 100) / 100;
      }

      return tx.user.update({
        where: { id: studentId },
        data: {
          studentRating: newAverage,
          studentRatingCount: newCount,
        },
        select: { id: true, studentRating: true, studentRatingCount: true },
      });
    });
  } catch (err) {
    console.error(`[StudentReview] Error updating student stats for ${studentId}:`, err.message);
    throw err;
  }
}

/**
 * Denormalized aggregate for one user — used for the owner's own-rating
 * endpoint. Returns { average, count }.
 */
export async function getStudentRating(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { studentRating: true, studentRatingCount: true },
  });
  if (!user) return null;
  return {
    average: Number(user.studentRating) || 0,
    count: user.studentRatingCount || 0,
  };
}

/**
 * Batch read of denormalized aggregates for many students in one query.
 * Used to enrich tutor-facing session payloads. Returns a Map keyed by userId.
 */
export async function getStudentRatingsMap(studentIds) {
  const map = new Map();
  if (!studentIds || studentIds.length === 0) return map;
  const rows = await prisma.user.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, studentRating: true, studentRatingCount: true },
  });
  for (const u of rows) {
    map.set(u.id, {
      average: Number(u.studentRating) || 0,
      count: u.studentRatingCount || 0,
    });
  }
  return map;
}
