/**
 * Calico Calendar Service
 * Manages the central Calico calendar via an OAuth2 admin refresh token
 * (GOOGLE_ADMIN_REFRESH_TOKEN). Creates tutoring session events with Google
 * Meet integration.
 *
 * NOTE: the refresh token only stays valid long-term while the OAuth consent
 * screen is published "In production". In "Testing" mode Google expires it
 * after ~7 days, which forces a manual regeneration.
 */

// `googleapis` (barrel) carga los ~250 clientes de API al importarse: cientos
// de ms de CPU en cada cold start de las rutas de sesiones/disponibilidad que
// lo arrastraban. El cliente de Calendar por separado y el OAuth2Client de
// google-auth-library son las mismas clases que exponía `google.*`.
import { OAuth2Client } from 'google-auth-library';
import { calendar as calendarApi } from '@googleapis/calendar';
import * as Sentry from '@sentry/nextjs';
import { randomUUID } from 'node:crypto';

let auth = null;
let calendarId = null;

const CALENDAR_LINK_UNAVAILABLE_MESSAGE =
  'Hubo un error al generar el enlace de Google Meet. Comunícate con el equipo técnico de Calico para acceder a él.';

function getSafeCalendarErrorCode(error) {
  const status = error?.code ?? error?.response?.status;
  const message = String(error?.message ?? '');
  if (status === 400 && /invalid_grant/i.test(message)) return 'CALENDAR_REAUTH_REQUIRED';
  if (status === 401 || /invalid_token|invalid credentials|unauthorized/i.test(message)) {
    return 'CALENDAR_REAUTH_REQUIRED';
  }
  if (status === 403) return 'CALENDAR_PERMISSION_DENIED';
  if (status === 404) return 'CALENDAR_NOT_FOUND';
  return 'CALENDAR_CREATE_FAILED';
}

function calendarFailure(code) {
  const error = new Error(CALENDAR_LINK_UNAVAILABLE_MESSAGE);
  error.code = code;
  return error;
}

function captureCalendarFailure(action, code, context = {}) {
  Sentry.withScope((scope) => {
    scope.setTag('service', 'calendar');
    scope.setTag('action', action);
    scope.setTag('error_code', code);
    scope.setLevel('warning');
    scope.setContext('calendar_context', context);
    Sentry.captureMessage('Google Calendar operation failed');
  });
}

/**
 * Initialize Service Account authentication
 * @returns {Promise<Object|null>} Auth client or null
 */
export async function initializeAuth() {
  try {
    if (auth) {
      return auth;
    }

    // Load calendar ID from environment
    calendarId = process.env.CALICO_CALENDAR_ID || null;

    const refreshToken = process.env.GOOGLE_ADMIN_REFRESH_TOKEN;

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !refreshToken) {
      console.warn(' Google Calendar Service Account credentials are not fully configured in environment variables.');
      return null;
    }

    // Get Client ID and Secret from env
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );

    // The googleapis client auto-refreshes the short-lived access token from
    // this refresh token on every call. The refresh token itself only dies if
    // it is revoked or the OAuth app drops back to "Testing" mode.
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    auth = oauth2Client;

    return auth;
  } catch (error) {
    const code = getSafeCalendarErrorCode(error);
    console.error('Google Calendar initialization failed', { code });
    captureCalendarFailure('initialize_auth', code);
    throw calendarFailure(code);
  }
}

/**
 * Get authenticated Google Calendar client
 * @returns {Promise<Object>} Calendar client
 */
export async function getCalendarClient() {
  try {
    if (!auth) {
      await initializeAuth();
    }

    if (!auth) {
      throw new Error('Service Account not configured');
    }

    const calendar = calendarApi({ version: 'v3', auth: auth });
    return calendar;
  } catch (error) {
    const code = getSafeCalendarErrorCode(error);
    console.error('Google Calendar client initialization failed', { code });
    captureCalendarFailure('get_calendar_client', code);
    throw calendarFailure(code);
  }
}

/**
 * Check if service is configured
 * @returns {boolean} True if configured
 */
export function isConfigured() {
  return !!(auth && calendarId);
}

/**
 * Actively verify the admin refresh token still works.
 *
 * `isConfigured()` only checks that env vars are present — it returns true even
 * with an expired/revoked token, so failures stay silent until event creation.
 * This performs a lightweight live call so a dead token is detected up front.
 *
 * The probe reads events off the central calendar rather than listing the
 * account's calendars: `calendarList.list` needs `calendar.readonly`, a scope
 * event creation never uses, so an admin token minted with only
 * `calendar.events` failed the check while the app worked fine.
 *
 * @returns {Promise<{ configured: boolean, connected: boolean, reason: string|null }>}
 */
export async function verifyConnection() {
  if (!auth) {
    await initializeAuth();
  }

  if (!auth || !calendarId) {
    return { configured: false, connected: false, reason: 'not_configured' };
  }

  try {
    const calendar = calendarApi({ version: 'v3', auth });
    await calendar.events.list({ calendarId, maxResults: 1 });
    return { configured: true, connected: true, reason: null };
  } catch (error) {
    // Reuse the shared mapping so a 403 (scope/API disabled) is no longer
    // indistinguishable from a dead token.
    const reason = getSafeCalendarErrorCode(error);
    console.warn('Calico Calendar token check failed', { reason });
    return { configured: true, connected: false, reason };
  }
}

/**
 * Create a tutoring session event in Calico's central calendar
 * @param {Object} sessionData - Session data
 * @returns {Promise<Object>} Created event result
 */
export async function createTutoringSessionEvent(sessionData) {
  const {
    summary,
    description,
    startDateTime,
    endDateTime,
    attendees = [],
    location = 'Virtual/Presencial',
    tutorEmail,
    tutorName,
    tutorId,
  } = sessionData;
  const safeContext = { tutorId: tutorId || null };

  try {
    // Validations
    if (!summary || !startDateTime || !endDateTime) {
      throw new Error('summary, startDateTime, and endDateTime are required');
    }

    if (!tutorEmail) {
      throw new Error('tutorEmail is required');
    }

    // If service is not configured, return warning
    if (!auth) await initializeAuth();
    if (!isConfigured()) {
      console.warn(' Google Calendar Service not configured. Skipping calendar creation.');
      return {
        success: true,
        warning: 'Google Calendar not configured — event not created in external calendar',
        eventId: null,
        htmlLink: null,
        meetLink: null,
        event: null,
        attendees: attendees,
      };
    }

    // Normalize attendees list
    let normalizedAttendees = [];
    if (Array.isArray(attendees)) {
      normalizedAttendees = attendees
        .map((a) => {
          if (typeof a === 'string') return { email: a };
          if (a && typeof a === 'object' && a.email) return a;
          return null;
        })
        .filter((a) => a !== null);
    } else if (attendees) {
      if (typeof attendees === 'string') {
        normalizedAttendees = [{ email: attendees }];
      } else if (typeof attendees === 'object' && attendees.email) {
        normalizedAttendees = [attendees];
      }
    }

    // Ensure tutor is in attendees list
    const hasTutor = normalizedAttendees.some((a) => a.email === tutorEmail);
    if (!hasTutor) {
      normalizedAttendees.push({
        email: tutorEmail,
        displayName: tutorName || tutorEmail,
        responseStatus: 'accepted',
      });
    }

    // Dedupe attendees by email
    const attendeesByEmail = new Map();
    normalizedAttendees.forEach((a) => {
      const email = a.email;
      if (!email) return;

      const existing = attendeesByEmail.get(email);
      if (!existing) {
        attendeesByEmail.set(email, { ...a, email });
        return;
      }

      // Merge logic: prefer displayName if present
      if (a.displayName && a.displayName !== existing.displayName) {
        existing.displayName = a.displayName;
      }

      // Prefer 'accepted' responseStatus
      const statusOrder = { accepted: 2, needsAction: 1, tentative: 1, declined: 0 };
      const existingScore = statusOrder[existing.responseStatus] || 0;
      const newScore = statusOrder[a.responseStatus] || 0;
      if (newScore > existingScore) {
        existing.responseStatus = a.responseStatus;
      }
    });

    normalizedAttendees = [...attendeesByEmail.values()];

    console.log(` Normalized (deduped) attendees: ${normalizedAttendees.length}`);

    // Configure dates with Colombia timezone
    const timeZone = 'America/Bogota';

    // Ensure dates are in ISO format
    const start = startDateTime instanceof Date ? startDateTime.toISOString() : startDateTime;
    const end = endDateTime instanceof Date ? endDateTime.toISOString() : endDateTime;

    // Find student (who is not the tutor)
    const studentInfo = normalizedAttendees.find((a) => a.email !== tutorEmail);
    const studentName = studentInfo?.displayName || studentInfo?.email || 'Estudiante';

    // Configure event WITHOUT attendees to avoid permission issues
    const event = {
      summary: summary,
      description: description || `Sesión de tutoría agendada a través de Calico.\n\nTutor: ${tutorName || tutorEmail}\nEstudiante: ${studentName}\n\nNOTA: Este evento se creó en el calendario central de Calico. Los participantes serán notificados por separado.`,
      start: { dateTime: start, timeZone: timeZone, },
      end: { dateTime: end, timeZone: timeZone, },
      location: location,

      attendees: normalizedAttendees,

      //  Add Google Meet automatically
      conferenceData: {
        createRequest: {
          requestId: `meet-${randomUUID()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet', },
          conferenceConfiguration: {
            accessConstraints: {
              accessType: 'ANYONE'  // Allow anyone with the link to join (no approval needed)
            },
          },
        },
      },

      // Additional configurations
      status: 'confirmed',
      visibility: 'default',
      guestsCanModify: false,
      guestsCanInviteOthers: false,
      guestsCanSeeOtherGuests: false,

      // Reminders
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 30 }], // 30 minutes before
      },
    };

    console.log(' Creating tutoring session event in Calico calendar...');

    // Get calendar client
    const calendar = await getCalendarClient();

    let response;
    let meetLink = null;

    try {
      // Try to create event WITH Google Meet
      console.log(' Attempting to create event with Google Meet...');
      response = await calendar.events.insert({
        calendarId: calendarId,
        requestBody: event,
        conferenceDataVersion: 1, // Required for Google Meet
        sendUpdates: 'none', // Don't send invitations to avoid permission issues
      });

      // Extract Google Meet link if created
      meetLink =
        response.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ||
        response.data.hangoutLink ||
        null;

      if (meetLink) {
        console.log(' Google Meet link created');
      } else {
        console.warn(' Event created but no Meet link generated');
      }
    } catch (meetError) {
      const code = getSafeCalendarErrorCode(meetError);
      if (code === 'CALENDAR_REAUTH_REQUIRED') throw calendarFailure(code);
      console.warn('Google Meet creation failed; retrying without conference data', { code });

      // If fails with Meet, create without conferenceData
      const eventWithoutMeet = { ...event };
      delete eventWithoutMeet.conferenceData;

      response = await calendar.events.insert({
        calendarId: calendarId,
        requestBody: eventWithoutMeet,
        sendUpdates: 'none',
      });

      console.warn('Calendar event created without a Meet link');
    }

    console.log(` Tutoring session event created successfully: ${response.data.id}`);

    return {
      success: true,
      eventId: response.data.id,
      tutorId: tutorId,
      htmlLink: response.data.htmlLink,
      hangoutLink: response.data.hangoutLink,
      meetLink: meetLink,
      warning: meetLink ? null : CALENDAR_LINK_UNAVAILABLE_MESSAGE,
    };
  } catch (error) {
    const code = error?.code || getSafeCalendarErrorCode(error);
    console.error('Google Calendar event creation failed', { code, ...safeContext });
    captureCalendarFailure('create_tutoring_event', code, safeContext);
    throw calendarFailure(code);
  }
}

/**
 * Update a tutoring session event
 * @param {string} eventId - Event ID
 * @param {Object} updateData - Update data
 * @returns {Promise<Object>} Updated event result
 */
export async function updateTutoringSessionEvent(eventId, updateData) {
  try {
    if (!eventId) {
      throw new Error('Event ID is required for update');
    }

    if (!isConfigured()) {
      throw new Error('Service Account not configured');
    }

    console.log(` Updating tutoring session event: ${eventId}`);

    const calendar = await getCalendarClient();

    // Get current event
    const currentEvent = await calendar.events.get({
      calendarId: calendarId,
      eventId: eventId,
    });

    // Build update object
    const updatedEvent = {
      ...currentEvent.data,
    };

    if (updateData.summary) updatedEvent.summary = updateData.summary;
    if (updateData.description !== undefined) updatedEvent.description = updateData.description;
    if (updateData.location !== undefined) updatedEvent.location = updateData.location;

    // Update dates if provided
    if (updateData.startDateTime || updateData.endDateTime) {
      const timeZone = 'America/Bogota';
      if (updateData.startDateTime) {
        const start =
          updateData.startDateTime instanceof Date
            ? updateData.startDateTime.toISOString()
            : updateData.startDateTime;
        updatedEvent.start = {
          dateTime: start,
          timeZone: timeZone,
        };
      }
      if (updateData.endDateTime) {
        const end =
          updateData.endDateTime instanceof Date
            ? updateData.endDateTime.toISOString()
            : updateData.endDateTime;
        updatedEvent.end = {
          dateTime: end,
          timeZone: timeZone,
        };
      }
    }

    // Update event WITHOUT sending invitations
    const response = await calendar.events.update({
      calendarId: calendarId,
      eventId: eventId,
      requestBody: updatedEvent,
      sendUpdates: 'none', // Don't send invitations
    });

    console.log(' Tutoring session event updated successfully');

    return {
      success: true,
      eventId: response.data.id,
      event: response.data,
    };
  } catch (error) {
    const code = getSafeCalendarErrorCode(error);
    console.error('Google Calendar event update failed', { code, eventId });
    captureCalendarFailure('update_tutoring_event', code, { eventId });
    throw calendarFailure(code);
  }
}

/**
 * Cancel a tutoring session event (marks as cancelled, keeps history)
 * @param {string} eventId - Event ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>} Cancel result
 */
export async function cancelTutoringSessionEvent(eventId, reason = 'Sesión cancelada') {
  try {
    if (!eventId) {
      throw new Error('Event ID is required for cancellation');
    }

    if (!isConfigured()) {
      throw new Error('Service Account not configured');
    }

    console.log(` Cancelling tutoring session event: ${eventId}`);

    const calendar = await getCalendarClient();

    // Mark as cancelled (keeps history)
    const response = await calendar.events.patch({
      calendarId: calendarId,
      eventId: eventId,
      requestBody: {
        status: 'cancelled',
        summary: `[CANCELADA] ${reason}`,
      },
      sendUpdates: 'none', // Don't send invitations
    });

    console.log(' Tutoring session event cancelled successfully');

    return {
      success: true,
      eventId: response.data.id,
      status: 'cancelled',
    };
  } catch (error) {
    const code = getSafeCalendarErrorCode(error);
    console.error('Google Calendar event cancellation failed', { code, eventId });
    captureCalendarFailure('cancel_tutoring_event', code, { eventId });
    throw calendarFailure(code);
  }
}

/**
 * Delete a tutoring session event completely
 * @param {string} eventId - Event ID
 * @returns {Promise<Object>} Delete result
 */
export async function deleteTutoringSessionEvent(eventId) {
  try {
    if (!eventId) {
      throw new Error('Event ID is required for deletion');
    }

    if (!isConfigured()) {
      throw new Error('Service Account not configured');
    }

    console.log(` Deleting tutoring session event: ${eventId}`);

    const calendar = await getCalendarClient();

    await calendar.events.delete({
      calendarId: calendarId,
      eventId: eventId,
      sendUpdates: 'none', // Don't send invitations
    });

    console.log(' Tutoring session event deleted successfully');

    return {
      success: true,
      eventId: eventId,
      deleted: true,
    };
  } catch (error) {
    const code = getSafeCalendarErrorCode(error);
    console.error('Google Calendar event deletion failed', { code, eventId });
    captureCalendarFailure('delete_tutoring_event', code, { eventId });
    throw calendarFailure(code);
  }
}

/**
 * Get information about a specific event
 * @param {string} eventId - Event ID
 * @returns {Promise<Object>} Event data
 */
export async function getTutoringSessionEvent(eventId) {
  try {
    if (!eventId) {
      throw new Error('Event ID is required');
    }

    if (!isConfigured()) {
      throw new Error('Service Account not configured');
    }

    const calendar = await getCalendarClient();

    const response = await calendar.events.get({
      calendarId: calendarId,
      eventId: eventId,
    });

    return {
      success: true,
      event: response.data,
    };
  } catch (error) {
    const code = getSafeCalendarErrorCode(error);
    console.error('Google Calendar event retrieval failed', { code, eventId });
    captureCalendarFailure('get_tutoring_event', code, { eventId });
    throw calendarFailure(code);
  }
}

// Initialize on import (async, won't block)
initializeAuth().catch((error) => {
  console.warn('Google Calendar initialization failed on startup', { code: error?.code || 'CALENDAR_CREATE_FAILED' });
});

export default {
  initializeAuth,
  isConfigured,
  verifyConnection,
  createTutoringSessionEvent,
  updateTutoringSessionEvent,
  cancelTutoringSessionEvent,
  deleteTutoringSessionEvent,
  getTutoringSessionEvent,
};
