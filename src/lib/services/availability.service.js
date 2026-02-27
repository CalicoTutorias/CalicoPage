/**
 * Availability Service
 * Business logic for availability management
 */

import * as availabilityRepository from '../repositories/availability.repository';
import * as calendarService from './calendar.service';

/**
 * Get availability by ID
 * @param {string} id - Availability ID
 * @returns {Promise<Object|null>}
 */
export async function getAvailabilityById(id) {
  try {
    return await availabilityRepository.findById(id);
  } catch (error) {
    console.error(`Error getting availability by ID ${id}:`, error);
    return null;
  }
}

/**
 * Get availabilities with filters
 * @param {Object} query - Query filters
 * @returns {Promise<Array>}
 */
export async function getAvailabilities(query = {}) {
  const { tutorId, course, startDate, endDate, limit = 50 } = query;
  let availabilities = [];

  try {
    if (tutorId && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const allTutorAvailabilities = await availabilityRepository.findByTutor(tutorId, 200);
      
      // Filter by date range
      availabilities = allTutorAvailabilities.filter((availability) => {
        const availStart = availability.startDateTime;
        return availStart >= start && availStart <= end;
      });
    } else if (tutorId) {
      availabilities = await availabilityRepository.findByTutor(tutorId, limit);
    } else if (course) {
      availabilities = await availabilityRepository.findByCourse(course, limit);
    } else if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      availabilities = await availabilityRepository.findInDateRange(start, end, limit);
    } else {
      // Get availabilities for next week by default
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      availabilities = await availabilityRepository.findInDateRange(now, nextWeek, limit);
    }

    console.log(`Found ${availabilities.length} availabilities`);
    return availabilities;
  } catch (error) {
    console.error('Error fetching availabilities:', error);
    throw error;
  }
}

/**
 * Check if event exists
 * @param {string} googleEventId - Google Event ID
 * @returns {Promise<boolean>}
 */
export async function checkEventExists(googleEventId) {
  try {
    return await availabilityRepository.exists(googleEventId);
  } catch (error) {
    console.error(`Error checking if event ${googleEventId} exists:`, error);
    throw error;
  }
}

/**
 * Save availability
 * @param {string} googleEventId - Google Event ID
 * @param {Object} availabilityData - Availability data
 * @returns {Promise<string>} Document ID
 */
export async function saveAvailability(googleEventId, availabilityData) {
  try {
    const id = await availabilityRepository.save(googleEventId, availabilityData);
    console.log(`Availability saved to Firebase: ${googleEventId}`);
    return id;
  } catch (error) {
    console.error('Error saving availability:', error);
    throw error;
  }
}

/**
 * Delete availability
 * @param {string} googleEventId - Google Event ID
 * @returns {Promise<void>}
 */
export async function deleteAvailability(googleEventId) {
  try {
    await availabilityRepository.deleteAvailability(googleEventId);
    console.log(`Availability deleted from Firebase: ${googleEventId}`);
  } catch (error) {
    console.error('Error deleting availability:', error);
    throw error;
  }
}

/**
 * Sync availabilities from Google Calendar
 * @param {string} tutorId - Tutor ID
 * @param {string} accessToken - Google OAuth2 access token
 * @param {string} calendarId - Optional specific calendar ID
 * @returns {Promise<Object>} Sync results
 */
export async function syncAvailabilities(tutorId, accessToken, calendarId = null) {
  const results = {
    created: 0,
    updated: 0,
    errors: [],
    totalProcessed: 0,
  };

  try {
    if (!accessToken || accessToken.trim() === '') {
      throw new Error('No hay conexión activa con Google Calendar. Por favor, conecta tu calendario primero.');
    }

    console.log(`Starting sync process for tutor: ${tutorId}`);

    // Get calendars
    let calendars = [];
    try {
      calendars = await calendarService.listCalendars(accessToken);
      console.log(`Found ${calendars.length} calendars`);
    } catch (error) {
      console.error('Error listing calendars:', error);
      throw new Error('Error de conexión con Google Calendar: No se pudieron obtener los calendarios.');
    }

    // Filter calendars if specific ID provided
    const calendarsToSync = calendarId
      ? calendars.filter((cal) => cal.id === calendarId)
      : calendars;

    if (calendarsToSync.length === 0) {
      throw new Error('No se encontraron calendarios para sincronizar.');
    }

    // Get events from calendars (next 3 months)
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

    for (const calendar of calendarsToSync) {
      try {
        console.log(`Syncing calendar: ${calendar.summary || calendar.id}`);
        const events = await calendarService.listEvents(accessToken, calendar.id, timeMin, timeMax);
        console.log(`Found ${events.length} events in calendar ${calendar.summary || calendar.id}`);

        for (const event of events) {
          try {
            results.totalProcessed++;

            // Skip events without start/end times
            if (!event.start || !event.end) continue;

            // Parse event dates
            const startDateTime = event.start.dateTime
              ? new Date(event.start.dateTime)
              : event.start.date
              ? new Date(event.start.date)
              : null;
            const endDateTime = event.end.dateTime
              ? new Date(event.end.dateTime)
              : event.end.date
              ? new Date(event.end.date)
              : null;

            if (!startDateTime || !endDateTime) continue;

            // Check if event already exists
            const existingAvailability = await availabilityRepository.findById(event.id);

            const availabilityData = {
              tutorId,
              title: event.summary || 'Sin título',
              startDateTime,
              endDateTime,
              googleEventId: event.id,
              recurring: !!event.recurrence && event.recurrence.length > 0,
              sourceCalendarId: calendar.id,
              sourceCalendarName: calendar.summary || calendar.id,
            };

            // Add optional fields
            if (event.location) availabilityData.location = event.location;
            if (event.htmlLink) availabilityData.eventLink = event.htmlLink;
            if (event.recurrence && event.recurrence.length > 0) {
              availabilityData.recurrenceRule = event.recurrence.join(';');
            }
            if (event.summary) availabilityData.course = event.summary;

            if (existingAvailability) {
              await availabilityRepository.save(event.id, availabilityData);
              results.updated++;
            } else {
              await availabilityRepository.save(event.id, availabilityData);
              results.created++;
            }
          } catch (error) {
            console.error(`Error processing event ${event.id}:`, error);
            results.errors.push({
              eventId: event.id,
              error: error.message || 'Error procesando evento',
            });
          }
        }
      } catch (error) {
        console.error(`Error syncing calendar ${calendar.id}:`, error);
        results.errors.push({
          error: `Error sincronizando calendario ${calendar.summary || calendar.id}: ${error.message}`,
        });
      }
    }

    console.log(
      `Sync completed: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`
    );

    return results;
  } catch (error) {
    console.error('Error syncing availabilities:', error);
    throw error;
  }
}

/**
 * Intelligent sync - only syncs new events
 * @param {string} tutorId - Tutor ID
 * @param {string} accessToken - Google OAuth2 access token
 * @param {string} calendarName - Calendar name to sync
 * @param {number} daysAhead - Days ahead to sync
 * @returns {Promise<Object>} Sync results
 */
export async function intelligentSync(tutorId, accessToken, calendarName = 'Disponibilidad', daysAhead = 30) {
  try {
    console.log(`Starting intelligent sync for tutor: ${tutorId}`);

    // Get calendars
    const calendars = await calendarService.listCalendars(accessToken);

    // Find specific calendar by name
    let targetCalendar = null;
    if (calendarName) {
      targetCalendar = calendars.find(
        (cal) =>
          cal.summary?.toLowerCase() === calendarName.toLowerCase() ||
          calendarName.toLowerCase().includes(cal.summary?.toLowerCase() || '') ||
          cal.summary?.toLowerCase()?.includes(calendarName.toLowerCase())
      );
      if (!targetCalendar) {
        return {
          synced: 0,
          skipped: 0,
          updated: 0,
          errors: 0,
          message: `No se encontró un calendario llamado "${calendarName}". Por favor, crea uno.`,
          calendarFound: false,
        };
      }
    } else {
      targetCalendar = calendars.find((cal) => cal.primary) || calendars[0];
    }

    if (!targetCalendar) {
      throw new Error('No se encontraron calendarios para sincronizar.');
    }

    // Get events from the target calendar
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

    const events = await calendarService.listEvents(accessToken, targetCalendar.id, timeMin, timeMax);

    // Filter valid events
    const availabilityEvents = events.filter((event) => {
      return event.summary && (event.start?.dateTime || event.start?.date);
    });

    console.log(`Found ${availabilityEvents.length} valid events in calendar ${targetCalendar.summary}`);

    if (availabilityEvents.length === 0) {
      return {
        synced: 0,
        skipped: 0,
        updated: 0,
        errors: 0,
        message: 'No hay eventos válidos para sincronizar',
        calendarFound: true,
      };
    }

    // Check which events already exist
    const existingEvents = new Set();
    for (const event of availabilityEvents) {
      try {
        const exists = await availabilityRepository.exists(event.id);
        if (exists) {
          existingEvents.add(event.id);
        }
      } catch (error) {
        console.warn(`Error checking event ${event.id}:`, error.message);
      }
    }

    console.log(`${existingEvents.size} events already exist in Firebase`);

    // Filter only new events
    const newEvents = availabilityEvents.filter((event) => !existingEvents.has(event.id));

    if (newEvents.length === 0) {
      return {
        synced: 0,
        skipped: existingEvents.size,
        updated: 0,
        errors: 0,
        message: 'Todos los eventos ya están sincronizados',
        calendarFound: true,
      };
    }

    // Sync only new events
    const syncResult = await syncSpecificEvents(tutorId, accessToken, newEvents, targetCalendar.id);

    return {
      synced: syncResult.created,
      skipped: existingEvents.size,
      updated: syncResult.updated,
      errors: syncResult.errors.length,
      message: `Sincronizados ${syncResult.created} eventos nuevos, ${existingEvents.size} ya existían`,
      calendarFound: true,
    };
  } catch (error) {
    console.error('Error in intelligent sync:', error);
    throw error;
  }
}

/**
 * Sync specific events
 * @param {string} tutorId - Tutor ID
 * @param {string} accessToken - Google OAuth2 access token
 * @param {Array} events - Events to sync
 * @param {string} calendarId - Calendar ID
 * @returns {Promise<Object>} Sync results
 */
export async function syncSpecificEvents(tutorId, accessToken, events, calendarId = null) {
  const results = {
    created: 0,
    updated: 0,
    errors: [],
    totalProcessed: 0,
  };

  // Get calendar ID if not provided
  let targetCalendarId = calendarId;
  if (!targetCalendarId) {
    try {
      const calendars = await calendarService.listCalendars(accessToken);
      const primary = calendars.find((cal) => cal.primary) || calendars[0];
      targetCalendarId = primary?.id;
      if (!targetCalendarId) {
        throw new Error('No se pudo determinar el calendario a usar');
      }
    } catch (error) {
      throw new Error(`Error obteniendo calendario: ${error.message}`);
    }
  }

  for (const event of events) {
    try {
      results.totalProcessed++;

      if (!event.start || !event.end) continue;

      const startDateTime = event.start.dateTime
        ? new Date(event.start.dateTime)
        : event.start.date
        ? new Date(event.start.date)
        : null;
      const endDateTime = event.end.dateTime
        ? new Date(event.end.dateTime)
        : event.end.date
        ? new Date(event.end.date)
        : null;

      if (!startDateTime || !endDateTime) continue;

      const existingAvailability = await availabilityRepository.findById(event.id);

      const availabilityData = {
        tutorId,
        title: event.summary || 'Sin título',
        startDateTime,
        endDateTime,
        googleEventId: event.id,
        recurring: !!event.recurrence && event.recurrence.length > 0,
        sourceCalendarId: targetCalendarId,
      };

      if (event.location) availabilityData.location = event.location;
      if (event.htmlLink) availabilityData.eventLink = event.htmlLink;
      if (event.recurrence && event.recurrence.length > 0) {
        availabilityData.recurrenceRule = event.recurrence.join(';');
      }
      if (event.organizer?.displayName) {
        availabilityData.sourceCalendarName = event.organizer.displayName;
      }
      if (event.summary) availabilityData.course = event.summary;

      if (existingAvailability) {
        await availabilityRepository.save(event.id, availabilityData);
        results.updated++;
      } else {
        await availabilityRepository.save(event.id, availabilityData);
        results.created++;
      }
    } catch (error) {
      console.error(`Error processing event ${event.id}:`, error);
      results.errors.push({
        eventId: event.id,
        error: error.message || 'Error procesando evento',
      });
    }
  }

  return results;
}

/**
 * Create availability event
 * @param {string} tutorId - Tutor ID
 * @param {string} accessToken - Google OAuth2 access token
 * @param {Object} eventData - Event data
 * @returns {Promise<Object>} Created event and availability ID
 */
export async function createAvailabilityEvent(tutorId, accessToken, eventData) {
  try {
    // Validate event data
    const validation = validateEventData(eventData);
    if (!validation.isValid) {
      throw new Error(`Datos inválidos: ${validation.errors.join(', ')}`);
    }

    // Get calendar ID
    let calendarId = eventData.calendarId;
    if (!calendarId) {
      const calendars = await calendarService.listCalendars(accessToken);
      const disponibilidadCalendar = calendars.find(
        (cal) => cal.summary?.toLowerCase() === 'disponibilidad'
      );
      calendarId =
        disponibilidadCalendar?.id ||
        calendars.find((cal) => cal.primary)?.id ||
        calendars[0]?.id;
      if (!calendarId) {
        throw new Error('No se pudo determinar el calendario a usar');
      }
    }

    // Build event date/time
    const startDateTime = new Date(`${eventData.date}T${eventData.startTime}`);
    const endDateTime = new Date(`${eventData.date}T${eventData.endTime}`);

    // Create event in Google Calendar
    const googleEvent = {
      summary: eventData.title,
      description: eventData.description || '',
      location: eventData.location || '',
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    const createdEvent = await calendarService.createEvent(accessToken, calendarId, googleEvent);

    // Save to Firebase
    const availabilityData = {
      tutorId,
      title: eventData.title,
      startDateTime,
      endDateTime,
      googleEventId: createdEvent.id,
      recurring: false,
      sourceCalendarId: calendarId,
      course: eventData.course || eventData.title,
    };

    if (eventData.location) availabilityData.location = eventData.location;
    if (createdEvent.htmlLink) availabilityData.eventLink = createdEvent.htmlLink;

    const availabilityId = await availabilityRepository.save(createdEvent.id, availabilityData);

    console.log(`Created availability event: ${createdEvent.id}`);

    return {
      event: createdEvent,
      availabilityId,
    };
  } catch (error) {
    console.error('Error creating availability event:', error);
    throw error;
  }
}

/**
 * Delete availability event
 * @param {string} accessToken - Google OAuth2 access token
 * @param {string} googleEventId - Google Event ID
 * @param {string} calendarId - Optional calendar ID
 * @returns {Promise<void>}
 */
export async function deleteAvailabilityEvent(accessToken, googleEventId, calendarId = null) {
  try {
    // Get calendar ID if not provided
    let targetCalendarId = calendarId;
    if (!targetCalendarId) {
      const availability = await availabilityRepository.findById(googleEventId);
      if (availability?.sourceCalendarId) {
        targetCalendarId = availability.sourceCalendarId;
      } else {
        const calendars = await calendarService.listCalendars(accessToken);
        targetCalendarId = calendars.find((cal) => cal.primary)?.id || calendars[0]?.id;
      }
    }

    if (!targetCalendarId) {
      throw new Error('No se pudo determinar el calendario');
    }

    // Delete from Google Calendar
    await calendarService.deleteEvent(accessToken, targetCalendarId, googleEventId);

    // Delete from Firebase
    await availabilityRepository.deleteAvailability(googleEventId);

    console.log(`Deleted availability event: ${googleEventId}`);
  } catch (error) {
    console.error('Error deleting availability event:', error);
    throw error;
  }
}

/**
 * Validate event data
 * @param {Object} eventData - Event data to validate
 * @returns {Object} Validation result
 */
export function validateEventData(eventData) {
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
 * Generate slots from availabilities
 * @param {string} tutorId - Tutor ID
 * @param {string} startDate - Optional start date
 * @param {string} endDate - Optional end date
 * @param {number} limit - Optional limit
 * @returns {Promise<Object>} Generated slots
 */
export async function generateSlots(tutorId, startDate = null, endDate = null, limit = 100) {
  try {
    // Import slot service dynamically to avoid circular dependencies
    const slotService = await import('./slot.service');
    
    const query = { tutorId, limit };
    if (startDate) query.startDate = startDate;
    if (endDate) query.endDate = endDate;

    const availabilities = await getAvailabilities(query);
    const slots = slotService.generateHourlySlotsFromAvailabilities(availabilities);
    
    // Apply bookings to slots
    const slotsWithBookings = await slotService.applySavedBookingsToSlots(slots);
    const availableSlots = slotService.getAvailableSlots(slotsWithBookings);

    return {
      success: true,
      slots: slotsWithBookings,
      totalSlots: slotsWithBookings.length,
      availableSlots: availableSlots.length,
      bookedSlots: slotsWithBookings.length - availableSlots.length,
    };
  } catch (error) {
    console.error('Error generating slots:', error);
    throw error;
  }
}

/**
 * Get availability for multiple tutors
 * @param {Array<string>} tutorIds - Array of tutor IDs
 * @param {string} startDate - Optional start date
 * @param {string} endDate - Optional end date
 * @param {number} limit - Optional limit
 * @returns {Promise<Array>} Tutors availability
 */
export async function getMultipleTutorsAvailability(tutorIds, startDate = null, endDate = null, limit = 100) {
  try {
    console.log(`Getting availability for ${tutorIds.length} tutors`);

    const availabilityPromises = tutorIds.map(async (id) => {
      try {
        const query = { tutorId: id, limit };
        if (startDate) query.startDate = startDate;
        if (endDate) query.endDate = endDate;

        const availabilities = await getAvailabilities(query);

        return {
          tutorId: id,
          slots: availabilities,
          connected: true,
          error: null,
          totalSlots: availabilities.length,
        };
      } catch (error) {
        console.warn(`Error loading availability for ${id}:`, error);
        return {
          tutorId: id,
          slots: [],
          connected: false,
          error: error.message || 'Error loading availability',
          totalSlots: 0,
        };
      }
    });

    const results = await Promise.all(availabilityPromises);
    console.log(`Loaded availability for ${results.length} tutors`);

    return results;
  } catch (error) {
    console.error('Error getting multiple tutors availability:', error);
    throw error;
  }
}

export default {
  getAvailabilityById,
  getAvailabilities,
  checkEventExists,
  saveAvailability,
  deleteAvailability,
  syncAvailabilities,
  intelligentSync,
  syncSpecificEvents,
  createAvailabilityEvent,
  deleteAvailabilityEvent,
  validateEventData,
  generateSlots,
  getMultipleTutorsAvailability,
};

