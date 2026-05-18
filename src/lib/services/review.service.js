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
  // 0. Validate rating is in valid range (1-5)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    const err = new Error('La calificación debe ser un número entero entre 1 y 5');
    err.code = 'INVALID_RATING';
    throw err;
  }

  // 1. Load the session
  const session = await sessionRepo.findById(sessionId);
  if (!session) {
    const err = new Error('Session not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // 2. Validate session is eligible for rating
  const now = new Date();
  if (new Date(session.endTimestamp) > now) {
    const err = new Error('La sesión aún no ha terminado');
    err.code = 'SESSION_NOT_ENDED';
    throw err;
  }
  if (session.status === 'Canceled' || session.status === 'Rejected') {
    const err = new Error('No se puede calificar una sesión cancelada o rechazada');
    err.code = 'SESSION_NOT_ELIGIBLE';
    throw err;
  }

  // 3. Verify student participated in this session
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

  // 4. Look up the student's existing review for this session (if any).
  // A previously-submitted review is allowed to be edited — the student can
  // change their rating/comment from the history page. updateTutorReviewStats
  // recomputes the aggregate from scratch, so edits stay consistent.
  const existingReview = await reviewRepo.findBySession(sessionId);
  const studentReview = existingReview?.find(
    (r) => r.sessionId === sessionId && r.studentId === studentId && r.tutorId === tutorId
  );
  const wasAlreadyDone = studentReview?.status === 'done';

  // 5. Update the review with rating and mark as done (ReviewStatusEnum)
  // and update tutor stats atomically.
  // Pass session.courseId so the denormalized field gets populated when the
  // review is created (existing rows already have it via backfill migration).
  const review = await reviewRepo.upsertReview({
    sessionId,
    studentId,
    tutorId,
    courseId: session.courseId,
    rating,
    status: 'done',
    comment: comment || null,
  });

  // 6. Update tutor profile with aggregated review stats (atomic transaction)
  await reviewRepo.updateTutorReviewStats(tutorId);

  // 7. Notify tutor only on the FIRST submission, not on subsequent edits,
  // to avoid spamming the tutor every time the student tweaks their review.
  if (!wasAlreadyDone) {
    const student = await userRepo.findById(studentId);
    notificationService.notifyReviewReceived(tutorId, student?.name || 'Un estudiante', rating, sessionId);
  }

  return {
    review,
    updated: wasAlreadyDone,
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

/**
 * Paginated reviews received by a tutor, optionally filtered by course.
 * @returns {{ items: Array, total: number }}
 */
export async function getReviewsReceivedPaginated(tutorId, options = {}) {
  return reviewRepo.findReviewsReceivedPaginated(tutorId, options);
}

/**
 * Per-tutor + per-course rating aggregate. Useful for the tutor detail page
 * subjects breakdown and the comparative search-by-materia view.
 */
export async function getRatingByCourse(tutorId, courseId) {
  return reviewRepo.getRatingByCourse(tutorId, courseId);
}

/** Bulk variant: aggregates for many courses in a single query. */
export async function getRatingByCourseMap(tutorId, courseIds) {
  return reviewRepo.getRatingByCourseMap(tutorId, courseIds);
}
