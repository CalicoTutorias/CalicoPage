/**
 * CalendarService
 *
 * Google Calendar integration service.
 * Uses authFetch to automatically inject the JWT token.
 * Never throws on HTTP errors — returns graceful defaults instead.
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

class CalendarServiceClass {
  /**
   * Get Google Calendar auth URL and redirect
   */
  initiateAuth() {
    window.location.href = `${API_BASE_URL}/calendar/auth`;
  }

  /**
   * Get Google Calendar auth URL as JSON
   */
  async getAuthUrl(format = null) {
    const params = format ? `?format=${format}` : '';
    const { ok, data } = await authFetch(`${API_BASE_URL}/calendar/auth-url${params}`, {
      credentials: 'include',
    });
    if (ok && data) return data;
    console.error('Error getting auth URL');
    return null;
  }

  /**
   * Check calendar connection status
   */
  async checkConnection() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/calendar/check-connection`, {
      credentials: 'include',
    });
    if (ok && data) {
      return {
        connected: data.connected || false,
        hasAccessToken: data.hasAccessToken || false,
        hasRefreshToken: data.hasRefreshToken || false,
        tokenValid: data.tokenValid || false,
        tokenSource: data.tokenSource || 'none',
      };
    }
    return {
      connected: false,
      hasAccessToken: false,
      hasRefreshToken: false,
      tokenValid: false,
      tokenSource: 'none',
    };
  }

  /**
   * List connected calendars
   */
  async listCalendars() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/calendar/list`, {
      credentials: 'include',
    });
    if (ok && data) return data.calendars || [];
    return [];
  }

  /**
   * List events from a calendar
   */
  async listEvents(calendarId, timeMin = null, timeMax = null) {
    const params = new URLSearchParams({ calendarId });
    if (timeMin) params.append('timeMin', timeMin);
    if (timeMax) params.append('timeMax', timeMax);

    const { ok, data } = await authFetch(
      `${API_BASE_URL}/calendar/events?${params.toString()}`,
      { credentials: 'include' }
    );
    if (ok && data) return data.events || [];
    return [];
  }

  /**
   * Create an event in a calendar
   */
  async createEvent(calendarId, eventData) {
    const body = { calendarId, ...eventData };
    const { ok, data } = await authFetch(`${API_BASE_URL}/calendar/create-event`, {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (ok && data) return data.event || null;
    return null;
  }

  /**
   * Delete an event from a calendar
   */
  async deleteEvent(calendarId, eventId) {
    const params = new URLSearchParams({ calendarId, eventId });
    const { ok, data } = await authFetch(
      `${API_BASE_URL}/calendar/delete-event?${params.toString()}`,
      { method: 'DELETE', credentials: 'include' }
    );
    if (ok && data) return data;
    return null;
  }

  /**
   * Refresh the access token
   */
  async refreshToken() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/calendar/refresh-token`, {
      method: 'POST',
      credentials: 'include',
    });
    if (ok && data) return data;
    return null;
  }

  /**
   * Disconnect from Google Calendar
   */
  async disconnect() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/calendar/disconnect`, {
      method: 'POST',
      credentials: 'include',
    });
    if (ok && data) return data;
    return null;
  }

  /**
   * Get diagnostic information about OAuth configuration
   */
  async getDiagnostics() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/calendar/diagnostics`, {
      credentials: 'include',
    });
    if (ok && data) return data;
    return null;
  }
}

export const CalendarService = new CalendarServiceClass();
export default CalendarService;
