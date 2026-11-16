import * as notifyRepo from '../repositories/course-notify.repository';
import * as academicRepo from '../repositories/academic.repository';
import * as userRepo from '../repositories/user.repository';
import { sendCourseAvailableNotificationEmail } from './email.service';
import {
  countListedTutorsForCourse,
  countListedTutorsForCourses,
} from './tutor-listing.service';

const ALLOWED_SOURCES = new Set(['course_card', 'course_detail', 'unknown']);

// "Disponible" = visible para estudiantes (misma regla que el listado de
// tutores). Así el "Avísame" no dispara por un tutor que el buscador oculta.
export async function countAvailableTutorsForCourse(courseId) {
  return countListedTutorsForCourse(courseId);
}

export async function countAvailableTutorsForCourses(courseIds) {
  return countListedTutorsForCourses(courseIds);
}

export async function subscribeStudentToCourse({ studentId, courseId, source = 'unknown' }) {
  const normalizedSource = ALLOWED_SOURCES.has(source) ? source : 'unknown';

  const [student, course, existing, availableTutorCount] = await Promise.all([
    userRepo.findById(studentId),
    academicRepo.findCourseById(courseId),
    notifyRepo.findPendingByStudentAndCourse(studentId, courseId),
    countListedTutorsForCourse(courseId),
  ]);

  if (!student) {
    const err = new Error('Student not found');
    err.code = 'STUDENT_NOT_FOUND';
    throw err;
  }

  if (!course) {
    const err = new Error('Course not found');
    err.code = 'COURSE_NOT_FOUND';
    throw err;
  }

  if (availableTutorCount > 0) {
    return { state: 'course_available', availableTutorCount };
  }

  if (existing) {
    return { state: 'already_subscribed', subscription: existing, availableTutorCount };
  }

  const created = await notifyRepo.createPendingSubscription({
    studentId,
    courseId,
    notificationEmail: student.email,
    source: normalizedSource,
  });

  if (!created) {
    const duplicate = await notifyRepo.findPendingByStudentAndCourse(studentId, courseId);
    return { state: 'already_subscribed', subscription: duplicate, availableTutorCount };
  }

  return { state: 'created', subscription: created, availableTutorCount };
}

export async function getStudentSubscriptionState({ studentId, courseId }) {
  const [subscription, availableTutorCount] = await Promise.all([
    notifyRepo.findPendingByStudentAndCourse(studentId, courseId),
    countListedTutorsForCourse(courseId),
  ]);

  return {
    subscribed: Boolean(subscription),
    subscription,
    availableTutorCount,
  };
}

export async function notifyPendingSubscribersForCourse(courseId) {
  const [availableTutorCount, pending] = await Promise.all([
    countListedTutorsForCourse(courseId),
    notifyRepo.findPendingByCourse(courseId),
  ]);

  if (availableTutorCount <= 0 || pending.length === 0) {
    return { courseId, availableTutorCount, notified: 0, failed: 0 };
  }

  let notified = 0;
  let failed = 0;

  for (const subscription of pending) {
    try {
      const claimed = await notifyRepo.markNotified(subscription.id);
      if (!claimed) continue;

      await sendCourseAvailableNotificationEmail(subscription.notificationEmail, {
        studentName: subscription.studentName,
        courseName: subscription.courseName,
        courseCode: subscription.courseCode,
        courseId,
      });
      notified += 1;
    } catch (err) {
      failed += 1;
      console.error('[CourseNotify] Failed to notify subscription:', subscription.id, err.message);
    }
  }

  return { courseId, availableTutorCount, notified, failed };
}

export async function evaluateTutorAvailabilityNotifications(tutorId) {
  const courseIds = await notifyRepo.findApprovedCourseIdsWithPendingSubscriptions(tutorId);
  if (courseIds.length === 0) {
    return { tutorId, checkedCourses: 0, notified: 0, failed: 0 };
  }

  const results = await Promise.all(courseIds.map(notifyPendingSubscribersForCourse));
  return {
    tutorId,
    checkedCourses: courseIds.length,
    notified: results.reduce((sum, item) => sum + item.notified, 0),
    failed: results.reduce((sum, item) => sum + item.failed, 0),
  };
}

export async function listAdminSubscriptions(options) {
  return notifyRepo.listAdminSubscriptions(options);
}

export async function getAdminMetrics() {
  return notifyRepo.getAdminMetrics();
}

/**
 * Tablero de reclutamiento (admin → Tutores → Reclutamiento y la tarjeta del
 * Inicio). Una fila por materia con estudiantes esperando:
 *   - `listedTutors`: tutores que el estudiante SÍ ve hoy (misma regla que el
 *     buscador y que el disparo del aviso). 0 = la materia necesita tutor.
 *   - `approvedTutors`: tutores con la materia aprobada, visibles o no. Si hay
 *     aprobados pero ninguno visible, lo que falta es disponibilidad (un
 *     recordatorio), no reclutar.
 *   - `pendingRequests`: tutores ya aprobados que pidieron dictarla.
 * Orden: primero sin tutor visible, luego más estudiantes esperando, luego
 * la espera más larga.
 */
export async function getRecruitmentDemand() {
  const rows = await notifyRepo.findOpenDemandByCourse();
  const listed = await countListedTutorsForCourses(rows.map((r) => r.courseId));

  return rows
    .map((r) => {
      const listedTutors = listed.get(r.courseId) ?? 0;
      return {
        courseId: r.courseId,
        courseCode: r.courseCode,
        courseName: r.courseName,
        waiting: Number(r.waiting),
        oldestAt: r.oldestAt,
        approvedTutors: Number(r.approvedTutors),
        pendingRequests: Number(r.pendingRequests),
        listedTutors,
        needsTutor: listedTutors === 0,
      };
    })
    .sort((a, b) => (
      Number(b.needsTutor) - Number(a.needsTutor)
      || b.waiting - a.waiting
      || new Date(a.oldestAt) - new Date(b.oldestAt)
    ));
}
