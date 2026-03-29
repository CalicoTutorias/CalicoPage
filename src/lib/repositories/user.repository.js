/**
 * User Repository
 * Handles all database operations for user data
 */

import { getFirestore, getTimestamp, parseDate } from '../firebase/admin';

const COLLECTION = 'users';

/**
 * Find user by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>}
 */
export async function findById(userId) {
  try {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(userId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return null;
    }

    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: parseDate(data.createdAt),
      updatedAt: parseDate(data.updatedAt),
    };
  } catch (error) {
    console.error('Error finding user by ID:', error);
    throw error;
  }
}

/**
 * Find user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>}
 */
export async function findByEmail(email) {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection(COLLECTION)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: parseDate(data.createdAt),
      updatedAt: parseDate(data.updatedAt),
    };
  } catch (error) {
    console.error('Error finding user by email:', error);
    throw error;
  }
}

/**
 * Create or update user
 * @param {string} userId - User ID
 * @param {Object} userData - User data
 * @returns {Promise<string>} User ID
 */
export async function save(userId, userData) {
  try {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(userId);
    
    const dataToSave = {
      ...userData,
      updatedAt: getTimestamp(),
    };

    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      dataToSave.createdAt = getTimestamp();
    }

    await docRef.set(dataToSave, { merge: true });
    return userId;
  } catch (error) {
    console.error('Error saving user:', error);
    throw error;
  }
}

/**
 * Find tutors by course
 * @param {string} course - Course name
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>}
 */
export async function findTutorsByCourse(course, limit = 50) {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection(COLLECTION)
      .where('isTutor', '==', true)
      .where('courses', 'array-contains', course)
      .limit(limit)
      .get();

    const tutors = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      tutors.push({
        id: doc.id,
        ...data,
        createdAt: parseDate(data.createdAt),
        updatedAt: parseDate(data.updatedAt),
      });
    });

    return tutors;
  } catch (error) {
    console.error('Error finding tutors by course:', error);
    throw error;
  }
}

/**
 * Get all tutors
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>}
 */
export async function findAllTutors(limit = 100) {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection(COLLECTION)
      .where('isTutor', '==', true)
      .limit(limit)
      .get();

    const tutors = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      tutors.push({
        id: doc.id,
        ...data,
        createdAt: parseDate(data.createdAt),
        updatedAt: parseDate(data.updatedAt),
      });
    });

    return tutors;
  } catch (error) {
    console.error('Error finding all tutors:', error);
    throw error;
  }
}

/**
 * Delete user
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export async function deleteUser(userId) {
  try {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(userId).delete();
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}

export default {
  findById,
  findByEmail,
  save,
  findTutorsByCourse,
  findAllTutors,
  deleteUser,
};

