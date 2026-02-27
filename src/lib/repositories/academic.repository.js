/**
 * Academic Repository
 * Handles database operations for courses and majors
 */

import { getFirestore, getTimestamp, parseDate } from '../firebase/admin';

const MAJOR_COLLECTION = 'major';
const COURSE_COLLECTION = 'course';
const USERS_COLLECTION = 'users';

/**
 * Map course document
 * @param {Object} doc - Firestore document
 * @returns {Object} Course object
 */
function mapCourseDoc(doc) {
  const data = doc.data ? doc.data() : doc;
  return {
    id: doc.id,
    ...data,
    createdAt: parseDate(data?.createdAt),
    updatedAt: parseDate(data?.updatedAt),
  };
}

/**
 * Map major document
 * @param {Object} doc - Firestore document
 * @returns {Object} Major object
 */
function mapMajorDoc(doc) {
  const data = doc.data ? doc.data() : doc;
  return {
    id: doc.id,
    ...data,
    createdAt: parseDate(data?.createdAt),
    updatedAt: parseDate(data?.updatedAt),
  };
}

// ===== COURSES =====

/**
 * Find all courses
 * @returns {Promise<Array>}
 */
export async function findAllCourses() {
  try {
    const db = getFirestore();
    const snapshot = await db.collection(COURSE_COLLECTION).get();
    
    // Si la colección está vacía, devolver array vacío en lugar de error
    if (snapshot.empty) {
      console.warn(`Collection '${COURSE_COLLECTION}' is empty or does not exist yet`);
      return [];
    }
    
    return snapshot.docs.map((doc) => mapCourseDoc(doc));
  } catch (error) {
    console.error('Error fetching courses:', error);
    console.error('Collection name:', COURSE_COLLECTION);
    console.error('Verify that the collection exists in Firestore and rules allow read access');
    
    // Si la colección no existe, devolver array vacío en lugar de lanzar error
    if (error.code === 5 || error.message?.includes('NOT_FOUND')) {
      console.warn(`Collection '${COURSE_COLLECTION}' not found. Returning empty array.`);
      return [];
    }
    
    throw error;
  }
}

/**
 * Find course by ID
 * @param {string} id - Course ID
 * @returns {Promise<Object|null>}
 */
export async function findCourseById(id) {
  try {
    const db = getFirestore();
    const doc = await db.collection(COURSE_COLLECTION).doc(id).get();
    
    if (!doc.exists) {
      return null;
    }
    
    return mapCourseDoc(doc);
  } catch (error) {
    console.error(`Error fetching course ${id}:`, error);
    throw error;
  }
}

/**
 * Find courses by tutor
 * @param {string} tutorId - Tutor ID
 * @returns {Promise<Array>}
 */
export async function findCoursesByTutor(tutorId) {
  try {
    const db = getFirestore();
    
    // First, get the tutor's courses array
    const userDoc = await db.collection(USERS_COLLECTION).doc(tutorId).get();
    if (!userDoc.exists) {
      return [];
    }

    const userData = userDoc.data();
    const courseIds = userData?.courses || [];

    if (courseIds.length === 0) {
      return [];
    }

    // Fetch all courses that match the tutor's course IDs
    const courses = [];
    for (const courseId of courseIds) {
      const course = await findCourseById(courseId);
      if (course) {
        courses.push(course);
      }
    }

    return courses;
  } catch (error) {
    console.error(`Error fetching courses for tutor ${tutorId}:`, error);
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
    const db = getFirestore();
    const data = {
      ...courseData,
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };
    
    const docRef = await db.collection(COURSE_COLLECTION).add(data);
    const doc = await docRef.get();
    return mapCourseDoc(doc);
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
    const db = getFirestore();
    const docRef = db.collection(COURSE_COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    const data = {
      ...courseData,
      updatedAt: getTimestamp(),
    };
    
    await docRef.update(data);
    const updatedDoc = await docRef.get();
    
    return mapCourseDoc(updatedDoc);
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
    const db = getFirestore();
    await db.collection(COURSE_COLLECTION).doc(id).delete();
  } catch (error) {
    console.error(`Error deleting course ${id}:`, error);
    throw error;
  }
}

// ===== MAJORS =====

/**
 * Find all majors
 * @returns {Promise<Array>}
 */
export async function findAllMajors() {
  try {
    const db = getFirestore();
    const snapshot = await db.collection(MAJOR_COLLECTION).get();
    
    // Si la colección está vacía, devolver array vacío en lugar de error
    if (snapshot.empty) {
      console.warn(`Collection '${MAJOR_COLLECTION}' is empty or does not exist yet`);
      return [];
    }
    
    return snapshot.docs.map((doc) => mapMajorDoc(doc));
  } catch (error) {
    console.error('Error fetching majors:', error);
    console.error('Collection name:', MAJOR_COLLECTION);
    console.error('Verify that the collection exists in Firestore and rules allow read access');
    
    // Si la colección no existe, devolver array vacío en lugar de lanzar error
    if (error.code === 5 || error.message?.includes('NOT_FOUND')) {
      console.warn(`Collection '${MAJOR_COLLECTION}' not found. Returning empty array.`);
      return [];
    }
    
    throw error;
  }
}

/**
 * Find major by ID
 * @param {string} id - Major ID
 * @returns {Promise<Object|null>}
 */
export async function findMajorById(id) {
  try {
    const db = getFirestore();
    const doc = await db.collection(MAJOR_COLLECTION).doc(id).get();
    
    if (!doc.exists) {
      return null;
    }
    
    return mapMajorDoc(doc);
  } catch (error) {
    console.error(`Error fetching major ${id}:`, error);
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
    const db = getFirestore();
    const data = {
      ...majorData,
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };
    
    const docRef = await db.collection(MAJOR_COLLECTION).add(data);
    const doc = await docRef.get();
    return mapMajorDoc(doc);
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
    const db = getFirestore();
    const docRef = db.collection(MAJOR_COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    const data = {
      ...majorData,
      updatedAt: getTimestamp(),
    };
    
    await docRef.update(data);
    const updatedDoc = await docRef.get();
    
    return mapMajorDoc(updatedDoc);
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
    const db = getFirestore();
    await db.collection(MAJOR_COLLECTION).doc(id).delete();
  } catch (error) {
    console.error(`Error deleting major ${id}:`, error);
    throw error;
  }
}

export default {
  findAllCourses,
  findCourseById,
  findCoursesByTutor,
  createCourse,
  updateCourse,
  deleteCourse,
  findAllMajors,
  findMajorById,
  createMajor,
  updateMajor,
  deleteMajor,
};

