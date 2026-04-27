/**
 * Academic Service
 * Business logic for departments, careers, courses, topics, tutor-course assignments, and course prices.
 */

import * as academicRepository from '../repositories/academic.repository';
import * as userRepository from '../repositories/user.repository';
import { sendCourseRequestNotification } from './email.service';

// ===== DEPARTMENTS =====

export async function getAllDepartments() {
  return academicRepository.findAllDepartments();
}

export async function getDepartmentById(id) {
  return academicRepository.findDepartmentById(id);
}

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

export async function getAllCourses(limit = 50) {
  return academicRepository.findAllCourses(limit);
}

export async function getCourseById(id) {
  return academicRepository.findCourseById(id);
}

export async function getCourseByCode(code) {
  return academicRepository.findCourseByCode(code);
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

// ===== TOPICS =====

export async function getTopicsByCourse(courseId, limit = 50) {
  return academicRepository.findTopicsByCourse(courseId, limit);
}

export async function getTopicById(id) {
  return academicRepository.findTopicById(id);
}

export async function createTopic(data) {
  return academicRepository.createTopic(data);
}

export async function updateTopic(id, data) {
  return academicRepository.updateTopic(id, data);
}

export async function deleteTopic(id) {
  return academicRepository.deleteTopic(id);
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

  sendCourseRequestNotification(
    { id: tutorId, name: tutor.name, email: tutor.email },
    courseRequests,
    isExistingTutor,
  ).catch((err) => {
    console.error('[AcademicService] Admin course-request email failed:', err.message);
  });

  return tutorCourses;
}

export async function addTutorCourse(tutorId, courseId, { experience, workSampleUrl } = {}) {
  return academicRepository.addTutorCourse(tutorId, courseId, { experience, workSampleUrl });
}

/**
 * Admin approves a pending tutor course.
 */
export async function approveTutorCourse(tutorId, courseId) {
  return academicRepository.updateTutorCourseStatus(tutorId, courseId, 'Approved');
}

/**
 * Admin rejects a pending tutor course.
 */
export async function rejectTutorCourse(tutorId, courseId) {
  return academicRepository.updateTutorCourseStatus(tutorId, courseId, 'Rejected');
}

export async function updateTutorCourseStatus(tutorId, courseId, status) {
  return academicRepository.updateTutorCourseStatus(tutorId, courseId, status);
}

export async function removeTutorCourse(tutorId, courseId) {
  return academicRepository.removeTutorCourse(tutorId, courseId);
}

export async function getAllPendingCourseRequests() {
  return academicRepository.findAllPendingCourseRequests();
}

// ===== COURSE PRICES =====

export async function getAllCoursePrices() {
  return academicRepository.findAllCoursePrices();
}

export async function getCoursePrice(courseId) {
  return academicRepository.findCoursePrice(courseId);
}

export async function upsertCoursePrice(courseId, price) {
  return academicRepository.upsertCoursePrice(courseId, price);
}
