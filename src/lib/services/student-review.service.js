/**
 * Student Review Service
 * Business logic for tutor→student reviews (reciprocal rating, estilo Uber).
 *
 * Rules (mirror of review.service for the opposite direction):
 * - Only sessions that already ended and were not Canceled/Rejected can be reviewed.
 * - Reviewer must be the session's assigned tutor.
 * - Reviewee must be a participant of that session.
 * - One review per (session, tutor, student) — upsert on duplicate (editable).
 *
 * Visibility: the individual review (incl. comment) is only for the tutor who
 * wrote it and for admins. Students only ever see their aggregate number.
 */

import * as studentReviewRepo from '../repositories/student-review.repository';
import * as sessionRepo from '../repositories/session.repository';

/**
 * Create or edit a tutor→student review for a finished session.
 */
export async function createStudentReview(sessionId, tutorId, { studentId, rating, comment }) {
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

  // 3. Reviewer must be the session's tutor
  if (session.tutorId !== tutorId) {
    const err = new Error('Solo el tutor asignado puede calificar a los estudiantes de esta sesión');
    err.code = 'NOT_SESSION_TUTOR';
    throw err;
  }

  // 4. Reviewee must be a participant of this session
  const isParticipant = session.participants?.some((p) => p.studentId === studentId);
  if (!isParticipant) {
    const err = new Error('El estudiante no participó en esta sesión');
    err.code = 'INVALID_STUDENT';
    throw err;
  }

  // 5. Track whether this is an edit (used by the API for the status code).
  const existing = await studentReviewRepo.findBySessionForTutor(sessionId, tutorId);
  const wasAlreadyDone = existing.some((r) => r.studentId === studentId && r.status === 'done');

  // 6. Upsert with rating and mark as done, then recompute the student's
  // denormalized aggregate (transactional, recomputed from scratch so edits
  // stay consistent).
  const review = await studentReviewRepo.upsertStudentReview({
    sessionId,
    tutorId,
    studentId,
    rating,
    status: 'done',
    comment: comment || null,
  });

  await studentReviewRepo.updateStudentRatingStats(studentId);

  // Deliberately NO notification to the student: the per-session rating is
  // private (Uber-style). The student only ever sees their aggregate.

  return { review, updated: wasAlreadyDone };
}

/**
 * Reviews the tutor wrote for one session (pending placeholders + done) —
 * powers the "rate your students" UI state and edit prefill.
 */
export async function getSessionStudentReviewsForTutor(sessionId, tutorId) {
  return studentReviewRepo.findBySessionForTutor(sessionId, tutorId);
}

/**
 * The caller's own aggregate as a student: { average, count }. Number only —
 * comments are never exposed here.
 */
export async function getOwnStudentRating(userId) {
  return studentReviewRepo.getStudentRating(userId);
}

/**
 * Admin moderation view: reviews received by a student, including comments
 * and tutor identity. Must only be called behind requireAdminUser.
 */
export async function getStudentReviewsReceived(studentId, limit = 50) {
  return studentReviewRepo.findReceivedByStudent(studentId, limit);
}
