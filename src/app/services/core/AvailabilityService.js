/**
 * AvailabilityService (Frontend)
 *
 * API client for availability operations - calls local Next.js API routes.
 * Uses authFetch to automatically inject the Firebase ID token.
 * Never throws on HTTP errors — returns graceful defaults instead.
 */

import { authFetch } from '../authFetch';

class AvailabilityServiceClass {
  constructor() {
    this.autoSyncInterval = null;
    this.apiBase = '/api';
  }

  /**
   * Get all availabilities with optional filtering
   */
  async getAvailabilities(tutorId = null, course = null, startDate = null, endDate = null, limit = null) {
    const params = new URLSearchParams();
    if (tutorId) params.append('tutorId', tutorId);
    if (course) params.append('course', course);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (limit) params.append('limit', limit.toString());
    const qs = params.toString();
    const url = `${this.apiBase}/availability${qs ? `?${qs}` : ''}`;

    const { ok, data } = await authFetch(url);
    if (ok && data) {
      return data.availabilities || [];
    }
    return [];
  }

  /**
   * Get availability with fallback to handle errors gracefully
   */
  async getAvailabilityWithFallback(tutorId = null) {
    try {
      const availabilities = await this.getAvailabilities(tutorId);

      const availabilitySlots = availabilities.map((avail) => ({
        id: avail.id || avail.googleEventId,
        title: avail.title || 'Available',
        date: this.extractDate(avail.startDateTime),
        startTime: this.extractTime(avail.startDateTime),
        endTime: this.extractTime(avail.endDateTime),
        startDateTime: avail.startDateTime,
        endDateTime: avail.endDateTime,
        tutorId: avail.tutorId,
        tutorEmail: avail.tutorId,
        isBooked: avail.isBooked || false,
        location: avail.location,
        course: avail.course,
      }));

      return {
        availabilitySlots,
        connected: true,
        source: 'api',
        usingMockData: false,
      };
    } catch (error) {
      console.error('Error in getAvailabilityWithFallback:', error);
      return {
        availabilitySlots: [],
        connected: false,
        source: 'error',
        usingMockData: true,
        error: error.message,
      };
    }
  }

  /**
   * Check if an event exists
   */
  async checkEventExists(eventId) {
    const params = new URLSearchParams({ eventId });
    const { ok, data } = await authFetch(`${this.apiBase}/availability/check-event?${params.toString()}`);
    if (ok && data) {
      return data.exists || false;
    }
    return false;
  }

  /**
   * Sync availabilities from Google Calendar
   */
  async syncAvailabilities(tutorId, accessToken, calendarId = null) {
    const body = { tutorId, accessToken };
    if (calendarId) body.calendarId = calendarId;

    const { ok, data } = await authFetch(`${this.apiBase}/availability/sync`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (ok && data) return data;
    console.error('Error syncing availabilities');
    return { success: false, error: data?.error || 'Sync failed' };
  }

  /**
   * Intelligent sync - only syncs new events (Google token from httpOnly cookies)
   */
  async intelligentSync(tutorId, calendarName = 'Disponibilidad', daysAhead = 30) {
    const body = { tutorId, daysAhead };
    if (calendarName) body.calendarName = calendarName;

    const { ok, data } = await authFetch(`${this.apiBase}/availability/sync-intelligent`, {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (ok && data) return data;
    console.error('Error in intelligent sync');
    return { success: false, error: data?.error || 'Intelligent sync failed' };
  }

  /**
   * Create availability event in Google Calendar and Firebase
   */
  async createAvailabilityEvent(tutorId, accessToken, eventData) {
    const body = { tutorId, accessToken, ...eventData };

    const { ok, data } = await authFetch(`${this.apiBase}/availability/create`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (ok && data) return data;
    console.error('Error creating availability event');
    return { success: false, error: data?.error || 'Failed to create event' };
  }

  /**
   * Delete availability event from Google Calendar and Firebase
   */
  async deleteAvailabilityEvent(eventId, accessToken, calendarId = null) {
    const params = new URLSearchParams({ eventId });
    if (calendarId) params.append('calendarId', calendarId);
    const url = `${this.apiBase}/availability/delete?${params.toString()}`;

    const { ok, data } = await authFetch(url, {
      method: 'DELETE',
      body: JSON.stringify({ accessToken }),
    });

    if (ok && data) return data;
    console.error('Error deleting availability event');
    return { success: false, error: data?.error || 'Failed to delete event' };
  }

  /**
   * Get joint availability for all tutors teaching a specific course
   */
  async getJointAvailabilityByCourse(courseName, courseId = null) {
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (courseId) {
        params.set('courseId', courseId);
      } else if (courseName) {
        params.set('course', courseName);
      }
      const { ok: tutorsOk, data: tutorsData } = await authFetch(
        `${this.apiBase}/users/tutors?${params.toString()}`
      );
      if (!tutorsOk || !tutorsData) {
        return { success: false, tutorsAvailability: [], totalTutors: 0, connectedTutors: 0, totalSlots: 0 };
      }
      const tutors = tutorsData.tutors || [];
      if (tutors.length === 0) {
        return { success: true, tutorsAvailability: [], totalTutors: 0, connectedTutors: 0, totalSlots: 0 };
      }
      const tutorNameMap = {};
      const tutorIds = tutors.map(t => {
        const id = t.uid || t.id;
        tutorNameMap[id] = t.name || id;
        return id;
      });
      const { ok, data } = await authFetch(`${this.apiBase}/availability/joint/multiple`, {
        method: 'POST',
        body: JSON.stringify({ tutorIds }),
      });
      if (!ok || !data) {
        return { success: false, tutorsAvailability: [], totalTutors: tutors.length, connectedTutors: 0, totalSlots: 0 };
      }
      const tutorsAvailability = (data.tutorsAvailability || []).map(entry => ({
        ...entry,
        tutorName: tutorNameMap[entry.tutorId] || entry.tutorId,
      }));
      return {
        success: true,
        tutorsAvailability,
        totalTutors: data.totalTutors,
        connectedTutors: data.connectedTutors,
        totalSlots: data.totalSlots,
      };
    } catch (error) {
      console.error('Error in getJointAvailabilityByCourse:', error);
      return { success: false, tutorsAvailability: [], totalTutors: 0, connectedTutors: 0, totalSlots: 0 };
    }
  }

  /**
   * Validate event data before creation
   */
  validateEventData(eventData) {
    const errors = [];

    if (!eventData.date) errors.push('La fecha es requerida');
    if (!eventData.startTime) errors.push('La hora de inicio es requerida');
    if (!eventData.endTime) errors.push('La hora de fin es requerida');

    if (eventData.startTime && eventData.endTime) {
      const startTime = new Date(`2000-01-01T${eventData.startTime}`);
      const endTime = new Date(`2000-01-01T${eventData.endTime}`);
      if (endTime <= startTime) {
        errors.push('La hora de fin debe ser posterior a la hora de inicio');
      }
    }

    if (eventData.date) {
      const selectedDate = new Date(eventData.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        errors.push('No se puede crear un evento en una fecha pasada');
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Start auto-sync (polls for updates periodically)
   */
  startAutoSync(tutorId, accessToken, interval = 300000) {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }

    this.autoSyncInterval = setInterval(async () => {
      await this.syncAvailabilities(tutorId, accessToken);
    }, interval);
  }

  /**
   * Stop auto-sync
   */
  stopAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  /** Helper: Extract date in YYYY-MM-DD format */
  extractDate(datetime) {
    if (!datetime) return '';
    try {
      return new Date(datetime).toISOString().split('T')[0];
    } catch {
      return '';
    }
  }

  /** Helper: Extract time in HH:MM format */
  extractTime(datetime) {
    if (!datetime) return '';
    try {
      return new Date(datetime).toTimeString().slice(0, 5);
    } catch {
      return '';
    }
  }
}

const AvailabilityService = new AvailabilityServiceClass();
export { AvailabilityService };
export default AvailabilityService;
