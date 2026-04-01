/**
 * Review Service
 * Business logic for bidirectional reviews (student ↔ tutor).
 *
 * Rules:
 * - Only Completed sessions can be reviewed.
 * - Reviewer must be a participant (tutor or student in SessionParticipant).
 * - Reviewee must also be a participant (cross-review only, no self-review).
 * - One review per (session, reviewer, reviewee) — upsert on duplicate.
 */

import * as reviewRepo from '../repositories/review.repository';
import * as sessionRepo from '../repositories/session.repository';

/**
 * Create or update a review for a completed session.
 */
export async function createReview(sessionId, reviewerId, { revieweeId, score, comment }) {
  // 1. Load the session
  const session = await sessionRepo.findById(sessionId);
  if (!session) {
    const err = new Error('Session not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // 2. Only completed sessions
  if (session.status !== 'Completed') {
    const err = new Error('Solo se pueden calificar sesiones completadas');
    err.code = 'SESSION_NOT_COMPLETED';
    throw err;
  }

  // 3. No self-review
  if (reviewerId === revieweeId) {
    const err = new Error('No puedes calificarte a ti mismo');
    err.code = 'SELF_REVIEW';
    throw err;
  }

  // 4. Verify reviewer is a participant
  const isTutor = session.tutorId === reviewerId;
  const isStudent = session.participants?.some((p) => p.studentId === reviewerId);
  if (!isTutor && !isStudent) {
    const err = new Error('No participaste en esta sesión');
    err.code = 'NOT_PARTICIPANT';
    throw err;
  }

  // 5. Verify reviewee is a valid counterpart
  const revieweeIsTutor = session.tutorId === revieweeId;
  const revieweeIsStudent = session.participants?.some((p) => p.studentId === revieweeId);
  if (!revieweeIsTutor && !revieweeIsStudent) {
    const err = new Error('El usuario calificado no participó en esta sesión');
    err.code = 'REVIEWEE_NOT_PARTICIPANT';
    throw err;
  }

  // 6. Cross-review: student reviews tutor, tutor reviews student
  if (isTutor && revieweeIsTutor) {
    const err = new Error('Como tutor, solo puedes calificar a los estudiantes de la sesión');
    err.code = 'INVALID_REVIEWEE';
    throw err;
  }
  if (isStudent && !isTutor && revieweeIsStudent && !revieweeIsTutor) {
    const err = new Error('Como estudiante, solo puedes calificar al tutor de la sesión');
    err.code = 'INVALID_REVIEWEE';
    throw err;
  }

  // 7. Check for duplicate (informational — upsert handles it, but we can warn)
  const alreadyExists = await reviewRepo.hasReviewed(sessionId, reviewerId, revieweeId);

  // 8. Upsert the review
  const review = await reviewRepo.upsertReview({
    sessionId,
    reviewerId,
    revieweeId,
    score,
    comment: comment || null,
  });

  return {
    review,
    updated: alreadyExists,
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
