/**
 * Tutoring Session Service
 * Complete business logic for tutoring session management
 * Migrated from NestJS backend to Next.js monolithic structure
 */

import * as tutoringSessionRepository from '../repositories/tutoring-session.repository';
import * as slotBookingRepository from '../repositories/slot-booking.repository';
import * as calicoCalendarService from './calico-calendar.service';
import * as userService from './user.service';
import * as courseHelper from '../utils/course.helper';

/**
 * Get session by ID
 * @param {string} id - Session ID
 * @returns {Promise<Object>}
 */
export async function getSessionById(id) {
  try {
    const session = await tutoringSessionRepository.findById(id);
    if (!session) {
      throw new Error(`Session with ID ${id} not found`);
    }
    return session;
  } catch (error) {
    console.error(`Error getting session by ID ${id}:`, error);
    throw error;
  }
}

/**
 * Get sessions by tutor
 * @param {string} tutorId - Tutor ID
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>}
 */
export async function getSessionsByTutor(tutorId, limit = 50) {
  try {
    return await tutoringSessionRepository.findByTutor(tutorId, limit);
  } catch (error) {
    console.error('Error getting sessions by tutor:', error);
    throw error;
  }
}

/**
 * Get sessions by student
 * @param {string} studentId - Student ID
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>}
 */
export async function getSessionsByStudent(studentId, limit = 50) {
  try {
    return await tutoringSessionRepository.findByStudent(studentId, limit);
  } catch (error) {
    console.error('Error getting sessions by student:', error);
    throw error;
  }
}

/**
 * Validate and clean session data
 * @param {Object} sessionData - Session data
 * @returns {Promise<Object>}
 */
async function validateAndCleanSessionData(sessionData) {
  const cleanedData = Object.fromEntries(
    Object.entries(sessionData).filter(([_, value]) => value !== undefined && value !== null)
  );

  // Ensure required fields
  if (!cleanedData.tutorId) throw new Error('tutorId is required');
  if (!cleanedData.studentId) throw new Error('studentId is required');
  if (!cleanedData.scheduledStart) throw new Error('scheduledStart is required');
  if (!cleanedData.scheduledEnd) throw new Error('scheduledEnd is required');

  return cleanedData;
}

/**
 * Create a tutoring session
 * @param {Object} sessionData - Session data
 * @returns {Promise<Object>}
 */
export async function createSession(sessionData) {
  try {
    const cleanedData = await validateAndCleanSessionData(sessionData);
    const requiresApproval = sessionData.requiresApproval !== false;

    const finalData = {
      ...cleanedData,
      status: requiresApproval ? 'pending' : 'scheduled',
      tutorApprovalStatus: requiresApproval ? 'pending' : 'approved',
      paymentStatus: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (requiresApproval) {
      finalData.requestedAt = new Date();
    }

    const id = await tutoringSessionRepository.save(undefined, finalData);
    console.log(`Tutoring session created with ID: ${id}, Status: ${finalData.status}`);
    return await getSessionById(id);
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
}

/**
 * Update a tutoring session
 * @param {string} id - Session ID
 * @param {Object} sessionData - Update data
 * @returns {Promise<Object>}
 */
export async function updateSession(id, sessionData) {
  try {
    // Remove undefined values
    const cleanedData = Object.fromEntries(
      Object.entries(sessionData).filter(([_, value]) => value !== undefined && value !== null)
    );

    cleanedData.updatedAt = new Date();

    await tutoringSessionRepository.save(id, cleanedData);
    return await getSessionById(id);
  } catch (error) {
    console.error(`Error updating session ${id}:`, error);
    throw error;
  }
}

/**
 * Book a specific slot for a student
 * @param {Object} slot - Slot data
 * @param {string} studentEmail - Student email
 * @param {string} studentName - Student name
 * @param {string} notes - Additional notes
 * @param {string} selectedCourse - Selected course
 * @returns {Promise<Object>}
 */
export async function bookSpecificSlot(slot, studentEmail, studentName, notes = '', selectedCourse = null) {
  try {
    console.log(`Booking slot ${slot.id} for student ${studentEmail}`);

    // Verify slot is available
    if (slot.isBooked) {
      throw new Error('Este horario ya no está disponible');
    }

    // Verify slot is not already booked in database
    const existingBooking = await getSlotBooking(slot.parentAvailabilityId, slot.slotIndex);
    if (existingBooking) {
      throw new Error('Este horario ya fue reservado por otro estudiante');
    }

    // Extract course
    let extractedCourse = 'Tutoría General';
    if (selectedCourse && selectedCourse !== '') {
      extractedCourse = selectedCourse;
    } else if (slot.course && slot.course !== '') {
      extractedCourse = slot.course;
    } else if (slot.title) {
      extractedCourse = courseHelper.extractCourseFromTitle(slot.title);
    }

    // Get tutor information
    const tutorDocumentId = slot.tutorId;
    if (!tutorDocumentId) {
      throw new Error('Tutor ID is required');
    }

    let tutorEmail = slot.tutorEmail;
    if (!tutorEmail) {
      try {
        const tutorUser = await userService.getUserById(tutorDocumentId);
        tutorEmail = tutorUser.email;
      } catch (error) {
        console.warn(`Could not get tutor email for ${tutorDocumentId}:`, error);
      }
    }

    // Get student document ID from email
    let studentDocumentId = studentEmail;
    if (studentEmail.includes('@')) {
      try {
        const studentUser = await userService.getUserByEmail(studentEmail);
        if (studentUser) {
          studentDocumentId = studentUser.uid;
        }
      } catch (error) {
        console.warn(`Could not get student ID for ${studentEmail}:`, error);
      }
    }

    const sessionData = {
      tutorId: tutorDocumentId,
      studentId: studentDocumentId,
      tutorEmail: tutorEmail || '',
      studentEmail: studentEmail,
      studentName: studentName,
      scheduledStart: new Date(slot.startDateTime),
      scheduledEnd: new Date(slot.endDateTime),
      scheduledDateTime: new Date(slot.startDateTime),
      endDateTime: new Date(slot.endDateTime),
      course: extractedCourse,
      courseId: extractedCourse, // Required field
      location: slot.location || 'Por definir',
      price: 50000,
      parentAvailabilityId: slot.parentAvailabilityId,
      slotIndex: slot.slotIndex,
      slotId: slot.id,
      googleEventId: slot.googleEventId,
      notes: notes || '',
      status: 'scheduled',
      paymentStatus: 'pending',
    };

    const session = await createSession(sessionData);

    // Create Calico Calendar event
    try {
      const calendarEventResult = await calicoCalendarService.createTutoringSessionEvent({
        summary: `Tutoría ${extractedCourse || 'General'}`,
        description: `Sesión de tutoría agendada a través de Calico.\n\nMateria: ${extractedCourse}\nTutor: ${tutorEmail || tutorDocumentId}\nEstudiante: ${studentName || studentEmail}\n\nNotas: ${notes || 'Sin notas adicionales'}\n\nID de sesión: ${session.id}`,
        startDateTime: new Date(slot.startDateTime),
        endDateTime: new Date(slot.endDateTime),
        attendees: [studentEmail],
        location: slot.location || 'Por definir',
        tutorEmail: tutorEmail || '',
        tutorId: tutorDocumentId,
        tutorName: tutorEmail || tutorDocumentId,
      });

      if (calendarEventResult.success && calendarEventResult.eventId) {
        await updateSession(session.id, {
          calicoCalendarEventId: calendarEventResult.eventId,
          calicoCalendarHtmlLink: calendarEventResult.htmlLink || undefined,
          meetLink: calendarEventResult.meetLink || undefined,
        });
        console.log(`Calico Calendar event created: ${calendarEventResult.eventId}`);
      } else if (calendarEventResult.warning) {
        console.warn(`Calendar warning: ${calendarEventResult.warning}`);
      }
    } catch (calendarError) {
      console.warn(`Error creating calendar event (session still created): ${calendarError.message}`);
    }

    // Create slot booking
    await createSlotBooking({
      parentAvailabilityId: slot.parentAvailabilityId,
      slotIndex: slot.slotIndex,
      slotId: slot.id,
      tutorEmail: tutorEmail || '',
      studentEmail: studentEmail,
      sessionId: session.id,
      slotStartTime: new Date(slot.startDateTime),
      slotEndTime: new Date(slot.endDateTime),
      course: extractedCourse,
    });

    console.log(`Slot ${slot.id} booked successfully for ${studentEmail}`);
    return session;
  } catch (error) {
    console.error('Error booking specific slot:', error);
    throw error;
  }
}

/**
 * Create a slot booking
 * @param {Object} bookingData - Booking data
 * @returns {Promise<string>}
 */
export async function createSlotBooking(bookingData) {
  try {
    const id = await slotBookingRepository.save(undefined, {
      ...bookingData,
      bookedAt: new Date(),
    });
    console.log(`Slot booking created with ID: ${id}`);
    return id;
  } catch (error) {
    console.error('Error creating slot booking:', error);
    throw error;
  }
}

/**
 * Get slot booking by parent availability and slot index
 * @param {string} parentAvailabilityId - Parent availability ID
 * @param {number} slotIndex - Slot index
 * @returns {Promise<Object|null>}
 */
export async function getSlotBooking(parentAvailabilityId, slotIndex) {
  try {
    return await slotBookingRepository.findByParentAndIndex(parentAvailabilityId, slotIndex);
  } catch (error) {
    console.error('Error getting slot booking:', error);
    return null;
  }
}

/**
 * Get all slot bookings for an availability
 * @param {string} parentAvailabilityId - Parent availability ID
 * @returns {Promise<Array>}
 */
export async function getSlotBookingsForAvailability(parentAvailabilityId) {
  try {
    return await slotBookingRepository.findByAvailability(parentAvailabilityId);
  } catch (error) {
    console.error('Error getting slot bookings for availability:', error);
    return [];
  }
}

/**
 * Get slot bookings for a tutor
 * @param {string} tutorEmail - Tutor email
 * @returns {Promise<Array>}
 */
export async function getSlotBookingsForTutor(tutorEmail) {
  try {
    return await slotBookingRepository.findByTutor(tutorEmail);
  } catch (error) {
    console.error('Error getting slot bookings for tutor:', error);
    return [];
  }
}

/**
 * Cancel a slot booking
 * @param {string} sessionId - Session ID
 * @param {string} cancelledBy - Who cancelled
 * @returns {Promise<void>}
 */
export async function cancelSlotBooking(sessionId, cancelledBy) {
  try {
    const session = await getSessionById(sessionId);

    // Update session status
    await updateSession(sessionId, {
      status: 'cancelled',
      cancelledBy: cancelledBy,
      cancelledAt: new Date(),
    });

    // Delete slot booking
    if (session.parentAvailabilityId && session.slotIndex !== undefined) {
      await slotBookingRepository.deleteByParentAndIndex(
        session.parentAvailabilityId,
        session.slotIndex,
        sessionId
      );
    }

    console.log(`Session and slot booking cancelled: ${sessionId}`);
  } catch (error) {
    console.error('Error cancelling slot booking:', error);
    throw error;
  }
}

/**
 * Accept a pending tutoring session
 * @param {string} sessionId - Session ID
 * @param {string} tutorId - Tutor ID
 * @returns {Promise<Object>}
 */
export async function acceptTutoringSession(sessionId, tutorId) {
  try {
    const session = await getSessionById(sessionId);

    if (session.tutorId !== tutorId) {
      throw new Error('Unauthorized to accept this session');
    }

    if (session.status !== 'pending') {
      throw new Error('Session is no longer pending');
    }

    const updated = await updateSession(sessionId, {
      status: 'scheduled',
      tutorApprovalStatus: 'approved',
      acceptedAt: new Date(),
    });

    console.log(`Session accepted: ${sessionId}`);
    return updated;
  } catch (error) {
    console.error('Error accepting session:', error);
    throw error;
  }
}

/**
 * Reject a pending tutoring session
 * @param {string} sessionId - Session ID
 * @param {string} tutorId - Tutor ID
 * @param {string} reason - Rejection reason
 * @returns {Promise<Object>}
 */
export async function rejectTutoringSession(sessionId, tutorId, reason = '') {
  try {
    const session = await getSessionById(sessionId);

    if (session.tutorId !== tutorId) {
      throw new Error('Unauthorized to reject this session');
    }

    if (session.status !== 'pending') {
      throw new Error('Session is no longer pending');
    }

    const updated = await updateSession(sessionId, {
      status: 'rejected',
      tutorApprovalStatus: 'declined',
      rejectedAt: new Date(),
      rejectionReason: reason,
    });

    console.log(`Session rejected: ${sessionId}`);
    return updated;
  } catch (error) {
    console.error('Error rejecting session:', error);
    throw error;
  }
}

/**
 * Decline a pending tutoring session
 * @param {string} sessionId - Session ID
 * @param {string} tutorId - Tutor ID
 * @returns {Promise<Object>}
 */
export async function declineTutoringSession(sessionId, tutorId) {
  try {
    const session = await getSessionById(sessionId);

    if (session.tutorId !== tutorId) {
      throw new Error('Unauthorized to decline this session');
    }

    if (session.status !== 'pending') {
      throw new Error('Session is no longer pending');
    }

    const updated = await updateSession(sessionId, {
      status: 'declined',
      tutorApprovalStatus: 'declined',
      declinedAt: new Date(),
    });

    // Remove slot booking
    if (session.parentAvailabilityId && session.slotIndex !== undefined) {
      await slotBookingRepository.deleteByParentAndIndex(
        session.parentAvailabilityId,
        session.slotIndex,
        sessionId
      );
    }

    console.log(`Session declined: ${sessionId}`);
    return updated;
  } catch (error) {
    console.error('Error declining session:', error);
    throw error;
  }
}

/**
 * Get pending sessions for a tutor
 * @param {string} tutorId - Tutor ID
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>}
 */
export async function getPendingSessionsForTutor(tutorId, limit = 50) {
  try {
    return await tutoringSessionRepository.findByTutorAndApprovalStatus(tutorId, 'pending', limit);
  } catch (error) {
    console.error('Error getting pending sessions:', error);
    throw error;
  }
}

/**
 * Complete a tutoring session
 * @param {string} sessionId - Session ID
 * @param {number} rating - Session rating
 * @param {string} comment - Session comment
 * @returns {Promise<Object>}
 */
export async function completeSession(sessionId, rating, comment) {
  try {
    const updateData = {
      status: 'completed',
      completedAt: new Date(),
    };

    if (rating) {
      updateData.rating = rating;
      updateData.review = comment;
    }

    return await updateSession(sessionId, updateData);
  } catch (error) {
    console.error('Error completing session:', error);
    throw error;
  }
}

/**
 * Calculate average rating from sessions
 * @param {Array} sessions - Sessions
 * @returns {number}
 */
function calculateAverageRating(sessions) {
  const rated = sessions.filter((s) => s.rating && s.rating > 0);
  if (rated.length === 0) return 0;
  const sum = rated.reduce((acc, s) => acc + s.rating, 0);
  return parseFloat((sum / rated.length).toFixed(2));
}

/**
 * Get tutor session statistics
 * @param {string} tutorId - Tutor ID
 * @returns {Promise<Object>}
 */
export async function getTutorSessionStats(tutorId) {
  try {
    const sessions = await getSessionsByTutor(tutorId, 1000);

    const stats = {
      total: sessions.length,
      completed: sessions.filter((s) => s.status === 'completed').length,
      scheduled: sessions.filter((s) => s.status === 'scheduled').length,
      cancelled: sessions.filter((s) => s.status === 'cancelled').length,
      totalEarnings: sessions
        .filter((s) => s.status === 'completed' && s.paymentStatus === 'paid')
        .reduce((sum, s) => sum + (s.price || 0), 0),
      averageRating: calculateAverageRating(sessions),
    };

    return stats;
  } catch (error) {
    console.error('Error getting tutor session stats:', error);
    return {
      total: 0,
      completed: 0,
      scheduled: 0,
      cancelled: 0,
      totalEarnings: 0,
      averageRating: 0,
    };
  }
}

/**
 * Get student tutoring history
 * @param {string} studentId - Student ID
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>}
 */
export async function getStudentTutoringHistory(studentId, limit = 100) {
  try {
    return await getSessionsByStudent(studentId, limit);
  } catch (error) {
    console.error('Error getting student tutoring history:', error);
    throw error;
  }
}

/**
 * Filter sessions by date
 * @param {Array} sessions - Sessions
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array}
 */
export function filterByDate(sessions, startDate, endDate) {
  return sessions.filter((session) => {
    const sessionDate = new Date(session.scheduledStart);
    if (startDate && sessionDate < startDate) return false;
    if (endDate && sessionDate > endDate) return false;
    return true;
  });
}

/**
 * Filter sessions by course
 * @param {Array} sessions - Sessions
 * @param {string} course - Course name
 * @returns {Array}
 */
export function filterByCourse(sessions, course) {
  return sessions.filter((session) => 
    session.course && session.course.toLowerCase().includes(course.toLowerCase())
  );
}

/**
 * Get history statistics
 * @param {Array} sessions - Sessions
 * @returns {Object}
 */
export function getHistoryStats(sessions) {
  return {
    total: sessions.length,
    completed: sessions.filter((s) => s.status === 'completed').length,
    scheduled: sessions.filter((s) => s.status === 'scheduled').length,
    cancelled: sessions.filter((s) => s.status === 'cancelled').length,
    averageRating: calculateAverageRating(sessions),
  };
}

/**
 * Get unique courses from sessions
 * @param {Array} sessions - Sessions
 * @returns {Array}
 */
export function getUniqueCourses(sessions) {
  const courseSet = new Set();
  sessions.forEach((session) => {
    if (session.course) {
      courseSet.add(session.course);
    }
  });
  return Array.from(courseSet).sort();
}

/**
 * Add or update a review for a tutoring session
 * @param {string} sessionId - Session ID
 * @param {Object} review - Review data
 * @returns {Promise<Object>}
 */
export async function addReview(sessionId, review) {
  try {
    if (!review?.reviewerEmail) {
      throw new Error('Reviewer email is required');
    }
    if (!review?.stars || review.stars < 1 || review.stars > 5) {
      throw new Error('Stars must be between 1 and 5');
    }

    const session = await tutoringSessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const normalizedReview = {
      reviewerEmail: review.reviewerEmail,
      reviewerName: review.reviewerName || review.reviewerEmail,
      stars: review.stars,
      comment: review.comment || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await tutoringSessionRepository.addOrUpdateReview(sessionId, normalizedReview);

    return {
      success: true,
      sessionId,
      review: normalizedReview,
      ...result,
    };
  } catch (error) {
    console.error('Error adding review:', error);
    throw error;
  }
}

/**
 * Get reviews for a tutoring session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>}
 */
export async function getReviews(sessionId) {
  try {
    const session = await tutoringSessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    return {
      success: true,
      sessionId,
      reviews: session.reviews || [],
      averageRating: session.averageRating || session.rating || 0,
    };
  } catch (error) {
    console.error('Error getting reviews:', error);
    throw error;
  }
}

export default {
  getSessionById,
  getSessionsByTutor,
  getSessionsByStudent,
  createSession,
  updateSession,
  bookSpecificSlot,
  createSlotBooking,
  getSlotBooking,
  getSlotBookingsForAvailability,
  getSlotBookingsForTutor,
  cancelSlotBooking,
  acceptTutoringSession,
  rejectTutoringSession,
  declineTutoringSession,
  getPendingSessionsForTutor,
  completeSession,
  getTutorSessionStats,
  getStudentTutoringHistory,
  filterByDate,
  filterByCourse,
  getHistoryStats,
  getUniqueCourses,
  addReview,
  getReviews,
};
