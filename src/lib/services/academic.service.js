/**
 * Academic Service
 * Business logic for departments, careers, courses, topics, and tutor-course assignments
 */

import * as academicRepository from '../repositories/academic.repository';

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

// ===== TUTOR ↔ COURSE =====

export async function getTutorCourses(tutorId, limit = 50) {
  return academicRepository.findTutorCourses(tutorId, limit);
}

export async function getTutorsForCourse(courseId, limit = 50) {
  return academicRepository.findTutorsForCourse(courseId, limit);
}

export async function addTutorCourse(tutorId, courseId, customPrice) {
  return academicRepository.addTutorCourse(tutorId, courseId, customPrice);
}

export async function updateTutorCoursePrice(tutorId, courseId, customPrice) {
  return academicRepository.updateTutorCoursePrice(tutorId, courseId, customPrice);
}

export async function removeTutorCourse(tutorId, courseId) {
  return academicRepository.removeTutorCourse(tutorId, courseId);
}
