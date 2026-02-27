/**
 * Tutoring Session Repository
 * Handles database operations for tutoring sessions
 */

import { getFirestore, getTimestamp, parseDate } from '../firebase/admin';

const COLLECTION = 'tutoring_sessions';

/**
 * Find session by ID
 * @param {string} id - Session ID
 * @returns {Promise<Object|null>}
 */
export async function findById(id) {
  try {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return null;
    }

    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      scheduledStart: parseDate(data.scheduledStart),
      scheduledEnd: parseDate(data.scheduledEnd),
      createdAt: parseDate(data.createdAt),
      updatedAt: parseDate(data.updatedAt),
    };
  } catch (error) {
    console.error('Error finding tutoring session by ID:', error);
    throw error;
  }
}

/**
 * Find sessions by tutor
 * @param {string} tutorId - Tutor ID
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>}
 */
export async function findByTutor(tutorId, limit = 100) {
  try {
    const db = getFirestore();
    // Temporal fix: Ordenar en memoria hasta que se cree el índice compuesto en Firestore
    // TODO: Crear índice compuesto en Firestore: collection(tutoringSessions) -> tutorId(Ascending) + scheduledStart(Descending)
    const snapshot = await db
      .collection(COLLECTION)
      .where('tutorId', '==', tutorId)
      .get();

    // Si la colección está vacía, devolver array vacío
    if (snapshot.empty) {
      console.warn(`No sessions found for tutor ${tutorId} or collection '${COLLECTION}' is empty`);
      return [];
    }

    const sessions = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      sessions.push({
        id: doc.id,
        ...data,
        scheduledStart: parseDate(data.scheduledStart),
        scheduledEnd: parseDate(data.scheduledEnd),
        createdAt: parseDate(data.createdAt),
        updatedAt: parseDate(data.updatedAt),
      });
    });

    // Ordenar en memoria por scheduledStart descendente
    sessions.sort((a, b) => {
      const dateA = a.scheduledStart instanceof Date ? a.scheduledStart : new Date(a.scheduledStart);
      const dateB = b.scheduledStart instanceof Date ? b.scheduledStart : new Date(b.scheduledStart);
      return dateB - dateA; // Descendente (más reciente primero)
    });

    // Aplicar límite después de ordenar
    return sessions.slice(0, limit);
  } catch (error) {
    console.error('Error finding tutoring sessions by tutor:', error);
    console.error('Collection name:', COLLECTION);
    
    // Si la colección no existe, devolver array vacío en lugar de lanzar error
    if (error.code === 5 || error.message?.includes('NOT_FOUND')) {
      console.warn(`Collection '${COLLECTION}' not found or inaccessible. Returning empty array.`);
      return [];
    }
    
    throw error;
  }
}

/**
 * Find sessions by student
 * @param {string} studentId - Student ID
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>}
 */
export async function findByStudent(studentId, limit = 100) {
  try {
    const db = getFirestore();
    // Temporal fix: Ordenar en memoria hasta que se cree el índice compuesto en Firestore
    // TODO: Crear índice compuesto en Firestore: collection(tutoringSessions) -> studentId(Ascending) + scheduledStart(Descending)
    const snapshot = await db
      .collection(COLLECTION)
      .where('studentId', '==', studentId)
      .get();

    // Si la colección está vacía, devolver array vacío
    if (snapshot.empty) {
      console.warn(`No sessions found for student ${studentId} or collection '${COLLECTION}' is empty`);
      return [];
    }

    const sessions = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      sessions.push({
        id: doc.id,
        ...data,
        scheduledStart: parseDate(data.scheduledStart),
        scheduledEnd: parseDate(data.scheduledEnd),
        createdAt: parseDate(data.createdAt),
        updatedAt: parseDate(data.updatedAt),
      });
    });

    // Ordenar en memoria por scheduledStart descendente
    sessions.sort((a, b) => {
      const dateA = a.scheduledStart instanceof Date ? a.scheduledStart : new Date(a.scheduledStart);
      const dateB = b.scheduledStart instanceof Date ? b.scheduledStart : new Date(b.scheduledStart);
      return dateB - dateA; // Descendente (más reciente primero)
    });

    // Aplicar límite después de ordenar
    return sessions.slice(0, limit);
  } catch (error) {
    console.error('Error finding tutoring sessions by student:', error);
    console.error('Collection name:', COLLECTION);
    console.error('Student ID:', studentId);
    
    // Si la colección no existe, devolver array vacío en lugar de lanzar error
    if (error.code === 5 || error.message?.includes('NOT_FOUND')) {
      console.warn(`Collection '${COLLECTION}' not found or inaccessible. Returning empty array.`);
      return [];
    }
    
    throw error;
  }
}

/**
 * Save tutoring session
 * @param {string|undefined} id - Session ID
 * @param {Object} sessionData - Session data
 * @returns {Promise<string>} Session ID
 */
export async function save(id, sessionData) {
  try {
    const db = getFirestore();
    const firestoreData = {
      ...sessionData,
      updatedAt: getTimestamp(),
    };

    if (id) {
      const docRef = db.collection(COLLECTION).doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        firestoreData.createdAt = getTimestamp();
      }
      await docRef.set(firestoreData, { merge: true });
      return id;
    } else {
      const colRef = db.collection(COLLECTION);
      firestoreData.createdAt = getTimestamp();
      const docRef = await colRef.add(firestoreData);
      return docRef.id;
    }
  } catch (error) {
    console.error('Error saving tutoring session:', error);
    throw error;
  }
}

/**
 * Delete tutoring session
 * @param {string} id - Session ID
 * @returns {Promise<void>}
 */
export async function deleteSession(id) {
  try {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).delete();
  } catch (error) {
    console.error('Error deleting tutoring session:', error);
    throw error;
  }
}

/**
 * Find sessions by tutor and approval status
 * @param {string} tutorId - Tutor ID
 * @param {string} approvalStatus - Approval status ('pending', 'approved', 'declined')
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>}
 */
export async function findByTutorAndApprovalStatus(tutorId, approvalStatus, limit = 50) {
  try {
    const db = getFirestore();
    // Temporal fix: Ordenar en memoria hasta que se cree el índice compuesto en Firestore
    // TODO: Crear índice compuesto en Firestore: collection(tutoringSessions) -> tutorId(Ascending) + tutorApprovalStatus(Ascending) + scheduledStart(Descending)
    const snapshot = await db
      .collection(COLLECTION)
      .where('tutorId', '==', tutorId)
      .where('tutorApprovalStatus', '==', approvalStatus)
      .get();

    // Si la colección está vacía, devolver array vacío
    if (snapshot.empty) {
      console.warn(`No sessions found for tutor ${tutorId} with status ${approvalStatus} or collection '${COLLECTION}' is empty`);
      return [];
    }

    const sessions = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      sessions.push({
        id: doc.id,
        ...data,
        scheduledStart: parseDate(data.scheduledStart),
        scheduledEnd: parseDate(data.scheduledEnd),
        createdAt: parseDate(data.createdAt),
        updatedAt: parseDate(data.updatedAt),
      });
    });

    // Ordenar en memoria por scheduledStart descendente
    sessions.sort((a, b) => {
      const dateA = a.scheduledStart instanceof Date ? a.scheduledStart : new Date(a.scheduledStart);
      const dateB = b.scheduledStart instanceof Date ? b.scheduledStart : new Date(b.scheduledStart);
      return dateB - dateA; // Descendente (más reciente primero)
    });

    // Aplicar límite después de ordenar
    return sessions.slice(0, limit);
  } catch (error) {
    console.error('Error finding tutoring sessions by tutor and approval status:', error);
    console.error('Collection name:', COLLECTION);
    
    // Si la colección no existe, devolver array vacío en lugar de lanzar error
    if (error.code === 5 || error.message?.includes('NOT_FOUND')) {
      console.warn(`Collection '${COLLECTION}' not found or inaccessible. Returning empty array.`);
      return [];
    }
    
    throw error;
  }
}

/**
 * Add or update a review for a session
 * @param {string} sessionId - Session ID
 * @param {Object} review - Review data
 * @returns {Promise<Object>} Updated reviews and average rating
 */
export async function addOrUpdateReview(sessionId, review) {
  try {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(sessionId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new Error('Session not found');
    }

    const data = docSnap.data();
    let reviews = data.reviews || [];

    // Check if reviewer already has a review
    const existingIndex = reviews.findIndex((r) => r.reviewerEmail === review.reviewerEmail);

    if (existingIndex >= 0) {
      // Update existing review
      reviews[existingIndex] = {
        ...reviews[existingIndex],
        ...review,
        updatedAt: new Date(),
      };
    } else {
      // Add new review
      reviews.push(review);
    }

    // Calculate average rating
    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length
        : 0;

    // Update document
    await docRef.update({
      reviews,
      averageRating,
      updatedAt: getTimestamp(),
    });

    return {
      reviews,
      averageRating,
    };
  } catch (error) {
    console.error('Error adding/updating review:', error);
    throw error;
  }
}

export default {
  findById,
  findByTutor,
  findByStudent,
  findByTutorAndApprovalStatus,
  save,
  deleteSession,
  addOrUpdateReview,
};

