/**
 * Student Review Repository
 * Handles database operations for tutor→student reviews (PostgreSQL via Prisma).
 *
 * Model: StudentReview (tutorId = reviewer, studentId = reviewee, tied to a Session).
 *
 * PRIVACY MODEL (enforced at the column-selection boundary, not just the route):
 *  - The review TEXT (`comment`) and the per-session `rating` are sensitive. They
 *    are selected ONLY by admin-facing methods (`findReceivedByStudent`,
 *    `findBySession`). No tutor-facing method ever projects `comment`.
 *  - Tutor-facing reads expose ONLY `{ studentId, status }` (the "who's left to
 *    rate" projection). This is what makes the write-only rule hold even if a
 *    tutor crafts a request by hand: the content never leaves Postgres towards a
 *    tutor context.
 *  - Reviews are WRITE-ONCE: a `pending` placeholder transitions to `done`
 *    exactly once (see {@link publishStudentReview}); a published row is immutable.
 *  - The aggregate lives denormalized on users.student_rating /
 *    users.student_rating_count (stripped from generic user fetches by
 *    user.repository sanitize) and is only surfaced as a number.
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
 * All student reviews for a session (ADMIN / internal use — includes comments).
 * Never call from a tutor-scoped path.
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
 * Content-free status projection for ONE session, scoped to the calling tutor.
 * Returns `[{ studentId, status }]` — no rating, no comment. Powers the
 * "which of my students are still pending to rate" UI without leaking content.
 */
export async function findStatusBySessionForTutor(sessionId, tutorId) {
  const rows = await prisma.studentReview.findMany({
    where: { sessionId, tutorId },
    select: { studentId: true, status: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({ studentId: r.studentId, status: r.status }));
}

/**
 * Batch content-free status projection across many sessions for one tutor.
 * Returns a Map keyed by sessionId → `[{ studentId, status }]`. Single query.
 */
export async function findStatusBySessionIdsForTutor(sessionIds, tutorId) {
  const map = new Map();
  if (!sessionIds || sessionIds.length === 0) return map;
  const rows = await prisma.studentReview.findMany({
    where: { sessionId: { in: sessionIds }, tutorId },
    select: { sessionId: true, studentId: true, status: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const r of rows) {
    if (!map.has(r.sessionId)) map.set(r.sessionId, []);
    map.get(r.sessionId).push({ studentId: r.studentId, status: r.status });
  }
  return map;
}

/**
 * Reviews received by a student (ADMIN moderation view — includes comments,
 * tutor identity and the session's course). Must only be called behind
 * requireAdminUser.
 *
 * Optional filter by materia is applied through the EXISTING session→course
 * relation (`session: { courseId }`) — there is no `courseId` column on
 * student_reviews. The course is reached via the Session table, so the model
 * stays normalized (no redundant/denormalized course copy).
 *
 * @param {string} studentId
 * @param {{ limit?: number, courseId?: string }} [options]
 */
export async function findReceivedByStudent(studentId, { limit = 50, courseId } = {}) {
  return prisma.studentReview.findMany({
    where: {
      studentId,
      status: 'done',
      ...(courseId ? { session: { courseId } } : {}),
    },
    include: {
      tutor: { select: { id: true, name: true, profilePictureUrl: true } },
      session: { select: { id: true, startTimestamp: true, course: { select: { id: true, name: true, code: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Distinct materias a student has been reviewed in — powers the admin
 * moderation filter. Resolved through the session→course relation (NO
 * denormalized course column on student_reviews), deduped in memory.
 *
 * @param {string} studentId
 * @returns {Promise<Array<{ id: string, name: string, code: string }>>}
 */
export async function findReviewedCoursesByStudent(studentId) {
  const rows = await prisma.studentReview.findMany({
    where: { studentId, status: 'done' },
    select: {
      session: { select: { course: { select: { id: true, name: true, code: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const seen = new Map();
  for (const r of rows) {
    const course = r.session?.course;
    if (course && !seen.has(course.id)) seen.set(course.id, course);
  }
  return [...seen.values()];
}

/**
 * Publish a tutor→student review WRITE-ONCE.
 *
 * A review is published exactly once and is then immutable:
 *  - `pending` placeholder (created at session completion) → one-way transition
 *    to `done` with the rating/comment.
 *  - No placeholder (session completed before the feature existed) → insert a
 *    fresh `done` row.
 *  - Already `done` → throw ALREADY_REVIEWED (the tutor cannot edit, and — by the
 *    write-only rule — cannot read back what they wrote either).
 *
 * Atomic + race-tolerant: the whole decision runs in a transaction and a
 * concurrent double-publish surfaces as a unique-constraint violation (P2002),
 * which we normalize to ALREADY_REVIEWED. Returns nothing sensitive.
 *
 * @returns {Promise<{ status: 'done' }>}
 */
export async function publishStudentReview({ sessionId, tutorId, studentId, rating, comment }) {
  const where = { sessionId_tutorId_studentId: { sessionId, tutorId, studentId } };
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.studentReview.findUnique({
        where,
        select: { id: true, status: true },
      });

      if (existing?.status === 'done') {
        const err = new Error('Esta calificación ya fue publicada y no puede modificarse');
        err.code = 'ALREADY_REVIEWED';
        throw err;
      }

      if (existing) {
        await tx.studentReview.update({
          where,
          data: { rating, status: 'done', comment: comment ?? null },
        });
      } else {
        await tx.studentReview.create({
          data: { sessionId, tutorId, studentId, rating, status: 'done', comment: comment ?? null },
        });
      }
    });
  } catch (err) {
    if (err.code === 'P2002') {
      const e = new Error('Esta calificación ya fue publicada y no puede modificarse');
      e.code = 'ALREADY_REVIEWED';
      throw e;
    }
    throw err;
  }

  return { status: 'done' };
}

/**
 * Create a pending placeholder (null rating) — used by completeSession.
 * Idempotent: if a row already exists it is left untouched.
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
 * pattern as review.repository.updateTutorReviewStats, so the write-once
 * publish stays consistent under concurrency.
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
