/**
 * TutoringSessionService
 *
 * Service to manage tutoring sessions.
 * Uses authFetch to automatically inject the Firebase ID token.
 * Never throws on HTTP errors — returns null / empty defaults instead.
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';

class TutoringSessionServiceClass {
  /**
   * Get a specific session by ID
   */
  async getSessionById(sessionId) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/tutoring-sessions/${sessionId}`);
    if (ok && data?.success) {
      return data.session || null;
    }
    return null;
  }

  /**
   * Get all sessions for a tutor
   */
  async getTutorSessions(tutorId, limit = 50) {
    const params = new URLSearchParams({ limit: limit.toString() });
    const { ok, data } = await authFetch(
      `${API_BASE_URL}/tutoring-sessions/tutor/${tutorId}?${params.toString()}`
    );
    if (ok && data?.success) {
      return data.sessions || [];
    }
    return [];
  }

  /**
   * Get all sessions for a student
   */
  async getStudentSessions(studentId, limit = 50) {
    const params = new URLSearchParams({ limit: limit.toString() });
    const { ok, data } = await authFetch(
      `${API_BASE_URL}/tutoring-sessions/student/${studentId}?${params.toString()}`
    );
    if (ok && data?.success) {
      return data.sessions || [];
    }
    return [];
  }

  /**
   * Get pending sessions for a tutor (filters by status client-side)
   */
  async getPendingSessionsForTutor(tutorEmail) {
    const sessions = await this.getTutorSessions(tutorEmail);
    return sessions.filter(
      (session) => session.status === 'pending' || session.status === 'requested'
    );
  }

  /**
   * Create a new tutoring session
   * @returns {Promise<{ success: boolean, session: Object|null, error?: string }>}
   */
  async createSession(sessionData) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/tutoring-sessions`, {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });

    if (ok && data?.success) {
      return { success: true, session: data.session || null };
    }
    const errorMsg = data?.error || data?.message || 'Failed to create session';
    console.error('Error creating session:', errorMsg);
    return { success: false, session: null, error: errorMsg };
  }

  /**
   * Update a tutoring session
   * @returns {Promise<{ success: boolean, session: Object|null, error?: string }>}
   */
  async updateSession(sessionId, updates) {
    if (!sessionId || !updates) return { success: false, session: null };

    const { ok, data } = await authFetch(`${API_BASE_URL}/tutoring-sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    if (ok && data?.success) {
      return { success: true, session: data.session || null };
    }
    const errorMsg = data?.error || data?.message || 'Failed to update session';
    console.error('Error updating session:', errorMsg);
    return { success: false, session: null, error: errorMsg };
  }

  /**
   * Approve a tutoring session
   */
  async approveSession(sessionId) {
    return this.updateSession(sessionId, { status: 'approved' });
  }

  /**
   * Reject a tutoring session
   */
  async rejectSession(sessionId, reason = '') {
    return this.updateSession(sessionId, { status: 'rejected', rejectionReason: reason });
  }

  /**
   * Cancel a tutoring session
   */
  async cancelSession(sessionId, reason = '') {
    return this.updateSession(sessionId, { status: 'cancelled', cancellationReason: reason });
  }

  /**
   * Reschedule a tutoring session
   */
  async rescheduleSession(sessionId, newSchedule) {
    return this.updateSession(sessionId, {
      start: newSchedule.start,
      end: newSchedule.end,
      status: 'rescheduled',
    });
  }

  /**
   * Mark a session as completed
   */
  async completeSession(sessionId) {
    return this.updateSession(sessionId, { status: 'completed' });
  }

  /**
   * Get student tutoring history with tutor information
   */
  async getStudentHistory(studentId, filters = {}) {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.course) params.append('course', filters.course);
    if (filters.limit) params.append('limit', filters.limit.toString());
    const qs = params.toString();
    const url = `${API_BASE_URL}/tutoring-sessions/student/${studentId}/history${qs ? `?${qs}` : ''}`;

    const { ok, data } = await authFetch(url);
    if (ok && data) {
      return {
        success: true,
        sessions: data.sessions || [],
        count: data.count || 0,
        stats: data.stats || {},
        uniqueCourses: data.uniqueCourses || [],
      };
    }
    return { success: false, sessions: [], count: 0, stats: {}, uniqueCourses: [] };
  }

  /**
   * Get unique courses from student history
   */
  async getStudentCourses(studentId) {
    const { ok, data } = await authFetch(
      `${API_BASE_URL}/tutoring-sessions/student/${studentId}/courses`
    );
    if (ok && data) {
      return {
        success: true,
        courses: data.courses || [],
        count: data.count || 0,
      };
    }
    return { success: false, courses: [], count: 0 };
  }

  /**
   * Get history statistics for a student
   */
  async getStudentStats(studentId) {
    const { ok, data } = await authFetch(
      `${API_BASE_URL}/tutoring-sessions/student/${studentId}/stats`
    );
    if (ok && data) {
      return { success: true, stats: data.stats || {} };
    }
    return { success: false, stats: {} };
  }
}

// Export singleton instance
export const TutoringSessionService = new TutoringSessionServiceClass();
export default TutoringSessionService;
