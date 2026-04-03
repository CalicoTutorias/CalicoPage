/**
 * TutoringSessionService
 *
 * Service to manage tutoring sessions.
 * Uses authFetch to automatically inject the JWT token.
 * Never throws on HTTP errors — returns null / empty defaults instead.
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

class TutoringSessionServiceClass {
  /**
   * Get a specific session by ID
   * @returns {Promise<Object|null>}
   */
  async getSessionById(sessionId) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}`);
    if (ok && data?.success) return data.session || null;
    return null;
  }

  /**
   * Get sessions for the authenticated user
   * @param {'tutor'|'student'} role
   * @param {string} [status]
   * @returns {Promise<Array>}
   */
  async getMySessions(role, status = null) {
    const params = new URLSearchParams({ role });
    if (status) params.append('status', status);
    const { ok, data } = await authFetch(`${API_BASE_URL}/sessions?${params.toString()}`);
    if (ok && data?.success) return data.sessions || [];
    return [];
  }

  /**
   * Get all sessions for the authenticated tutor
   * @returns {Promise<Array>}
   */
  async getTutorSessions(status = null) {
    return this.getMySessions('tutor', status);
  }

  /**
   * Get all sessions for the authenticated student
   * @returns {Promise<Array>}
   */
  async getStudentSessions(status = null) {
    return this.getMySessions('student', status);
  }

  /**
   * Get pending sessions for the authenticated tutor
   * @returns {Promise<Array>}
   */
  async getPendingSessionsForTutor() {
    return this.getMySessions('tutor', 'Pending');
  }

  /**
   * Create a new tutoring session (student action)
   * @returns {Promise<{ success: boolean, session: Object|null, error?: string }>}
   */
  async createSession(sessionData) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/sessions`, {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });

    if (ok && data?.success) return { success: true, session: data.session || null };
    const errorMsg = data?.error || data?.message || 'Failed to create session';
    console.error('Error creating session:', errorMsg);
    return { success: false, session: null, error: errorMsg };
  }

  /**
   * Accept a tutoring session (tutor action)
   * @returns {Promise<{ success: boolean, session: Object|null, error?: string }>}
   */
  async acceptSession(sessionId) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/accept`, {
      method: 'PUT',
    });
    if (ok && data?.success) return { success: true, session: data.session || null };
    return { success: false, session: null, error: data?.error || 'Failed to accept session' };
  }

  /**
   * Reject a tutoring session (tutor action)
   * @param {string} sessionId
   * @param {string} [reason]
   * @returns {Promise<{ success: boolean, session: Object|null, error?: string }>}
   */
  async rejectSession(sessionId, reason = '') {
    const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    const { ok, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/reject${params}`, {
      method: 'PUT',
    });
    if (ok && data?.success) return { success: true, session: data.session || null };
    return { success: false, session: null, error: data?.error || 'Failed to reject session' };
  }

  /**
   * Cancel a tutoring session (tutor or student)
   * @param {string} sessionId
   * @param {string} [reason]
   * @returns {Promise<{ success: boolean, session: Object|null, error?: string }>}
   */
  async cancelSession(sessionId, reason = '') {
    const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    const { ok, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/cancel${params}`, {
      method: 'PUT',
    });
    if (ok && data?.success) return { success: true, session: data.session || null };
    return { success: false, session: null, error: data?.error || 'Failed to cancel session' };
  }

  /**
   * Mark a session as completed (tutor action)
   * @returns {Promise<{ success: boolean, session: Object|null, error?: string }>}
   */
  async completeSession(sessionId) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/complete`, {
      method: 'PUT',
    });
    if (ok && data?.success) return { success: true, session: data.session || null };
    return { success: false, session: null, error: data?.error || 'Failed to complete session' };
  }

  /**
   * Get student dashboard stats (sessions this week, total completed, active courses, avg rating).
   * @returns {Promise<{ sessionsThisWeek, totalCompleted, activeCoursesCount, averageRating }|null>}
   */
  async getMyStats() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/sessions/stats`);
    if (ok && data?.success) return data.stats || null;
    return null;
  }

  /**
   * Join a group tutoring session (student action)
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async joinSession(sessionId) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/join`, {
      method: 'POST',
    });
    if (ok && data?.success) return { success: true };
    return { success: false, error: data?.error || 'Failed to join session' };
  }

  /**
   * Submit or update a review for a session
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async addReview(sessionId, reviewData) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(reviewData),
    });
    if (ok && data?.success) return { success: true };
    return { success: false, error: data?.error || 'Failed to submit review' };
  }

  /**
   * Generic session update (e.g. payment status fields)
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async updateSession(sessionId, updateData) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
    if (ok && data?.success) return { success: true, session: data.session || null };
    return { success: false, error: data?.error || 'Failed to update session' };
  }

  /**
   * Resolve a course name to its ID
   * @param {string} courseName
   * @returns {Promise<string|null>}
   */
  async getCourseId(courseName) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/courses`);
    if (!ok || !data) return null;
    const list = Array.isArray(data) ? data : (data.courses || data.data || []);
    const found = list.find(c => c.course === courseName || c.name === courseName);
    return found?.id || found?.uid || null;
  }

  /**
   * Book a specific availability slot
   * @returns {Promise<{ success: boolean, session?: Object, error?: string }>}
   */
  async bookSpecificSlot(slot, studentEmail, studentName, notes, course, courseId) {
    return this.createSession({
      tutorEmail: slot.tutorEmail || slot.tutorId,
      tutorId: slot.tutorId,
      tutorName: slot.tutorName,
      studentEmail,
      studentName,
      course: course || slot.course || 'Tutoring',
      courseId: courseId || slot.courseId || course || slot.course || 'Tutoring',
      scheduledDateTime: slot.startDateTime,
      endDateTime: slot.endDateTime,
      location: slot.location || 'Virtual',
      notes,
      price: slot.price || 50000,
      parentAvailabilityId: slot.parentAvailabilityId || slot.id,
      slotId: slot.id,
      status: 'pending',
      paymentStatus: 'pending',
      requestedAt: new Date(),
    });
  }
}

// Export singleton instance
export const TutoringSessionService = new TutoringSessionServiceClass();
export default TutoringSessionService;
