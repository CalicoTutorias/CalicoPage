/**
 * CalicoCalendarService
 *
 * Service to manage tutoring session events in Calico's central calendar.
 * Uses authFetch to automatically inject the Firebase ID token.
 * Never throws on HTTP errors — returns graceful defaults instead.
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';

class CalicoCalendarServiceClass {
  /**
   * Check if Calico Calendar service is configured on the backend
   */
  async checkStatus() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/calico-calendar/status`);
    if (ok && data) {
      return {
        configured: data.configured || false,
        message: data.message || 'Unknown status',
      };
    }
    return { configured: false, message: 'Error checking status' };
  }

  /**
   * Create a tutoring session event in Calico's central calendar
   * @returns {Promise<{ success: boolean, error?: string, [key: string]: any }>}
   */
  async createTutoringSession(sessionData) {
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

    if (!summary || !startDateTime || !endDateTime || !tutorEmail) {
      return { success: false, error: 'summary, startDateTime, endDateTime, and tutorEmail are required' };
    }

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

    const { ok, data } = await authFetch(`${API_BASE_URL}/calico-calendar/tutoring-session`, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    if (ok && data) {
      return {
        success: true,
        message: data.message || 'Tutoring session created successfully',
        eventId: data.eventId,
        htmlLink: data.htmlLink,
        hangoutLink: data.hangoutLink,
        meetLink: data.meetLink,
        event: data.event,
      };
    }
    return { success: false, error: data?.error || data?.message || 'Failed to create tutoring session' };
  }

  /**
   * Get a tutoring session event by ID
   */
  async getTutoringSession(eventId) {
    if (!eventId) return { success: false, event: null };

    const { ok, data } = await authFetch(`${API_BASE_URL}/calico-calendar/tutoring-session/${eventId}`);
    if (ok && data) {
      return { success: true, event: data.event };
    }
    return { success: false, event: null };
  }

  /**
   * Update a tutoring session event
   */
  async updateTutoringSession(eventId, updateData) {
    if (!eventId) return { success: false, error: 'eventId is required' };

    const requestBody = {};
    if (updateData.summary !== undefined) requestBody.summary = updateData.summary;
    if (updateData.description !== undefined) requestBody.description = updateData.description;
    if (updateData.location !== undefined) requestBody.location = updateData.location;
    if (updateData.startDateTime) requestBody.startDateTime = this.toISOString(updateData.startDateTime);
    if (updateData.endDateTime) requestBody.endDateTime = this.toISOString(updateData.endDateTime);

    const { ok, data } = await authFetch(`${API_BASE_URL}/calico-calendar/tutoring-session/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify(requestBody),
    });

    if (ok && data) {
      return {
        success: true,
        message: data.message || 'Tutoring session updated successfully',
        eventId: data.eventId,
        event: data.event,
      };
    }
    return { success: false, error: data?.error || data?.message || 'Failed to update tutoring session' };
  }

  /**
   * Cancel a tutoring session event
   */
  async cancelTutoringSession(eventId, reason = 'Sesión cancelada') {
    if (!eventId) return { success: false, error: 'eventId is required' };

    const params = new URLSearchParams();
    if (reason) params.append('reason', reason);
    const qs = params.toString();
    const url = `${API_BASE_URL}/calico-calendar/tutoring-session/${eventId}/cancel${qs ? `?${qs}` : ''}`;

    const { ok, data } = await authFetch(url, { method: 'POST' });
    if (ok && data) {
      return {
        success: true,
        message: data.message || 'Tutoring session cancelled successfully',
        eventId: data.eventId,
        status: data.status || 'cancelled',
      };
    }
    return { success: false, error: data?.error || data?.message || 'Failed to cancel tutoring session' };
  }

  /**
   * Delete a tutoring session event completely
   */
  async deleteTutoringSession(eventId) {
    if (!eventId) return { success: false, error: 'eventId is required' };

    const { ok, data } = await authFetch(`${API_BASE_URL}/calico-calendar/tutoring-session/${eventId}`, {
      method: 'DELETE',
    });

    if (ok && data) {
      return {
        success: true,
        message: data.message || 'Tutoring session deleted successfully',
        eventId: data.eventId,
        deleted: data.deleted || true,
      };
    }
    return { success: false, error: data?.error || data?.message || 'Failed to delete tutoring session' };
  }

  /** Helper: Convert date to ISO string */
  toISOString(date) {
    if (date instanceof Date) return date.toISOString();
    if (typeof date === 'string') {
      if (date.includes('T') || date.includes('Z')) return date;
      return new Date(date).toISOString();
    }
    return new Date().toISOString();
  }

  /** Helper: Build event summary */
  buildEventSummary(course, tutorName, studentName) {
    return `${course} - ${tutorName} con ${studentName}`;
  }

  /** Helper: Build event description */
  buildEventDescription(sessionDetails) {
    const { course, tutorName, tutorEmail, studentName, studentEmail, notes } = sessionDetails;
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

  /** Helper: Validate event data */
  validateEventData(eventData) {
    const errors = [];
    if (!eventData.summary || eventData.summary.trim() === '') errors.push('El título del evento es requerido');
    if (!eventData.startDateTime) errors.push('La fecha y hora de inicio son requeridas');
    if (!eventData.endDateTime) errors.push('La fecha y hora de fin son requeridas');

    if (eventData.startDateTime && eventData.endDateTime) {
      const start = new Date(eventData.startDateTime);
      const end = new Date(eventData.endDateTime);
      if (end <= start) errors.push('La hora de fin debe ser posterior a la hora de inicio');
      if (start < new Date()) errors.push('No se puede crear un evento en el pasado');
    }

    if (!eventData.tutorEmail || eventData.tutorEmail.trim() === '') errors.push('El email del tutor es requerido');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (eventData.tutorEmail && !emailRegex.test(eventData.tutorEmail)) errors.push('El email del tutor no es válido');

    if (eventData.attendees && Array.isArray(eventData.attendees)) {
      eventData.attendees.forEach((attendee, index) => {
        const email = typeof attendee === 'string' ? attendee : attendee.email;
        if (email && !emailRegex.test(email)) errors.push(`Email inválido en asistente ${index + 1}`);
      });
    }

    return { isValid: errors.length === 0, errors };
  }
}

export const CalicoCalendarService = new CalicoCalendarServiceClass();
export default CalicoCalendarService;
