/**
 * Review Repository
 * Handles database operations for bidirectional reviews (PostgreSQL via Prisma).
 *
 * Model: Review (reviewerId → revieweeId, tied to a Session)
 */

import prisma from '../prisma';

export async function findById(id) {
  return prisma.review.findUnique({
    where: { id },
    include: {
      reviewer: { select: { id: true, name: true, email: true, profilePictureUrl: true } },
      reviewee: { select: { id: true, name: true, email: true, profilePictureUrl: true } },
      session: true,
    },
  });
}

export async function findBySession(sessionId) {
  return prisma.review.findMany({
    where: { sessionId },
    include: {
      reviewer: { select: { id: true, name: true, email: true, profilePictureUrl: true } },
      reviewee: { select: { id: true, name: true, email: true, profilePictureUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get all reviews received by a user (e.g. a tutor's ratings from students).
 */
export async function findReviewsReceived(revieweeId, limit = 50) {
  return prisma.review.findMany({
    where: { revieweeId },
    include: {
      reviewer: { select: { id: true, name: true, profilePictureUrl: true } },
      session: { select: { id: true, courseId: true, course: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Get all reviews written by a user.
 */
export async function findReviewsWritten(reviewerId, limit = 50) {
  return prisma.review.findMany({
    where: { reviewerId },
    include: {
      reviewee: { select: { id: true, name: true, profilePictureUrl: true } },
      session: { select: { id: true, courseId: true, course: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Create or update a review (unique on sessionId + reviewerId + revieweeId).
 */
export async function upsertReview(data) {
  return prisma.review.upsert({
    where: {
      sessionId_reviewerId_revieweeId: {
        sessionId: data.sessionId,
        reviewerId: data.reviewerId,
        revieweeId: data.revieweeId,
      },
    },
    update: {
      score: data.score,
      comment: data.comment ?? null,
    },
    create: {
      sessionId: data.sessionId,
      reviewerId: data.reviewerId,
      revieweeId: data.revieweeId,
      score: data.score,
      comment: data.comment ?? null,
    },
    include: {
      reviewer: { select: { id: true, name: true, profilePictureUrl: true } },
      reviewee: { select: { id: true, name: true, profilePictureUrl: true } },
    },
  });
}

export async function deleteReview(id) {
  await prisma.review.delete({ where: { id } });
}

/**
 * Calculate average score received by a user across all their reviews.
 */
export async function getAverageScore(revieweeId) {
  const result = await prisma.review.aggregate({
    where: { revieweeId },
    _avg: { score: true },
    _count: { score: true },
  });

  return {
    average: result._avg.score ?? 0,
    count: result._count.score,
  };
}

/**
 * Check if a specific reviewer has already reviewed a specific reviewee for a session.
 */
export async function hasReviewed(sessionId, reviewerId, revieweeId) {
  const count = await prisma.review.count({
    where: { sessionId, reviewerId, revieweeId },
  });
  return count > 0;
}
