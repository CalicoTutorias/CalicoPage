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
 */
export async function findReviewsReceived(tutorId, limit = 50) {
  return prisma.review.findMany({
    where: { tutorId },
    include: {
      student: { select: { id: true, name: true, profilePictureUrl: true } },
      session: { select: { id: true, courseId: true, course: { select: { name: true } } } },
    },
    orderBy: { id: 'desc' },
    take: limit,
  });
}

/**
 * Get all reviews written by a student.
 */
export async function findReviewsWritten(studentId, limit = 50) {
  return prisma.review.findMany({
    where: { studentId },
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
    // Update existing review
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
      },
    });
  }

  // Create new review
  return prisma.review.create({
    data: {
      sessionId: data.sessionId,
      studentId: data.studentId,
      tutorId: data.tutorId,
      rating: data.rating ?? null,
      status: data.status ?? 'pending',
      comment: data.comment ?? null,
    },
    include: {
      student: { select: { id: true, name: true, profilePictureUrl: true } },
      tutor: { select: { id: true, name: true, profilePictureUrl: true } },
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
 * Create a pending review placeholder for a session (student → tutor).
 * Idempotent — safe to call multiple times for the same session.
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
