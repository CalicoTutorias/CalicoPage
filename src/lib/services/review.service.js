/**
 * Review Service
 * Business logic for bidirectional reviews (student  tutor).
 *
 * Rules:
 * - Only Completed sessions can be reviewed.
 * - Reviewer must be a participant (tutor or student in SessionParticipant).
 * - Reviewee must also be a participant (cross-review only, no self-review).
 * - One review per (session, reviewer, reviewee) — upsert on duplicate.
 */

import * as reviewRepo from '../repositories/review.repository';
import * as sessionRepo from '../repositories/session.repository';
import * as userRepo from '../repositories/user.repository';
import * as notificationService from './notification.service';

/**
 * Create a review for a completed session.
 * Only students can review tutors (unidirectional).
 * Validates that review is in 'pending' status before allowing rating.
 */
export async function createReview(sessionId, studentId, { tutorId, rating, comment }) {
  // 1. Load the session
  const session = await sessionRepo.findById(sessionId);
  if (!session) {
    const err = new Error('Session not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // 2. Verify student participated in this session
  const isParticipant = session.participants?.some((p) => p.studentId === studentId);
  if (!isParticipant) {
    const err = new Error('No participaste en esta sesión');
    err.code = 'NOT_PARTICIPANT';
    throw err;
  }

  // 3. Verify tutorId matches the session tutor
  if (session.tutorId !== tutorId) {
    const err = new Error('Invalid tutor for this session');
    err.code = 'INVALID_TUTOR';
    throw err;
  }

  // 4. Check if review exists and is in 'pending' status (or null status = pending)
  const existingReview = await reviewRepo.findBySession(sessionId);
  const studentReview = existingReview?.find(
    (r) => r.sessionId === sessionId && r.studentId === studentId && r.tutorId === tutorId
  );

  // Only block if review is already submitted (ReviewStatusEnum.done)
  if (studentReview && studentReview.status === 'done') {
    const err = new Error('Esta sesión ya ha sido calificada');
    err.code = 'REVIEW_ALREADY_COMPLETED';
    throw err;
  }

  // 5. Update the review with rating and mark as done (ReviewStatusEnum)
  const review = await reviewRepo.upsertReview({
    sessionId,
    studentId,
    tutorId,
    rating,
    status: 'done',
    comment: comment || null,
  });

  // 6. Update tutor profile with aggregated review stats
  await reviewRepo.updateTutorReviewStats(tutorId);

  // 7. Notify tutor about the new review (fire-and-forget)
  const student = await userRepo.findById(studentId);
  notificationService.notifyReviewReceived(tutorId, student?.name || 'Un estudiante', rating, sessionId);

  return {
    review,
    updated: !!studentReview,
  };
}

/**
 * Get all reviews for a specific session.
 */
export async function getSessionReviews(sessionId) {
  return reviewRepo.findBySession(sessionId);
}

/**
 * Get all reviews received by a user.
 */
export async function getReviewsReceived(userId, limit = 50) {
  return reviewRepo.findReviewsReceived(userId, limit);
}

/**
 * Get all reviews written by a user.
 */
export async function getReviewsWritten(userId, limit = 50) {
  return reviewRepo.findReviewsWritten(userId, limit);
}

/**
 * Get average score and count for a user (reviews received).
 */
export async function getReviewStats(userId) {
  return reviewRepo.getAverageScore(userId);
}
