/**
 * Calico Calendar Service
 * Manages the central Calico calendar using Google Service Account
 * Creates tutoring session events with Google Meet integration
 */

import { google } from 'googleapis';

let auth = null;
let calendarId = null;

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

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
      console.warn('⚠️ Google Calendar Service Account credentials are not fully configured in environment variables.');
      return null;
    }

    // Get Client ID and Secret from env
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground' // El redirect URI que usaste
    );

    // Configuramos el cliente con el token permanente
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    auth = oauth2Client;

    return auth;
  } catch (error) {
    console.error('❌ Error initializing Google Calendar Service Account:', error);
    throw new Error(`Failed to initialize Google Calendar Service Account: ${error.message}`);
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

    const calendar = google.calendar({ version: 'v3', auth: auth });
    return calendar;
  } catch (error) {
    console.error('Error getting calendar client:', error);
    throw error;
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
 * Create a tutoring session event in Calico's central calendar
 * @param {Object} sessionData - Session data
 * @returns {Promise<Object>} Created event result
 */
export async function createTutoringSessionEvent(sessionData) {
  try {
    console.log('🔧 Creating tutoring session event in Calico calendar...');

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

    // Validations
    if (!summary || !startDateTime || !endDateTime) {
      throw new Error('summary, startDateTime, and endDateTime are required');
    }

    if (!tutorEmail) {
      throw new Error('tutorEmail is required');
    }

    // If service is not configured, return warning
    if (!isConfigured()) {
      console.warn('⚠️ Google Calendar Service not configured. Skipping calendar creation.');
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
    const attendeesByEmail = {};
    normalizedAttendees.forEach((a) => {
      const email = a.email;
      if (!email) return;

      const existing = attendeesByEmail[email];
      if (!existing) {
        attendeesByEmail[email] = { ...a, email };
        return;
      }

      // Merge logic: prefer displayName if present
      if (a.displayName && a.displayName !== existing.displayName) {
        attendeesByEmail[email].displayName = a.displayName;
      }

      // Prefer 'accepted' responseStatus
      const statusOrder = { accepted: 2, needsAction: 1, tentative: 1, declined: 0 };
      const existingScore = statusOrder[existing.responseStatus] || 0;
      const newScore = statusOrder[a.responseStatus] || 0;
      if (newScore > existingScore) {
        attendeesByEmail[email].responseStatus = a.responseStatus;
      }
    });

    normalizedAttendees = Object.values(attendeesByEmail);

    console.log(`👥 Normalized (deduped) attendees: ${normalizedAttendees.length}`);

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

      // 🎥 Add Google Meet automatically
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet', },
          conferenceConfiguration: {
            accessConstraints: {
              accessType: 'ANYONE'
            },
          },
        },
      },

      // Additional configurations
      status: 'confirmed',
      visibility: 'default',
      guestsCanModify: false,

      // Reminders
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 30 }], // 30 minutes before
      },
    };

    console.log('📅 Creating tutoring session event in Calico calendar...');

    // Get calendar client
    const calendar = await getCalendarClient();

    let response;
    let meetLink = null;

    try {
      // Try to create event WITH Google Meet
      console.log('🎥 Attempting to create event with Google Meet...');
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
        console.log('✅ Google Meet link created');
      } else {
        console.warn('⚠️ Event created but no Meet link generated');
      }
    } catch (meetError) {
      console.warn(`⚠️ Failed to create event with Meet, trying without conference data: ${meetError.message}`);

      // If fails with Meet, create without conferenceData
      const eventWithoutMeet = { ...event };
      delete eventWithoutMeet.conferenceData;

      response = await calendar.events.insert({
        calendarId: calendarId,
        requestBody: eventWithoutMeet,
        sendUpdates: 'none',
      });

      console.log('✅ Event created without Meet link');
    }

    console.log(`✅ Tutoring session event created successfully: ${response.data.id}`);

    return {
      success: true,
      eventId: response.data.id,
      tutorId: tutorId,
      htmlLink: response.data.htmlLink,
      hangoutLink: response.data.hangoutLink,
      meetLink: meetLink,
      event: response.data,
    };
  } catch (error) {
    console.error('❌ Error creating tutoring session event:', error);

    // Handle specific Google Calendar API errors
    if (error.code === 403) {
      throw new Error(
        'No se tienen permisos para crear eventos en el calendario central. Verifica la configuración de la Service Account.'
      );
    } else if (error.code === 404) {
      throw new Error('El calendario central no fue encontrado. Verifica el CALICO_CALENDAR_ID.');
    } else if (error.code === 400) {
      throw new Error(`Datos del evento inválidos: ${error.message}`);
    }

    throw new Error(`Error creando evento en calendario central: ${error.message}`);
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

    console.log(`📅 Updating tutoring session event: ${eventId}`);

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

    console.log('✅ Tutoring session event updated successfully');

    return {
      success: true,
      eventId: response.data.id,
      event: response.data,
    };
  } catch (error) {
    console.error('❌ Error updating tutoring session event:', error);
    throw new Error(`Error actualizando evento: ${error.message}`);
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

    console.log(`📅 Cancelling tutoring session event: ${eventId}`);

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

    console.log('✅ Tutoring session event cancelled successfully');

    return {
      success: true,
      eventId: response.data.id,
      status: 'cancelled',
    };
  } catch (error) {
    console.error('❌ Error cancelling tutoring session event:', error);
    throw new Error(`Error cancelando evento: ${error.message}`);
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

    console.log(`📅 Deleting tutoring session event: ${eventId}`);

    const calendar = await getCalendarClient();

    await calendar.events.delete({
      calendarId: calendarId,
      eventId: eventId,
      sendUpdates: 'none', // Don't send invitations
    });

    console.log('✅ Tutoring session event deleted successfully');

    return {
      success: true,
      eventId: eventId,
      deleted: true,
    };
  } catch (error) {
    console.error('❌ Error deleting tutoring session event:', error);
    throw new Error(`Error eliminando evento: ${error.message}`);
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
    console.error('❌ Error getting tutoring session event:', error);
    throw new Error(`Error obteniendo evento: ${error.message}`);
  }
}

// Initialize on import (async, won't block)
initializeAuth().catch((error) => {
  console.warn('Failed to initialize Calico Calendar on startup:', error.message);
});

export default {
  initializeAuth,
  isConfigured,
  createTutoringSessionEvent,
  updateTutoringSessionEvent,
  cancelTutoringSessionEvent,
  deleteTutoringSessionEvent,
  getTutoringSessionEvent,
};

