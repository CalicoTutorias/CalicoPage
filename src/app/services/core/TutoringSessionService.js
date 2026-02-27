/**
 * TutoringSessionService
 * 
 * Service to manage tutoring sessions
 *  Matches backend TutoringSessionController
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

class TutoringSessionServiceClass {
  /**
   * Get a specific session by ID
   * Backend: GET /tutoring-sessions/:id
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Session data
   */
  async getSessionById(sessionId) {
    try {
      const response = await fetch(`${API_BASE_URL}/tutoring-sessions/${sessionId}`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        return data.session || null;
      }
      return null;
    } catch (error) {
      console.error('Error fetching session:', error);
      return null;
    }
  }

  /**
   * Get all sessions for a tutor
   * Backend: GET /tutoring-sessions/tutor/:tutorId?limit=50
   * @param {string} tutorId - Tutor ID (email)
   * @param {number} limit - Max number of sessions to return
   * @returns {Promise<Array>} Array of tutoring sessions
   */
  async getTutorSessions(tutorId, limit = 50) {
    try {
      const params = new URLSearchParams();
      params.append('limit', limit.toString());
      const queryString = params.toString();
      const url = `${API_BASE_URL}/tutoring-sessions/tutor/${tutorId}?${queryString}`;

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        return data.sessions || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching tutor sessions:', error);
      return [];
    }
  }

  /**
   * Get all sessions for a student
   * Backend: GET /tutoring-sessions/student/:studentId?limit=50
   * @param {string} studentId - Student ID (email)
   * @param {number} limit - Max number of sessions to return
   * @returns {Promise<Array>} Array of tutoring sessions
   */
  async getStudentSessions(studentId, limit = 50) {
    try {
      const params = new URLSearchParams();
      params.append('limit', limit.toString());
      const queryString = params.toString();
      const url = `${API_BASE_URL}/tutoring-sessions/student/${studentId}?${queryString}`;

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        return data.sessions || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching student sessions:', error);
      return [];
    }
  }

  /**
   * Get pending sessions for a tutor (awaiting approval)
   * This is an alias for getTutorSessions that filters by status
   * @param {string} tutorEmail - Tutor email
   * @returns {Promise<Array>} Array of pending sessions
   */
  async getPendingSessionsForTutor(tutorEmail) {
    try {
      const sessions = await this.getTutorSessions(tutorEmail);
      return sessions.filter(session => 
        session.status === 'pending' || session.status === 'requested'
      );
    } catch (error) {
      console.error('Error fetching pending sessions:', error);
      return [];
    }
  }

  /**
   * Create a new tutoring session
   * Backend: POST /tutoring-sessions
   * @param {Object} sessionData - Session data
   * @returns {Promise<Object>} Created session
   */
  async createSession(sessionData) {
    try {
      console.log('Creating session:', sessionData);
      const response = await fetch(`${API_BASE_URL}/tutoring-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(sessionData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        return data.session || null;
      }
      throw new Error(data.error || 'Failed to create session');
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  /**
   * Update a tutoring session
   * Backend: PUT /tutoring-sessions/:id
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated session
   */
  async updateSession(sessionId, updates) {
    try {
      const response = await fetch(`${API_BASE_URL}/tutoring-sessions/${sessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        return data.session || null;
      }
      throw new Error(data.error || 'Failed to update session');
    } catch (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  }

  /**
   * Approve a tutoring session (tutor approves student request)
   * Uses updateSession to change status
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Approved session
   */
  async approveSession(sessionId) {
    try {
      return await this.updateSession(sessionId, { status: 'approved' });
    } catch (error) {
      console.error('Error approving session:', error);
      throw error;
    }
  }

  /**
   * Reject a tutoring session
   * Uses updateSession to change status
   * @param {string} sessionId - Session ID
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} Result
   */
  async rejectSession(sessionId, reason = '') {
    try {
      return await this.updateSession(sessionId, { 
        status: 'rejected',
        rejectionReason: reason 
      });
    } catch (error) {
      console.error('Error rejecting session:', error);
      throw error;
    }
  }

  /**
   * Cancel a tutoring session
   * Uses updateSession to change status
   * @param {string} sessionId - Session ID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Object>} Result
   */
  async cancelSession(sessionId, reason = '') {
    try {
      return await this.updateSession(sessionId, { 
        status: 'cancelled',
        cancellationReason: reason 
      });
    } catch (error) {
      console.error('Error cancelling session:', error);
      throw error;
    }
  }

  /**
   * Reschedule a tutoring session
   * Uses updateSession to change dates
   * @param {string} sessionId - Session ID
   * @param {Object} newSchedule - New schedule details (start, end)
   * @returns {Promise<Object>} Rescheduled session
   */
  async rescheduleSession(sessionId, newSchedule) {
    try {
      return await this.updateSession(sessionId, {
        start: newSchedule.start,
        end: newSchedule.end,
        status: 'rescheduled'
      });
    } catch (error) {
      console.error('Error rescheduling session:', error);
      throw error;
    }
  }

  /**
   * Mark a session as completed
   * Uses updateSession to change status
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Completed session
   */
  async completeSession(sessionId) {
    try {
      return await this.updateSession(sessionId, { status: 'completed' });
    } catch (error) {
      console.error('Error completing session:', error);
      throw error;
    }
  }

  /**
   * Get student tutoring history with tutor information
   * Backend: GET /tutoring-sessions/student/:studentId/history?startDate=&endDate=&course=&limit=
   * @param {string} studentId - Student ID (email)
   * @param {Object} filters - Optional filters { startDate, endDate, course, limit }
   * @returns {Promise<Object>} { sessions, count, stats, uniqueCourses }
   */
  async getStudentHistory(studentId, filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.course) params.append('course', filters.course);
      if (filters.limit) params.append('limit', filters.limit.toString());
      const queryString = params.toString();
      const url = `${API_BASE_URL}/tutoring-sessions/student/${studentId}/history${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: data.success || true,
        sessions: data.sessions || [],
        count: data.count || 0,
        stats: data.stats || {},
        uniqueCourses: data.uniqueCourses || data.uniqueCourses || [],
      };
    } catch (error) {
      console.error('Error fetching student history:', error);
      return {
        success: false,
        sessions: [],
        count: 0,
        stats: {},
        uniqueCourses: [],
      };
    }
  }

  /**
   * Get unique courses from student history
   * Backend: GET /tutoring-sessions/student/:studentId/courses
   * @param {string} studentId - Student ID (email)
   * @returns {Promise<Array>} Array of unique courses
   */
  async getStudentCourses(studentId) {
    try {
      const response = await fetch(`${API_BASE_URL}/tutoring-sessions/student/${studentId}/courses`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: data.success || true,
        courses: data.courses || data.courses || [],
        count: data.count || 0,
      };
    } catch (error) {
      console.error('Error fetching student courses:', error);
      return {
        success: false,
        courses: [],
        count: 0,
      };
    }
  }

  // Backwards compatible alias
  async getStudentCourses(studentId) {
    return this.getStudentCourses(studentId);
  }

  /**
   * Get history statistics for a student
   * Backend: GET /tutoring-sessions/student/:studentId/stats
   * @param {string} studentId - Student ID (email)
   * @returns {Promise<Object>} Statistics object
   */
  async getStudentStats(studentId) {
    try {
      const response = await fetch(`${API_BASE_URL}/tutoring-sessions/student/${studentId}/stats`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: data.success || true,
        stats: data.stats || {},
      };
    } catch (error) {
      console.error('Error fetching student stats:', error);
      return {
        success: false,
        stats: {},
      };
    }
  }
}

// Export singleton instance
export const TutoringSessionService = new TutoringSessionServiceClass();
export default TutoringSessionService;

