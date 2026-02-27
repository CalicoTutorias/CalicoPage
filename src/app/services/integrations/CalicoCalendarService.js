/**
 * CalicoCalendarService
 * 
 * Service to manage tutoring session events in Calico's central calendar
 * This calendar is managed by a Google Service Account and stores all tutoring sessions
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

class CalicoCalendarServiceClass {
  /**
   * Check if Calico Calendar service is configured on the backend
   * Backend: GET /calico-calendar/status
   * @returns {Promise<Object>} Configuration status
   */
  async checkStatus() {
    try {
      const response = await fetch(`${API_BASE_URL}/calico-calendar/status`, {
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
        configured: data.configured || false,
        message: data.message || 'Unknown status',
      };
    } catch (error) {
      console.error('Error checking Calico Calendar status:', error);
      return {
        configured: false,
        message: 'Error checking status',
        error: error.message,
      };
    }
  }

  /**
   * Create a tutoring session event in Calico's central calendar
   * Backend: POST /calico-calendar/tutoring-session
   * @param {Object} sessionData - Session details
   * @returns {Promise<Object>} Created event result
   */
  async createTutoringSession(sessionData) {
    try {
      const {
        summary,
        description,
        startDateTime,
        endDateTime,
        attendees = [],
        location = 'Virtual/Presencial',
        tutorEmail,
        tutorName,
      } = sessionData;

      // Validate required fields
      if (!summary || !startDateTime || !endDateTime || !tutorEmail) {
        throw new Error('summary, startDateTime, endDateTime, and tutorEmail are required');
      }

      // Build request body
      const requestBody = {
        summary,
        description,
        startDateTime: this.toISOString(startDateTime),
        endDateTime: this.toISOString(endDateTime),
        attendees: Array.isArray(attendees) ? attendees : [attendees].filter(Boolean),
        location,
        tutorEmail,
        tutorName: tutorName || tutorEmail,
      };

      const response = await fetch(`${API_BASE_URL}/calico-calendar/tutoring-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: data.success || true,
        message: data.message || 'Tutoring session created successfully',
        eventId: data.eventId,
        htmlLink: data.htmlLink,
        hangoutLink: data.hangoutLink,
        meetLink: data.meetLink,
        event: data.event,
      };
    } catch (error) {
      console.error('Error creating tutoring session:', error);
      throw new Error(error.message || 'Failed to create tutoring session in central calendar');
    }
  }

  /**
   * Get a tutoring session event by ID
   * Backend: GET /calico-calendar/tutoring-session/:eventId
   * @param {string} eventId - Google Calendar event ID
   * @returns {Promise<Object>} Event details
   */
  async getTutoringSession(eventId) {
    try {
      if (!eventId) {
        throw new Error('eventId is required');
      }

      const response = await fetch(`${API_BASE_URL}/calico-calendar/tutoring-session/${eventId}`, {
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
        event: data.event,
      };
    } catch (error) {
      console.error('Error getting tutoring session:', error);
      throw new Error(error.message || 'Failed to get tutoring session');
    }
  }

  /**
   * Update a tutoring session event
   * Backend: PUT /calico-calendar/tutoring-session/:eventId
   * @param {string} eventId - Google Calendar event ID
   * @param {Object} updateData - Fields to update
   * @returns {Promise<Object>} Updated event result
   */
  async updateTutoringSession(eventId, updateData) {
    try {
      if (!eventId) {
        throw new Error('eventId is required');
      }

      // Build request body (only include fields that are provided)
      const requestBody = {};
      
      if (updateData.summary !== undefined) requestBody.summary = updateData.summary;
      if (updateData.description !== undefined) requestBody.description = updateData.description;
      if (updateData.location !== undefined) requestBody.location = updateData.location;
      
      if (updateData.startDateTime) {
        requestBody.startDateTime = this.toISOString(updateData.startDateTime);
      }
      if (updateData.endDateTime) {
        requestBody.endDateTime = this.toISOString(updateData.endDateTime);
      }

      const response = await fetch(`${API_BASE_URL}/calico-calendar/tutoring-session/${eventId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: data.success || true,
        message: data.message || 'Tutoring session updated successfully',
        eventId: data.eventId,
        event: data.event,
      };
    } catch (error) {
      console.error('Error updating tutoring session:', error);
      throw new Error(error.message || 'Failed to update tutoring session');
    }
  }

  /**
   * Cancel a tutoring session event (marks as cancelled, keeps history)
   * Backend: POST /calico-calendar/tutoring-session/:eventId/cancel
   * @param {string} eventId - Google Calendar event ID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelTutoringSession(eventId, reason = 'Sesión cancelada') {
    try {
      if (!eventId) {
        throw new Error('eventId is required');
      }

      const params = new URLSearchParams();
      if (reason) {
        params.append('reason', reason);
      }
      const queryString = params.toString();
      const url = `${API_BASE_URL}/calico-calendar/tutoring-session/${eventId}/cancel${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        method: 'POST',
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
        message: data.message || 'Tutoring session cancelled successfully',
        eventId: data.eventId,
        status: data.status || 'cancelled',
      };
    } catch (error) {
      console.error('Error cancelling tutoring session:', error);
      throw new Error(error.message || 'Failed to cancel tutoring session');
    }
  }

  /**
   * Delete a tutoring session event completely
   * Backend: DELETE /calico-calendar/tutoring-session/:eventId
   * @param {string} eventId - Google Calendar event ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteTutoringSession(eventId) {
    try {
      if (!eventId) {
        throw new Error('eventId is required');
      }

      const response = await fetch(`${API_BASE_URL}/calico-calendar/tutoring-session/${eventId}`, {
        method: 'DELETE',
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
        message: data.message || 'Tutoring session deleted successfully',
        eventId: data.eventId,
        deleted: data.deleted || true,
      };
    } catch (error) {
      console.error('Error deleting tutoring session:', error);
      throw new Error(error.message || 'Failed to delete tutoring session');
    }
  }

  /**
   * Helper: Convert date to ISO string
   * @param {Date|string} date - Date to convert
   * @returns {string} ISO string
   */
  toISOString(date) {
    if (date instanceof Date) {
      return date.toISOString();
    }
    if (typeof date === 'string') {
      // If already ISO format, return as is
      if (date.includes('T') || date.includes('Z')) {
        return date;
      }
      // Otherwise, try to parse
      return new Date(date).toISOString();
    }
    throw new Error('Invalid date format');
  }

  /**
   * Helper: Build event summary for tutoring session
   * @param {string} course - Course name
   * @param {string} tutorName - Tutor name
   * @param {string} studentName - Student name
   * @returns {string} Event summary
   */
  buildEventSummary(course, tutorName, studentName) {
    return `${course} - ${tutorName} con ${studentName}`;
  }

  /**
   * Helper: Build event description for tutoring session
   * @param {Object} sessionDetails - Session details
   * @returns {string} Event description
   */
  buildEventDescription(sessionDetails) {
    const {
      course,
      tutorName,
      tutorEmail,
      studentName,
      studentEmail,
      notes,
    } = sessionDetails;

    let description = `Sesión de tutoría agendada a través de Calico.\n\n`;
    
    if (course) description += `Materia: ${course}\n`;
    if (tutorName) description += `Tutor: ${tutorName}`;
    if (tutorEmail) description += ` (${tutorEmail})`;
    description += '\n';
    
    if (studentName) description += `Estudiante: ${studentName}`;
    if (studentEmail) description += ` (${studentEmail})`;
    description += '\n';
    
    if (notes) description += `\nNotas: ${notes}\n`;
    
    description += `\nEste evento fue creado en el calendario central de Calico.`;
    
    return description;
  }

  /**
   * Helper: Validate event data
   * @param {Object} eventData - Event data to validate
   * @returns {Object} Validation result { isValid, errors }
   */
  validateEventData(eventData) {
    const errors = [];

    if (!eventData.summary || eventData.summary.trim() === '') {
      errors.push('El título del evento es requerido');
    }

    if (!eventData.startDateTime) {
      errors.push('La fecha y hora de inicio son requeridas');
    }

    if (!eventData.endDateTime) {
      errors.push('La fecha y hora de fin son requeridas');
    }

    if (eventData.startDateTime && eventData.endDateTime) {
      const start = new Date(eventData.startDateTime);
      const end = new Date(eventData.endDateTime);
      
      if (end <= start) {
        errors.push('La hora de fin debe ser posterior a la hora de inicio');
      }

      // Check if start time is in the past
      const now = new Date();
      if (start < now) {
        errors.push('No se puede crear un evento en el pasado');
      }
    }

    if (!eventData.tutorEmail || eventData.tutorEmail.trim() === '') {
      errors.push('El email del tutor es requerido');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (eventData.tutorEmail && !emailRegex.test(eventData.tutorEmail)) {
      errors.push('El email del tutor no es válido');
    }

    // Validate attendees emails if provided
    if (eventData.attendees && Array.isArray(eventData.attendees)) {
      eventData.attendees.forEach((attendee, index) => {
        const email = typeof attendee === 'string' ? attendee : attendee.email;
        if (email && !emailRegex.test(email)) {
          errors.push(`Email inválido en asistente ${index + 1}`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const CalicoCalendarService = new CalicoCalendarServiceClass();
export default CalicoCalendarService;

