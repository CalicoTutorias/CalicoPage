/**
 * Student Review Service
 * Business logic for tutor→student reviews (reciprocal rating, estilo Uber).
 *
 * Rules (mirror of review.service for the opposite direction):
 * - Only sessions that already ended and were not Canceled/Rejected can be reviewed.
 * - Reviewer must be the session's assigned tutor.
 * - Reviewee must be a participant of that session.
 * - WRITE-ONCE: one review per (session, tutor, student), published once and then
 *   immutable. The tutor cannot edit it and — by the write-only rule — cannot read
 *   it back either.
 *
 * Visibility: the individual review (rating + comment) is NEVER returned to the
 * tutor. It is readable only by admins (moderation). Students see only their
 * aggregate number. Tutors can only query the content-free status of which
 * students they still have pending to rate.
 */

import * as studentReviewRepo from '../repositories/student-review.repository';
import * as sessionRepo from '../repositories/session.repository';

/**
 * Publish a tutor→student review for a finished session (write-once).
 * Returns only a status flag — never the stored comment/rating.
 *
 * @returns {Promise<{ status: 'done' }>}
 * @throws  err.code ALREADY_REVIEWED when a published review already exists.
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

  // 5. Publish write-once (throws ALREADY_REVIEWED if previously published),
  // then recompute the student's denormalized aggregate.
  const result = await studentReviewRepo.publishStudentReview({
    sessionId,
    tutorId,
    studentId,
    rating,
    comment: comment || null,
  });

  await studentReviewRepo.updateStudentRatingStats(studentId);

  // Deliberately NO notification to the student: the per-session rating is
  // private (Uber-style). The student only ever sees their aggregate.

  return result; // { status: 'done' }
}

/**
 * Content-free list of the tutor's rating status for a session:
 * `[{ studentId, status }]`. Powers the "rate your students" UI (which students
 * remain pending) WITHOUT exposing any rating or comment. Safe for tutors.
 */
export async function getPendingStudentTargetsForTutor(sessionId, tutorId) {
  return studentReviewRepo.findStatusBySessionForTutor(sessionId, tutorId);
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
 * and tutor identity. Optionally filtered by materia through the session→course
 * relation (normalized — no course column on student_reviews). Must only be
 * called behind requireAdminUser.
 *
 * @param {string} studentId
 * @param {{ courseId?: string, limit?: number }} [options]
 */
export async function getStudentReviewsReceived(studentId, { courseId, limit = 50 } = {}) {
  return studentReviewRepo.findReceivedByStudent(studentId, { courseId, limit });
}

/**
 * Distinct materias a student has been reviewed in — for the admin filter.
 * Admin-only. Resolved via the session→course relation.
 */
export async function getReviewedCoursesAsStudent(studentId) {
  return studentReviewRepo.findReviewedCoursesByStudent(studentId);
}
