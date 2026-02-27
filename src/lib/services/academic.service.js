/**
 * Academic Service
 * Business logic for courses and majors management
 */

import * as academicRepository from '../repositories/academic.repository';

// ===== COURSES =====

/**
 * Get all courses
 * @returns {Promise<Array>}
 */
export async function getAllCourses() {
  try {
    return await academicRepository.findAllCourses();
  } catch (error) {
    console.error('Error getting all courses:', error);
    throw error;
  }
}

/**
 * Get course by ID
 * @param {string} id - Course ID
 * @returns {Promise<Object|null>}
 */
export async function getCourseById(id) {
  try {
    return await academicRepository.findCourseById(id);
  } catch (error) {
    console.error(`Error getting course ${id}:`, error);
    throw error;
  }
}

/**
 * Get courses by tutor
 * @param {string} tutorId - Tutor ID
 * @returns {Promise<Array>}
 */
export async function getCoursesByTutor(tutorId) {
  try {
    return await academicRepository.findCoursesByTutor(tutorId);
  } catch (error) {
    console.error(`Error getting courses for tutor ${tutorId}:`, error);
    throw error;
  }
}

/**
 * Create course
 * @param {Object} courseData - Course data
 * @returns {Promise<Object>}
 */
export async function createCourse(courseData) {
  try {
    return await academicRepository.createCourse(courseData);
  } catch (error) {
    console.error('Error creating course:', error);
    throw error;
  }
}

/**
 * Update course
 * @param {string} id - Course ID
 * @param {Object} courseData - Course data
 * @returns {Promise<Object|null>}
 */
export async function updateCourse(id, courseData) {
  try {
    return await academicRepository.updateCourse(id, courseData);
  } catch (error) {
    console.error(`Error updating course ${id}:`, error);
    throw error;
  }
}

/**
 * Delete course
 * @param {string} id - Course ID
 * @returns {Promise<void>}
 */
export async function deleteCourse(id) {
  try {
    await academicRepository.deleteCourse(id);
    console.log(`Course deleted: ${id}`);
  } catch (error) {
    console.error(`Error deleting course ${id}:`, error);
    throw error;
  }
}

// ===== MAJORS =====

/**
 * Get all majors
 * @returns {Promise<Array>}
 */
export async function getAllMajors() {
  try {
    return await academicRepository.findAllMajors();
  } catch (error) {
    console.error('Error getting all majors:', error);
    throw error;
  }
}

/**
 * Get major by ID
 * @param {string} id - Major ID
 * @returns {Promise<Object|null>}
 */
export async function getMajorById(id) {
  try {
    return await academicRepository.findMajorById(id);
  } catch (error) {
    console.error(`Error getting major ${id}:`, error);
    throw error;
  }
}

/**
 * Create major
 * @param {Object} majorData - Major data
 * @returns {Promise<Object>}
 */
export async function createMajor(majorData) {
  try {
    return await academicRepository.createMajor(majorData);
  } catch (error) {
    console.error('Error creating major:', error);
    throw error;
  }
}

/**
 * Update major
 * @param {string} id - Major ID
 * @param {Object} majorData - Major data
 * @returns {Promise<Object|null>}
 */
export async function updateMajor(id, majorData) {
  try {
    return await academicRepository.updateMajor(id, majorData);
  } catch (error) {
    console.error(`Error updating major ${id}:`, error);
    throw error;
  }
}

/**
 * Delete major
 * @param {string} id - Major ID
 * @returns {Promise<void>}
 */
export async function deleteMajor(id) {
  try {
    await academicRepository.deleteMajor(id);
    console.log(`Major deleted: ${id}`);
  } catch (error) {
    console.error(`Error deleting major ${id}:`, error);
    throw error;
  }
}

export default {
  getAllCourses,
  getCourseById,
  getCoursesByTutor,
  createCourse,
  updateCourse,
  deleteCourse,
  getAllMajors,
  getMajorById,
  createMajor,
  updateMajor,
  deleteMajor,
};

