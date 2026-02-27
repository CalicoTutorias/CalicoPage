
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

class CalendarServiceClass {
  /**
   * Get Google Calendar auth URL and redirect
   * Backend: GET /calendar/auth (redirects to Google)
   */
  initiateAuth() {
    // This endpoint redirects to Google OAuth, so we navigate directly
    window.location.href = `${API_BASE_URL}/calendar/auth`;
  }

  /**
   * Get Google Calendar auth URL as JSON (for API clients)
   * Backend: GET /calendar/auth-url
   * @param {string} format - Optional format ('json' for JSON response)
   * @returns {Promise<Object>} Auth URL and instructions
   */
  async getAuthUrl(format = null) {
    try {
      const params = format ? `?format=${format}` : '';
      const response = await fetch(
        `${API_BASE_URL}/calendar/auth-url${params}`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get auth URL');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting auth URL:', error);
      throw error;
    }
  }

  /**
   * Check calendar connection status
   * Backend: GET /calendar/check-connection (uses cookies automatically)
   * @returns {Promise<Object>} Connection status
   */
  async checkConnection() {
    try {
      const response = await fetch(`${API_BASE_URL}/calendar/check-connection`, {
        credentials: 'include', // Browser sends cookies automatically
      });
      
      const data = await response.json();
      return {
        connected: data.connected || false,
        hasAccessToken: data.hasAccessToken || false,
        hasRefreshToken: data.hasRefreshToken || false,
        tokenValid: data.tokenValid || false,
        tokenSource: data.tokenSource || 'none',
      };
    } catch (error) {
      console.error('Error checking calendar connection:', error);
      return {
        connected: false,
        hasAccessToken: false,
        hasRefreshToken: false,
        tokenValid: false,
        tokenSource: 'none',
      };
    }
  }

  /**
   * List connected calendars
   * Backend: GET /calendar/list (uses cookies automatically)
   * @returns {Promise<Array>} List of calendars
   */
  async listCalendars() {
    try {
      const response = await fetch(`${API_BASE_URL}/calendar/list`, {
        credentials: 'include', // Browser sends cookies automatically
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to list calendars');
      }

      const data = await response.json();
      return data.calendars || [];
    } catch (error) {
      console.error('Error listing calendars:', error);
      throw error;
    }
  }

  /**
   * List events from a calendar
   * Backend: GET /calendar/events?calendarId=xxx&timeMin=xxx&timeMax=xxx (uses cookies automatically)
   * @param {string} calendarId - Calendar ID
   * @param {string} timeMin - Start time (ISO 8601)
   * @param {string} timeMax - End time (ISO 8601)
   * @returns {Promise<Array>} List of events
   */
  async listEvents(calendarId, timeMin = null, timeMax = null) {
    try {
      const params = new URLSearchParams({ calendarId });
      if (timeMin) params.append('timeMin', timeMin);
      if (timeMax) params.append('timeMax', timeMax);

      const response = await fetch(
        `${API_BASE_URL}/calendar/events?${params.toString()}`,
        {
          credentials: 'include', // Browser sends cookies automatically
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to list events');
      }

      const data = await response.json();
      return data.events || [];
    } catch (error) {
      console.error('Error listing events:', error);
      throw error;
    }
  }

  /**
   * Create an event in a calendar
   * Backend: POST /calendar/create-event (uses cookies automatically)
   * @param {string} calendarId - Calendar ID
   * @param {Object} eventData - Event details (summary, start, end, etc.)
   * @returns {Promise<Object>} Created event
   */
  async createEvent(calendarId, eventData) {
    try {
      const body = {
        calendarId,
        ...eventData,
      };

      const response = await fetch(
        `${API_BASE_URL}/calendar/create-event`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Browser sends cookies automatically
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to create event');
      }

      const data = await response.json();
      return data.event || null;
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  }

  /**
   * Delete an event from a calendar
   * Backend: DELETE /calendar/delete-event?calendarId=xxx&eventId=xxx (uses cookies automatically)
   * @param {string} calendarId - Calendar ID
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} Result
   */
  async deleteEvent(calendarId, eventId) {
    try {
      const params = new URLSearchParams({ calendarId, eventId });

      const response = await fetch(
        `${API_BASE_URL}/calendar/delete-event?${params.toString()}`,
        {
          method: 'DELETE',
          credentials: 'include', // Browser sends cookies automatically
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to delete event');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }

  /**
   * Refresh the access token
   * Backend: POST /calendar/refresh-token
   * @returns {Promise<Object>} Result
   */
  async refreshToken() {
    try {
      const response = await fetch(
        `${API_BASE_URL}/calendar/refresh-token`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Google Calendar
   * Backend: POST /calendar/disconnect
   * @returns {Promise<Object>} Result
   */
  async disconnect() {
    try {
      const response = await fetch(
        `${API_BASE_URL}/calendar/disconnect`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to disconnect');
      }

      const data = await response.json();
      
      
      return data;
    } catch (error) {
      console.error('Error disconnecting calendar:', error);
      throw error;
    }
  }

  /**
   * Get diagnostic information about OAuth configuration
   * Backend: GET /calendar/diagnostics
   * @returns {Promise<Object>} Diagnostic information
   */
  async getDiagnostics() {
    try {
      const response = await fetch(
        `${API_BASE_URL}/calendar/diagnostics`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get diagnostics');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting diagnostics:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const CalendarService = new CalendarServiceClass();
export default CalendarService;

