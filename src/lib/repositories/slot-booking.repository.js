/**
 * Slot Booking Repository
 * Handles database operations for slot bookings
 */

import { getFirestore, getTimestamp, parseDate } from '../firebase/admin';
import admin from 'firebase-admin';

const COLLECTION = 'slot_bookings';

/**
 * Find slot booking by ID
 * @param {string} id - Booking ID
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
      parentAvailabilityId: data.parentAvailabilityId,
      slotIndex: data.slotIndex,
      slotId: data.slotId,
      tutorEmail: data.tutorEmail,
      tutorId: data.tutorId,
      studentEmail: data.studentEmail,
      studentId: data.studentId,
      sessionId: data.sessionId,
      slotStartTime: parseDate(data.slotStartTime),
      slotEndTime: parseDate(data.slotEndTime),
      course: data.course,
      bookedAt: parseDate(data.bookedAt),
      createdAt: parseDate(data.createdAt),
      updatedAt: parseDate(data.updatedAt),
    };
  } catch (error) {
    console.error('Error finding slot booking by ID:', error);
    throw error;
  }
}

/**
 * Find booking by parent availability ID and slot index
 * @param {string} parentAvailabilityId - Parent availability ID
 * @param {number} slotIndex - Slot index
 * @returns {Promise<Object|null>}
 */
export async function findByParentAndIndex(parentAvailabilityId, slotIndex) {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection(COLLECTION)
      .where('parentAvailabilityId', '==', parentAvailabilityId)
      .where('slotIndex', '==', slotIndex)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      parentAvailabilityId: data.parentAvailabilityId,
      slotIndex: data.slotIndex,
      slotId: data.slotId,
      tutorEmail: data.tutorEmail,
      tutorId: data.tutorId,
      studentEmail: data.studentEmail,
      studentId: data.studentId,
      sessionId: data.sessionId,
      slotStartTime: parseDate(data.slotStartTime),
      slotEndTime: parseDate(data.slotEndTime),
      course: data.course,
      bookedAt: parseDate(data.bookedAt),
      createdAt: parseDate(data.createdAt),
      updatedAt: parseDate(data.updatedAt),
    };
  } catch (error) {
    console.error('Error finding slot booking by parent and index:', error);
    throw error;
  }
}

/**
 * Find all bookings for an availability
 * @param {string} parentAvailabilityId - Parent availability ID
 * @returns {Promise<Array>}
 */
export async function findByAvailability(parentAvailabilityId) {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection(COLLECTION)
      .where('parentAvailabilityId', '==', parentAvailabilityId)
      .get();

    const bookings = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      bookings.push({
        id: doc.id,
        parentAvailabilityId: data.parentAvailabilityId,
        slotIndex: data.slotIndex,
        slotId: data.slotId,
        tutorEmail: data.tutorEmail,
        tutorId: data.tutorId,
        studentEmail: data.studentEmail,
        studentId: data.studentId,
        sessionId: data.sessionId,
        slotStartTime: parseDate(data.slotStartTime),
        slotEndTime: parseDate(data.slotEndTime),
        course: data.course,
        bookedAt: parseDate(data.bookedAt),
        createdAt: parseDate(data.createdAt),
        updatedAt: parseDate(data.updatedAt),
      });
    });

    return bookings;
  } catch (error) {
    console.error('Error finding slot bookings by availability:', error);
    throw error;
  }
}

/**
 * Find bookings by tutor
 * @param {string} tutorId - Tutor ID
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>}
 */
export async function findByTutor(tutorId, limit = 100) {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection(COLLECTION)
      .where('tutorId', '==', tutorId)
      .orderBy('slotStartTime', 'desc')
      .limit(limit)
      .get();

    const bookings = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      bookings.push({
        id: doc.id,
        parentAvailabilityId: data.parentAvailabilityId,
        slotIndex: data.slotIndex,
        slotId: data.slotId,
        tutorEmail: data.tutorEmail,
        tutorId: data.tutorId,
        studentEmail: data.studentEmail,
        studentId: data.studentId,
        sessionId: data.sessionId,
        slotStartTime: parseDate(data.slotStartTime),
        slotEndTime: parseDate(data.slotEndTime),
        course: data.course,
        bookedAt: parseDate(data.bookedAt),
        createdAt: parseDate(data.createdAt),
        updatedAt: parseDate(data.updatedAt),
      });
    });

    return bookings;
  } catch (error) {
    console.error('Error finding slot bookings by tutor:', error);
    throw error;
  }
}

/**
 * Find bookings by session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Array>}
 */
export async function findBySession(sessionId) {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection(COLLECTION)
      .where('sessionId', '==', sessionId)
      .get();

    const bookings = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      bookings.push({
        id: doc.id,
        parentAvailabilityId: data.parentAvailabilityId,
        slotIndex: data.slotIndex,
        slotId: data.slotId,
        tutorEmail: data.tutorEmail,
        tutorId: data.tutorId,
        studentEmail: data.studentEmail,
        studentId: data.studentId,
        sessionId: data.sessionId,
        slotStartTime: parseDate(data.slotStartTime),
        slotEndTime: parseDate(data.slotEndTime),
        course: data.course,
        bookedAt: parseDate(data.bookedAt),
        createdAt: parseDate(data.createdAt),
        updatedAt: parseDate(data.updatedAt),
      });
    });

    return bookings;
  } catch (error) {
    console.error('Error finding slot bookings by session:', error);
    throw error;
  }
}

/**
 * Save slot booking
 * @param {string|undefined} id - Booking ID
 * @param {Object} bookingData - Booking data
 * @returns {Promise<string>} Booking ID
 */
export async function save(id, bookingData) {
  try {
    const db = getFirestore();
    const firestoreData = {
      ...bookingData,
      updatedAt: getTimestamp(),
    };

    // Convert dates to Firestore timestamps
    if (bookingData.slotStartTime) {
      firestoreData.slotStartTime = admin.firestore.Timestamp.fromDate(
        bookingData.slotStartTime instanceof Date
          ? bookingData.slotStartTime
          : new Date(bookingData.slotStartTime)
      );
    }
    if (bookingData.slotEndTime) {
      firestoreData.slotEndTime = admin.firestore.Timestamp.fromDate(
        bookingData.slotEndTime instanceof Date
          ? bookingData.slotEndTime
          : new Date(bookingData.slotEndTime)
      );
    }
    if (bookingData.bookedAt) {
      firestoreData.bookedAt = admin.firestore.Timestamp.fromDate(
        bookingData.bookedAt instanceof Date
          ? bookingData.bookedAt
          : new Date(bookingData.bookedAt)
      );
    }

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
      if (!firestoreData.bookedAt) {
        firestoreData.bookedAt = getTimestamp();
      }
      const docRef = await colRef.add(firestoreData);
      return docRef.id;
    }
  } catch (error) {
    console.error('Error saving slot booking:', error);
    throw error;
  }
}

/**
 * Delete slot booking
 * @param {string} id - Booking ID
 * @returns {Promise<void>}
 */
export async function deleteBooking(id) {
  try {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).delete();
  } catch (error) {
    console.error('Error deleting slot booking:', error);
    throw error;
  }
}

/**
 * Delete bookings by session
 * @param {string} sessionId - Session ID
 * @returns {Promise<void>}
 */
export async function deleteBySession(sessionId) {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection(COLLECTION)
      .where('sessionId', '==', sessionId)
      .get();

    const deletePromises = snapshot.docs.map((doc) => doc.ref.delete());
    await Promise.all(deletePromises);
  } catch (error) {
    console.error('Error deleting slot bookings by session:', error);
    throw error;
  }
}

/**
 * Delete bookings by parent availability and slot index
 * @param {string} parentAvailabilityId - Parent availability ID
 * @param {number} slotIndex - Slot index
 * @param {string} sessionId - Optional session ID for additional filtering
 * @returns {Promise<void>}
 */
export async function deleteByParentAndIndex(parentAvailabilityId, slotIndex, sessionId = null) {
  try {
    const db = getFirestore();
    let query = db
      .collection(COLLECTION)
      .where('parentAvailabilityId', '==', parentAvailabilityId)
      .where('slotIndex', '==', slotIndex);

    if (sessionId) {
      query = query.where('sessionId', '==', sessionId);
    }

    const snapshot = await query.get();
    const deletePromises = snapshot.docs.map((doc) => doc.ref.delete());
    await Promise.all(deletePromises);
  } catch (error) {
    console.error('Error deleting slot bookings by parent and index:', error);
    throw error;
  }
}

export default {
  findById,
  findByParentAndIndex,
  findByAvailability,
  findByTutor,
  findBySession,
  save,
  deleteBooking,
  deleteBySession,
  deleteByParentAndIndex,
};

