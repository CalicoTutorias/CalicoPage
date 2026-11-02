/**
 * Academic Service
 * Business logic for careers, courses, and tutor-course assignments.
 */

import * as academicRepository from '../repositories/academic.repository';
import * as userRepository from '../repositories/user.repository';
import * as notificationService from './notification.service';
import * as courseNotifyService from './course-notify.service';
import { sendCourseRequestNotification } from './email.service';
import * as tutorListingService from './tutor-listing.service';

// ===== CAREERS =====

export async function getAllCareers() {
  return academicRepository.findAllCareers();
}

export async function getCareerById(id) {
  return academicRepository.findCareerById(id);
}

export async function getCareerByCode(code) {
  return academicRepository.findCareerByCode(code);
}

// ===== COURSES =====

// `availableTutorCount` = tutores VISIBLES para estudiantes (misma regla que
// el listado de tutores: bloques a futuro + horas libres mínimas), para que una
// tarjeta nunca diga "1 tutor" cuando el buscador no muestra ninguno.
async function withAvailableTutorCounts(courses) {
  const counts = await tutorListingService.countListedTutorsForCourses(courses.map((c) => c.id));
  return courses.map((course) => ({
    ...course,
    availableTutorCount: counts.get(course.id) ?? 0,
  }));
}

export async function getAllCourses(limit) {
  const courses = await academicRepository.findAllCourses(limit);
  return withAvailableTutorCounts(courses);
}

export async function getCourseById(id) {
  const course = await academicRepository.findCourseById(id);
  if (!course) return null;
  const [enriched] = await withAvailableTutorCounts([course]);
  return enriched;
}

export async function getCourseByCode(code) {
  const course = await academicRepository.findCourseByCode(code);
  if (!course) return null;
  const [enriched] = await withAvailableTutorCounts([course]);
  return enriched;
}

export async function createCourse(data) {
  return academicRepository.createCourse(data);
}

export async function updateCourse(id, data) {
  return academicRepository.updateCourse(id, data);
}

export async function deleteCourse(id) {
  return academicRepository.deleteCourse(id);
}

// ===== TUTOR COURSES =====

export async function getTutorCourses(tutorId, limit = 50) {
  return academicRepository.findTutorCourses(tutorId, limit);
}

export async function getTutorCoursesByStatus(tutorId, status, limit = 50) {
  return academicRepository.findTutorCoursesByStatus(tutorId, status, limit);
}

export async function getTutorsForCourse(courseId, limit = 50) {
  return academicRepository.findTutorsForCourse(courseId, limit);
}

/**
 * Tutor (existing) requests one or more new courses.
 * All courses are created as Pending. An admin notification email is fired.
 *
 * @param {string} tutorId
 * @param {Array<{ courseId: string, experience?: string, workSampleUrl?: string }>} courses
 * @param {boolean} isExistingTutor - true when the tutor is already approved
 */
export async function requestCourses(tutorId, courses, isExistingTutor = false) {
  const tutorCourses = await academicRepository.addTutorCourses(tutorId, courses);

  const [tutor, courseRecords] = await Promise.all([
    userRepository.findById(tutorId),
    Promise.all(tutorCourses.map((tc) => tc.course)),
  ]);

  const courseRequests = tutorCourses.map((tc) => ({
    courseId: tc.courseId,
    courseName: tc.course.name,
    workSampleUrl: tc.workSampleUrl || null,
  }));

  try {
    await sendCourseRequestNotification(
      { id: tutorId, name: tutor.name, email: tutor.email },
      courseRequests,
      isExistingTutor,
    );
  } catch (err) {
    console.error('[AcademicService] Admin course-request email failed:', err.message);
  }

  return tutorCourses;
}

export async function addTutorCourse(tutorId, courseId, { experience, workSampleUrl } = {}) {
  return academicRepository.addTutorCourse(tutorId, courseId, { experience, workSampleUrl });
}

/**
 * Admin approves a pending tutor course.
 */
export async function approveTutorCourse(tutorId, courseId) {
  const updated = await academicRepository.updateTutorCourseStatus(tutorId, courseId, 'Approved');
  try {
    await courseNotifyService.notifyPendingSubscribersForCourse(courseId);
  } catch (err) {
    console.error('[AcademicService] Notify Me evaluation failed after course approval:', err.message);
  }

  // Get course name and notify tutor
  try {
    const course = await academicRepository.findCourseById(courseId);
    if (course) {
      await notificationService.notifyCourseApproved(tutorId, course.name);
    }
  } catch (err) {
    console.warn(`Failed to send course approval notification: ${err.message}`);
  }
  
  return updated;
}

/**
 * Admin rejects a pending tutor course.
 */
export async function rejectTutorCourse(tutorId, courseId) {
  const updated = await academicRepository.updateTutorCourseStatus(tutorId, courseId, 'Rejected');
  
  // Get course name and notify tutor (fire-and-forget)
  try {
    const course = await academicRepository.findCourseById(courseId);
    if (course) {
      await notificationService.notifyCourseRejected(tutorId, course.name);
    }
  } catch (err) {
    console.warn(`Failed to send course rejection notification: ${err.message}`);
  }
  
  return updated;
}

export async function updateTutorCourseStatus(tutorId, courseId, status) {
  return academicRepository.updateTutorCourseStatus(tutorId, courseId, status);
}

function tutorCourseError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Only `from` → `to`, so a tutor can never approve themselves: resuming works on
 * a Paused row and nothing else. Being already in `to` is fine (double click,
 * second tab).
 * @throws NOT_FOUND | INVALID_STATE
 */
async function moveTutorCourse(tutorId, courseId, from, to) {
  const moved = await academicRepository.moveTutorCourseStatus(tutorId, courseId, from, to);
  const tutorCourse = await academicRepository.findTutorCourse(tutorId, courseId);
  if (!tutorCourse) throw tutorCourseError('Esta materia no está en tu catálogo', 'NOT_FOUND');
  if (!moved && tutorCourse.status !== to) {
    throw tutorCourseError(`Una materia en estado ${tutorCourse.status} no se puede cambiar a ${to}`, 'INVALID_STATE');
  }
  return { tutorCourse, moved };
}

/**
 * The tutor stops offering a course they were approved for: students no longer
 * find it and cannot book it. Sessions already scheduled stay as they are.
 */
export async function pauseTutorCourse(tutorId, courseId) {
  const { tutorCourse } = await moveTutorCourse(tutorId, courseId, 'Approved', 'Paused');
  return tutorCourse;
}

/** The tutor offers a paused course again, with no admin involved. */
export async function resumeTutorCourse(tutorId, courseId) {
  const { tutorCourse, moved } = await moveTutorCourse(tutorId, courseId, 'Paused', 'Approved');
  if (moved) {
    try {
      await courseNotifyService.notifyPendingSubscribersForCourse(courseId);
    } catch (err) {
      console.error('[AcademicService] Notify Me evaluation failed after resuming a course:', err.message);
    }
  }
  return tutorCourse;
}

export async function removeTutorCourse(tutorId, courseId) {
  return academicRepository.removeTutorCourse(tutorId, courseId);
}

export async function getAllPendingCourseRequests() {
  return academicRepository.findAllPendingCourseRequests();
}
