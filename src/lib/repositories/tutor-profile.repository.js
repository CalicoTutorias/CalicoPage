/**
 * Tutor Profile Repository
 * Handles database operations for tutor profile and cached statistics.
 *
 * Model: TutorProfile
 */

import prisma from '../prisma';

/**
 * Get tutor profile by user ID
 */
export async function findByUserId(userId) {
  return prisma.tutorProfile.findUnique({
    where: { userId },
  });
}

/**
 * Update tutor profile fields
 */
export async function update(userId, data) {
  return prisma.tutorProfile.update({
    where: { userId },
    data,
  });
}

/**
 * Increment tutor session count and total earnings
 * Called when a completed session payment is confirmed
 *
 * @param {string} tutorId - Tutor user ID
 * @param {number} amount - Amount to add to totalEarning
 */
export async function incrementStats(tutorId, amount) {
  return prisma.tutorProfile.update({
    where: { userId: tutorId },
    data: {
      numSessions: { increment: 1 },
      totalEarning: { increment: amount },
    },
  });
}

/**
 * Decrement tutor session count and total earnings
 * Called when a session is cancelled and payment is refunded
 *
 * @param {string} tutorId - Tutor user ID
 * @param {number} amount - Amount to subtract from totalEarning
 */
export async function decrementStats(tutorId, amount) {
  return prisma.tutorProfile.update({
    where: { userId: tutorId },
    data: {
      numSessions: { decrement: 1 },
      totalEarning: { decrement: amount },
    },
  });
}

/**
 * Update cached review statistics
 * Called when review is created/updated
 *
 * @param {string} tutorId - Tutor user ID
 * @param {number} avgRating - New average rating
 * @param {number} reviewCount - Total number of reviews
 */
export async function updateReviewStats(tutorId, avgRating, reviewCount) {
  return prisma.tutorProfile.update({
    where: { userId: tutorId },
    data: {
      review: avgRating,
      numReview: reviewCount,
    },
  });
}
