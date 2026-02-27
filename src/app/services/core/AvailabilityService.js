/**
 * AvailabilityService (Frontend)
 * API client for availability operations - calls local Next.js API routes
 */

class AvailabilityServiceClass {
  constructor() {
    this.autoSyncInterval = null;
    this.apiBase = '/api'; // Local API routes
  }

  /**
   * Get all availabilities with optional filtering
   * @param {string} tutorId - Optional tutor ID
   * @param {string} course - Optional course to filter by
   * @param {string} startDate - Optional start date (ISO string)
   * @param {string} endDate - Optional end date (ISO string)
   * @param {number} limit - Optional limit
   * @returns {Promise<Array>} Array of availability slots
   */
  async getAvailabilities(tutorId = null, course = null, startDate = null, endDate = null, limit = null) {
    try {
      const params = new URLSearchParams();
      if (tutorId) params.append('tutorId', tutorId);
      if (course) params.append('course', course);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (limit) params.append('limit', limit.toString());
      const queryString = params.toString();
      const url = `${this.apiBase}/availability${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.availabilities || [];
    } catch (error) {
      console.error('Error fetching availabilities:', error);
        throw error;
    }
  }

  /**
   * Get availability with fallback to handle errors gracefully
   * @param {string} tutorId - Optional tutor ID
   * @returns {Promise<Object>} Object with availabilitySlots, connected status, etc.
   */
  async getAvailabilityWithFallback(tutorId = null) {
    try {
      const availabilities = await this.getAvailabilities(tutorId);
      
      // Transform backend data to frontend format
      const availabilitySlots = availabilities.map(avail => ({
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
   * @param {string} eventId - Event ID to check
   * @returns {Promise<boolean>} True if event exists
   */
  async checkEventExists(eventId) {
    try {
      const params = new URLSearchParams();
      params.append('eventId', eventId);
      const queryString = params.toString();
      const url = `${this.apiBase}/availability/check-event?${queryString}`;

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.exists || false;
    } catch (error) {
      console.error('Error checking event existence:', error);
      return false;
    }
  }

  /**
   * Sync availabilities from Google Calendar
   * @param {string} tutorId - Tutor ID
   * @param {string} accessToken - Access token for Google Calendar
   * @param {string} calendarId - Optional calendar ID
   * @returns {Promise<Object>} Sync results
   */
  async syncAvailabilities(tutorId, accessToken, calendarId = null) {
    try {
      const body = { tutorId, accessToken };
      if (calendarId) body.calendarId = calendarId;
      
      const response = await fetch(`${this.apiBase}/availability/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error syncing availabilities:', error);
      throw error;
    }
  }

  /**
   * Intelligent sync - only syncs new events
   * @param {string} tutorId - Tutor ID
   * @param {string} accessToken - Access token for Google Calendar
   * @param {string} calendarName - Optional calendar name (e.g., "Disponibilidad")
   * @param {number} daysAhead - Optional number of days to sync ahead (default: 30)
   * @returns {Promise<Object>} Sync results
   */
  async intelligentSync(tutorId, accessToken, calendarName = "Disponibilidad", daysAhead = 30) {
    try {
      const body = { tutorId, accessToken, daysAhead };
      if (calendarName) body.calendarName = calendarName;
      
      const response = await fetch(`${this.apiBase}/availability/sync-intelligent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error in intelligent sync:', error);
      throw error;
    }
  }

  /**
   * Create availability event in Google Calendar and Firebase
   * @param {string} tutorId - Tutor ID
   * @param {string} accessToken - Access token for Google Calendar
   * @param {Object} eventData - Event data (title, date, startTime, endTime, etc.)
   * @returns {Promise<Object>} Created event result
   */
  async createAvailabilityEvent(tutorId, accessToken, eventData) {
    try {
      const body = {
        tutorId,
        accessToken,
        ...eventData,
      };
      
      const response = await fetch(`${this.apiBase}/availability/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating availability event:', error);
      throw error;
    }
  }

  /**
   * Delete availability event from Google Calendar and Firebase
   * @param {string} eventId - Event ID to delete
   * @param {string} accessToken - Access token for Google Calendar
   * @param {string} calendarId - Optional calendar ID
   * @returns {Promise<Object>} Delete result
   */
  async deleteAvailabilityEvent(eventId, accessToken, calendarId = null) {
    try {
      const params = new URLSearchParams();
      params.append('eventId', eventId);
      if (calendarId) params.append('calendarId', calendarId);
      const queryString = params.toString();
      const url = `${this.apiBase}/availability/delete?${queryString}`;
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ accessToken }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting availability event:', error);
      throw error;
    }
  }

  /**
   * Validate event data before creation
   * @param {Object} eventData - Event data to validate
   * @returns {Object} Validation result { isValid, errors }
   */
  validateEventData(eventData) {
    const errors = [];

    if (!eventData.date) {
      errors.push('La fecha es requerida');
    }

    if (!eventData.startTime) {
      errors.push('La hora de inicio es requerida');
    }

    if (!eventData.endTime) {
      errors.push('La hora de fin es requerida');
    }

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

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Start auto-sync (polls for updates periodically)
   * @param {string} tutorId - Tutor ID
   * @param {string} accessToken - Access token
   * @param {number} interval - Interval in milliseconds (default: 5 minutes)
   */
  startAutoSync(tutorId, accessToken, interval = 300000) {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }

    this.autoSyncInterval = setInterval(async () => {
      try {
        await this.syncAvailabilities(tutorId, accessToken);
        console.log('Auto-sync completed for', tutorId);
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    }, interval);

    console.log(`Auto-sync started for ${tutorId} with interval ${interval}ms`);
  }

  /**
   * Stop auto-sync
   */
  stopAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
      console.log('Auto-sync stopped');
    }
  }

  /**
   * Helper: Extract date in YYYY-MM-DD format from datetime string
   */
  extractDate(datetime) {
    if (!datetime) return '';
    try {
      const date = new Date(datetime);
      return date.toISOString().split('T')[0];
    } catch (error) {
      console.error('Error extracting date:', error);
      return '';
    }
  }

  /**
   * Helper: Extract time in HH:MM format from datetime string
   */
  extractTime(datetime) {
    if (!datetime) return '';
    try {
      const date = new Date(datetime);
      return date.toTimeString().slice(0, 5);
    } catch (error) {
      console.error('Error extracting time:', error);
      return '';
    }
  }
}

// Create singleton instance
const AvailabilityService = new AvailabilityServiceClass();

// Named export for components that use: import { AvailabilityService } from '...'
export { AvailabilityService };

// Default export for components that use: import AvailabilityService from '...'
export default AvailabilityService;
