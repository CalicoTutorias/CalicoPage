/**
 * Google Calendar Service
 * Handles all Google Calendar API interactions and OAuth flow
 */

import { google } from 'googleapis';

/**
 * Create OAuth2 client (without credentials)
 * @returns {OAuth2Client}
 */
function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback'
  );
}

/**
 * Create OAuth2 client with access token
 * @param {string} accessToken - Google OAuth2 access token
 * @returns {OAuth2Client}
 */
function getOAuth2Client(accessToken) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
  });
  return oauth2Client;
}

/**
 * Get Google OAuth authorization URL
 * @param {string} format - Optional format ('json' for JSON response)
 * @returns {Promise<string>} Authorization URL
 */
export async function getAuthUrl(format) {
  try {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback';
    console.log(`Using redirect URI (base, no query params): ${redirectUri}`);
    
    // calendar.events: create/update/delete events
    // calendar.readonly: calendarList.list + metadata (check-connection, /api/calendar/list, sync)
    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ];

    const oauth2Client = createOAuth2Client();

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      // Add state parameter to indicate format preference
      state: format === 'json' ? 'format=json' : undefined,
    });

    console.log(`Generated auth URL. Callback will be: ${redirectUri}${format === 'json' ? '?format=json' : ''}`);
    return url;
  } catch (error) {
    console.error('Error generating auth URL:', error);
    throw error;
  }
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from OAuth callback
 * @returns {Promise<Object>} Tokens object
 */
export async function exchangeCodeForTokens(code) {
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} New tokens
 */
export async function refreshAccessToken(refreshToken) {
  try {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
}

function isCalendarAuthError(error) {
  const code = error?.code ?? error?.response?.status ?? error?.cause?.code;
  if (code === 401) return true;
  return /401|invalid authentication|Invalid Credentials/i.test(String(error?.message || ''));
}

/**
 * Validate access token with a minimal Calendar API call, or refresh using refresh_token.
 * @param {string|undefined} accessToken - From httpOnly cookie
 * @param {string|undefined} refreshToken - From httpOnly cookie
 * @returns {Promise<{ accessToken: string, refreshed: boolean }>}
 */
export async function getAccessTokenOrRefresh(accessToken, refreshToken) {
  if (!accessToken && !refreshToken) {
    throw new Error('No Google Calendar connection. Connect your calendar first.');
  }

  const probe = async (token) => {
    const auth = getOAuth2Client(token);
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.calendarList.list({ maxResults: 1 });
  };

  if (accessToken) {
    try {
      await probe(accessToken);
      return { accessToken, refreshed: false };
    } catch (error) {
      if (!isCalendarAuthError(error)) {
        throw new Error(`Failed to validate calendar access: ${error.message}`);
      }
      if (!refreshToken) {
        throw new Error('Google Calendar session expired. Reconnect your calendar.');
      }
    }
  } else if (!refreshToken) {
    throw new Error('No Google Calendar connection.');
  }

  const credentials = await refreshAccessToken(refreshToken);
  if (!credentials.access_token) {
    throw new Error('Could not refresh Google Calendar access.');
  }
  return { accessToken: credentials.access_token, refreshed: true };
}

/**
 * List all calendars
 * @param {string} accessToken - Google OAuth2 access token
 * @returns {Promise<Array>} Array of calendars
 */
export async function listCalendars(accessToken) {
  try {
    const auth = getOAuth2Client(accessToken);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.calendarList.list();
    return response.data.items || [];
  } catch (error) {
    console.error('Error listing calendars:', error);
    throw new Error(`Failed to list calendars: ${error.message}`);
  }
}

/**
 * List events from a calendar
 * @param {string} accessToken - Google OAuth2 access token
 * @param {string} calendarId - Calendar ID
 * @param {string} timeMin - Minimum time (ISO format)
 * @param {string} timeMax - Maximum time (ISO format)
 * @returns {Promise<Array>} Array of events
 */
export async function listEvents(accessToken, calendarId, timeMin, timeMax) {
  try {
    const auth = getOAuth2Client(accessToken);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
    });

    return response.data.items || [];
  } catch (error) {
    console.error('Error listing events:', error);
    throw new Error(`Failed to list events: ${error.message}`);
  }
}

/**
 * Create an event in Google Calendar
 * @param {string} accessToken - Google OAuth2 access token
 * @param {string} calendarId - Calendar ID
 * @param {Object} eventData - Event data
 * @returns {Promise<Object>} Created event
 */
export async function createEvent(accessToken, calendarId, eventData) {
  try {
    const auth = getOAuth2Client(accessToken);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.insert({
      calendarId,
      requestBody: eventData,
      conferenceDataVersion: 1,
    });

    return response.data;
  } catch (error) {
    console.error('Error creating event:', error);
    throw new Error(`Failed to create event: ${error.message}`);
  }
}

/**
 * Update an event in Google Calendar
 * @param {string} accessToken - Google OAuth2 access token
 * @param {string} calendarId - Calendar ID
 * @param {string} eventId - Event ID
 * @param {Object} eventData - Event data
 * @returns {Promise<Object>} Updated event
 */
export async function updateEvent(accessToken, calendarId, eventId, eventData) {
  try {
    const auth = getOAuth2Client(accessToken);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: eventData,
    });

    return response.data;
  } catch (error) {
    console.error('Error updating event:', error);
    throw new Error(`Failed to update event: ${error.message}`);
  }
}

/**
 * Delete an event from Google Calendar
 * @param {string} accessToken - Google OAuth2 access token
 * @param {string} calendarId - Calendar ID
 * @param {string} eventId - Event ID
 * @returns {Promise<void>}
 */
export async function deleteEvent(accessToken, calendarId, eventId) {
  try {
    const auth = getOAuth2Client(accessToken);
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId,
      eventId,
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    throw new Error(`Failed to delete event: ${error.message}`);
  }
}

/**
 * Get a specific event from Google Calendar
 * @param {string} accessToken - Google OAuth2 access token
 * @param {string} calendarId - Calendar ID
 * @param {string} eventId - Event ID
 * @returns {Promise<Object>} Event data
 */
export async function getEvent(accessToken, calendarId, eventId) {
  try {
    const auth = getOAuth2Client(accessToken);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.get({
      calendarId,
      eventId,
    });

    return response.data;
  } catch (error) {
    console.error('Error getting event:', error);
    throw new Error(`Failed to get event: ${error.message}`);
  }
}

export default {
  getAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  listCalendars,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
};

