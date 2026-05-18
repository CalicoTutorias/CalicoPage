/**
 * Review Repository
 * Handles database operations for student→tutor reviews (PostgreSQL via Prisma).
 *
 * Model: Review (studentId → tutorId, rating instead of score, tied to a Session)
 */

import prisma from '../prisma';

export async function findById(id) {
  return prisma.review.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true, email: true, profilePictureUrl: true } },
      tutor: { select: { id: true, name: true, email: true, profilePictureUrl: true } },
      session: true,
    },
  });
}

export async function findBySession(sessionId) {
  return prisma.review.findMany({
    where: { sessionId },
    include: {
      student: { select: { id: true, name: true, email: true, profilePictureUrl: true } },
      tutor: { select: { id: true, name: true, email: true, profilePictureUrl: true } },
    },
    orderBy: { id: 'desc' }, // Temporary: using id instead of createdAt until DB migration completes
  });
}

/**
 * Get all reviews received by a tutor (ratings from students).
 * Excludes reviews from canceled sessions.
 * Returns an array — kept stable for legacy callers.
 */
export async function findReviewsReceived(tutorId, limit = 50) {
  return prisma.review.findMany({
    where: {
      tutorId,
      status: 'done',
    },
    include: {
      student: { select: { id: true, name: true, profilePictureUrl: true } },
      course: { select: { id: true, name: true, code: true } },
      session: { select: { id: true, courseId: true, course: { select: { name: true } } } },
    },
    orderBy: { id: 'desc' },
    take: limit,
  });
}

/**
 * Paginated, filterable variant for the tutor detail page.
 * Returns { items, total } so the caller can render pagination controls.
 *
 * @param {string} tutorId
 * @param {object} options
 * @param {string|null} options.courseId - filter to a single course
 * @param {number}      options.limit    - page size
 * @param {number}      options.offset   - rows to skip
 * @param {'recent'|'highest'|'lowest'} options.sort
 */
export async function findReviewsReceivedPaginated(tutorId, {
  courseId = null,
  limit = 10,
  offset = 0,
  sort = 'recent',
} = {}) {
  const where = {
    tutorId,
    status: 'done',
    ...(courseId ? { courseId } : {}),
  };

  // 'recent' uses id desc as a stable proxy until createdAt lands on Review.
  // Tiebreakers on id keep ordering deterministic across pages.
  const orderBy =
    sort === 'highest'
      ? [{ rating: 'desc' }, { id: 'desc' }]
      : sort === 'lowest'
        ? [{ rating: 'asc' }, { id: 'desc' }]
        : [{ id: 'desc' }];

  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, profilePictureUrl: true } },
        course: { select: { id: true, name: true, code: true } },
      },
      orderBy,
      take: limit,
      skip: offset,
    }),
    prisma.review.count({ where }),
  ]);

  return { items, total };
}

/**
 * Per-tutor + per-course rating aggregate. Uses the (tutor_id, course_id, status)
 * index added in migration 20260509180000_add_review_course_id.
 */
export async function getRatingByCourse(tutorId, courseId) {
  const result = await prisma.review.aggregate({
    where: { tutorId, courseId, status: 'done', rating: { not: null } },
    _avg: { rating: true },
    _count: { id: true },
  });
  return {
    average: result._avg.rating ? Number(result._avg.rating) : 0,
    count: result._count.id,
  };
}

/**
 * Inverse of getRatingByCourseMap: per-tutor aggregates for one course
 * across many tutors. Used by the search-by-materia comparative view so
 * each card can show the tutor's rating in *that specific course*.
 * Returns a Map keyed by tutorId.
 */
export async function getRatingByTutorMap(courseId, tutorIds) {
  if (!tutorIds || tutorIds.length === 0) return new Map();
  const rows = await prisma.review.groupBy({
    by: ['tutorId'],
    where: {
      courseId,
      status: 'done',
      rating: { not: null },
      tutorId: { in: tutorIds },
    },
    _avg: { rating: true },
    _count: { id: true },
  });
  const map = new Map();
  for (const r of rows) {
    map.set(r.tutorId, {
      average: r._avg.rating ? Number(r._avg.rating) : 0,
      count: r._count.id,
    });
  }
  return map;
}

/**
 * Bulk variant: per-course aggregates for one tutor across many courses.
 * Used by the tutor detail page to render the subjects section in one query
 * instead of N round-trips. Returns a Map keyed by courseId.
 */
export async function getRatingByCourseMap(tutorId, courseIds) {
  if (!courseIds || courseIds.length === 0) return new Map();
  const rows = await prisma.review.groupBy({
    by: ['courseId'],
    where: {
      tutorId,
      status: 'done',
      rating: { not: null },
      courseId: { in: courseIds },
    },
    _avg: { rating: true },
    _count: { id: true },
  });
  const map = new Map();
  for (const r of rows) {
    map.set(r.courseId, {
      average: r._avg.rating ? Number(r._avg.rating) : 0,
      count: r._count.id,
    });
  }
  return map;
}

/**
 * Get all reviews written by a student.
 * Excludes reviews from canceled sessions.
 */
export async function findReviewsWritten(studentId, limit = 50) {
  return prisma.review.findMany({
    where: {
      studentId,
      status: 'done',
    },
    include: {
      tutor: { select: { id: true, name: true, profilePictureUrl: true } },
      session: { select: { id: true, courseId: true, course: { select: { name: true } } } },
    },
    orderBy: { id: 'desc' },
    take: limit,
  });
}

/**
 * Create or update a review (findFirst + update/create pattern).
 * Handles missing unique constraint gracefully.
 * When creating: sets status to 'pending'
 * When updating: allows updating rating/comment, defaults status to 'pending' if not provided
 */
export async function upsertReview(data) {
  // First, try to find existing review
  const existing = await prisma.review.findFirst({
    where: {
      sessionId: data.sessionId,
      studentId: data.studentId,
      tutorId: data.tutorId,
    },
  });

  if (existing) {
    // Update existing review (don't change courseId — it was set on create)
    return prisma.review.update({
      where: { id: existing.id },
      data: {
        rating: data.rating ?? undefined,
        status: data.status ?? undefined,
        comment: data.comment ?? undefined,
      },
      include: {
        student: { select: { id: true, name: true, profilePictureUrl: true } },
        tutor: { select: { id: true, name: true, profilePictureUrl: true } },
        course: { select: { id: true, name: true } },
      },
    });
  }

  // Create new review. courseId is required by the schema; if the caller did
  // not provide one, derive it from the parent session as a safety net.
  let courseId = data.courseId ?? null;
  if (!courseId) {
    const session = await prisma.session.findUnique({
      where: { id: data.sessionId },
      select: { courseId: true },
    });
    courseId = session?.courseId ?? null;
  }
  if (!courseId) {
    throw new Error(`Cannot create review: courseId missing and session ${data.sessionId} has no course`);
  }

  return prisma.review.create({
    data: {
      sessionId: data.sessionId,
      studentId: data.studentId,
      tutorId: data.tutorId,
      courseId,
      rating: data.rating ?? null,
      status: data.status ?? 'pending',
      comment: data.comment ?? null,
    },
    include: {
      student: { select: { id: true, name: true, profilePictureUrl: true } },
      tutor: { select: { id: true, name: true, profilePictureUrl: true } },
      course: { select: { id: true, name: true } },
    },
  });
}

export async function deleteReview(id) {
  await prisma.review.delete({ where: { id } });
}

/**
 * Calculate average rating received by a tutor across submitted reviews (ReviewStatusEnum.done).
 */
export async function getAverageScore(tutorId) {
  const result = await prisma.review.aggregate({
    where: { tutorId, status: 'done', rating: { not: null } },
    _avg: { rating: true },
    _count: { id: true },
  });

  return {
    average: result._avg.rating ?? 0,
    count: result._count.id,
  };
}

/**
 * Update tutor profile with aggregated review stats using atomic transaction.
 * Uses the incremental formula:
 * nuevo_promedio = ((promedio_actual × num_reviews_actual) + nueva_calificacion) / (num_reviews_actual + 1)
 *
 * This ensures atomicity and consistency even with concurrent requests.
 */
export async function updateTutorReviewStats(tutorId) {
  try {
    // Use transaction to ensure atomicity
    return await prisma.$transaction(async (tx) => {
      // 1. Get current tutor profile stats
      const tutorProfile = await tx.tutorProfile.findUnique({
        where: { userId: tutorId },
        select: { review: true, numReview: true },
      });

      if (!tutorProfile) {
        throw new Error(`Tutor profile not found for userId: ${tutorId}`);
      }

      // 2. Get all reviews for this tutor with status 'done'
      const reviews = await tx.review.findMany({
        where: { tutorId, status: 'done', rating: { not: null } },
        select: { rating: true },
      });

      // 3. Calculate new average using all reviews
      let newAverage = 0;
      let newCount = 0;

      if (reviews.length > 0) {
        const totalRating = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);
        newCount = reviews.length;
        newAverage = totalRating / newCount;
      }

      // 4. Round to 2 decimal places
      newAverage = Math.round(newAverage * 100) / 100;

      // 5. Update tutor profile atomically
      const updated = await tx.tutorProfile.update({
        where: { userId: tutorId },
        data: {
          review: newAverage,
          numReview: newCount,
        },
      });

      return updated;
    });
  } catch (err) {
    console.error(`[Review] Error updating tutor stats for ${tutorId}:`, err.message);
    throw err;
  }
}

/**
 * Check if a student has already reviewed a tutor for a session.
 */
export async function hasReviewed(sessionId, studentId, tutorId) {
  const count = await prisma.review.count({
    where: { sessionId, studentId, tutorId },
  });
  return count > 0;
}

/**
 * Update all pending reviews for a session to a new status (e.g., 'Canceled')
 */
export async function updateReviewsBySessionStatus(sessionId, newStatus) {
  return prisma.review.updateMany({
    where: { sessionId, status: 'pending' },
    data: { status: newStatus },
  });
}

/**
 * Create a pending review (null score/comment) for a session.
 * Used internally when a session is completed to auto-create review placeholders.
 * Returns silently if review already exists (idempotent).
 */
export async function createPendingReview(sessionId, studentId, tutorId) {
  return upsertReview({
    sessionId,
    studentId,
    tutorId,
    rating: null,
    status: 'pending',
    comment: null,
  });
}
