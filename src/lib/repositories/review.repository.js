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
 * Update tutor profile with aggregated review stats
 * (called when a new review is completed/updated)
 */
export async function updateTutorReviewStats(tutorId) {
  try {
    const stats = await getAverageScore(tutorId);
    
    // Always update tutor profile (even if count is 0)
    const updated = await prisma.tutorProfile.update({
      where: { userId: tutorId },
      data: {
        review: Math.round((Number(stats.average) || 0) * 100) / 100,
        numReview: stats.count,
      },
    });
    
    return updated;
  } catch (err) {
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
 * Create a pending review (null score/comment) for a session.
 * Used internally when a session is completed to auto-create review placeholders.
 * Returns silently if review already exists (idempotent).
 */
export async function createPendingReview(sessionId, reviewerId, revieweeId) {
  try {
    return await prisma.review.create({
      data: {
        sessionId,
        reviewerId,
        revieweeId,
        score: null,
        comment: null,
      },
      include: {
        reviewer: { select: { id: true, name: true, profilePictureUrl: true } },
        reviewee: { select: { id: true, name: true, profilePictureUrl: true } },
      },
    });
  } catch (err) {
    // If review already exists (unique constraint), return silently
    if (err.code === 'P2002') {
      return null;
    }
    throw err;
  }
}
