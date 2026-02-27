/**
 * Slot Service
 * Business logic for generating and managing hourly slots from availabilities
 */

import * as tutoringSessionService from './tutoring-session.service';
import { extractCourseFromTitle } from '../utils/course.helper';

/**
 * Generate hourly slots from a single availability
 * @param {Object} availability - Availability object
 * @returns {Array} Array of slot objects
 */
export function generateHourlySlots(availability) {
  const slots = [];

  const startTime = new Date(availability.startDateTime);
  const endTime = new Date(availability.endDateTime);

  // If endTime is less than or equal to startTime, nothing to generate
  if (!(endTime > startTime)) {
    return slots;
  }

  // Calculate total duration in hours (include partial as a full hour)
  const totalHoursFloat = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  const totalHours = Math.ceil(totalHoursFloat);

  // Generate 1-hour slots inclusively
  for (let i = 0; i < totalHours; i++) {
    let slotStart = new Date(startTime.getTime() + i * 60 * 60 * 1000);
    let slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    // Trim last slot to endTime if partial
    if (slotEnd > endTime) {
      slotEnd = new Date(endTime);
    }

    // Create unique ID for this specific slot
    const slotId = `${availability.id}_slot_${i}`;

    const slot = {
      id: slotId,
      parentAvailabilityId: availability.id,
      slotIndex: i,
      tutorId: availability.tutorId,
      tutorEmail: availability.tutorEmail,
      title: availability.title,
      description: availability.description,
      startDateTime: slotStart,
      endDateTime: slotEnd,
      location: availability.location,
      course: availability.course || extractCourseFromTitle(availability.title) || 'Tutoría General',
      color: availability.color,
      googleEventId: availability.googleEventId,
      htmlLink: availability.googleEventId 
        ? `https://calendar.google.com/calendar/event?eid=${availability.googleEventId}` 
        : undefined,
      status: 'available',
      isBooked: false,
      bookedBy: null,
      sessionId: null,
      originalStartDateTime: availability.startDateTime,
      originalEndDateTime: availability.endDateTime,
      slotDuration: Math.max(0, (slotEnd.getTime() - slotStart.getTime()) / (1000 * 60 * 60)),
      recurring: availability.recurring,
      recurrenceRule: availability.recurrenceRule,
    };

    // Avoid empty or negative slots
    if (slotEnd > slotStart) {
      slots.push(slot);
    }
  }

  return slots;
}

/**
 * Generate hourly slots from multiple availabilities
 * @param {Array} availabilities - Array of availability objects
 * @returns {Array} Array of all generated slots
 */
export function generateHourlySlotsFromAvailabilities(availabilities) {
  if (!Array.isArray(availabilities)) {
    console.warn('generateHourlySlotsFromAvailabilities: availabilities is not a valid array');
    return [];
  }

  const allSlots = [];

  availabilities.forEach((availability) => {
    const slots = generateHourlySlots(availability);
    allSlots.push(...slots);
  });

  return allSlots;
}

/**
 * Apply saved bookings to generated slots
 * @param {Array} slots - Array of slots
 * @returns {Promise<Array>} Slots with booking information
 */
export async function applySavedBookingsToSlots(slots) {
  if (!slots || slots.length === 0) {
    return slots;
  }

  console.log(`Applying bookings to ${slots.length} slots`);

  // Group slots by parentAvailabilityId for efficient querying
  const slotsByAvailability = new Map();
  slots.forEach((slot) => {
    if (!slotsByAvailability.has(slot.parentAvailabilityId)) {
      slotsByAvailability.set(slot.parentAvailabilityId, []);
    }
    slotsByAvailability.get(slot.parentAvailabilityId).push(slot);
  });

  // Get bookings for all availabilities
  const bookingPromises = Array.from(slotsByAvailability.keys()).map(async (availabilityId) => {
    try {
      // Get sessions that might be booked for this availability
      const tutorId = slots.find((s) => s.parentAvailabilityId === availabilityId)?.tutorId || '';
      const sessions = await tutoringSessionService.getSessionsByTutor(tutorId, 100);
      return { availabilityId, sessions };
    } catch (error) {
      console.warn(`Error getting bookings for availability ${availabilityId}:`, error);
      return { availabilityId, sessions: [] };
    }
  });

  const bookingResults = await Promise.all(bookingPromises);
  const bookingsByAvailability = new Map();

  bookingResults.forEach(({ availabilityId, sessions }) => {
    bookingsByAvailability.set(availabilityId, sessions);
  });

  // Apply bookings to slots
  return slots.map((slot) => {
    const sessions = bookingsByAvailability.get(slot.parentAvailabilityId) || [];
    const slotStart = new Date(slot.startDateTime);
    const slotEnd = new Date(slot.endDateTime);

    // Find if any session overlaps with this slot
    const booking = sessions.find((session) => {
      const sessionStart = new Date(session.scheduledStart);
      const sessionEnd = new Date(session.scheduledEnd);

      // Check if session overlaps with slot (with 1 minute tolerance)
      return (
        sessionStart <= slotEnd &&
        sessionEnd >= slotStart &&
        session.status !== 'cancelled' &&
        session.status !== 'declined'
      );
    });

    if (booking) {
      return {
        ...slot,
        isBooked: true,
        bookedBy: booking.studentId,
        sessionId: booking.id,
        bookingId: booking.id,
        bookedAt: booking.createdAt,
      };
    }

    return slot;
  });
}

/**
 * Filter available slots (not booked and future)
 * @param {Array} slots - Array of slots
 * @returns {Array} Available slots
 */
export function getAvailableSlots(slots) {
  const now = new Date();
  const availableSlots = slots.filter((slot) => {
    const slotStart = new Date(slot.startDateTime);
    const isFuture = slotStart > now;
    const isNotBooked = !slot.isBooked;

    return isFuture && isNotBooked;
  });

  console.log(`Filtered ${availableSlots.length} available slots from ${slots.length} total slots`);
  return availableSlots;
}

/**
 * Check if a specific slot is available
 * @param {Object} slot - Slot object
 * @returns {boolean} True if available
 */
export function isSlotAvailable(slot) {
  const now = new Date();
  const slotStart = new Date(slot.startDateTime);
  const isFuture = slotStart > now;
  const isNotBooked = !slot.isBooked;

  return isFuture && isNotBooked;
}

/**
 * Group slots by date
 * @param {Array} slots - Array of slots
 * @returns {Object} Slots grouped by date string (YYYY-MM-DD)
 */
export function groupSlotsByDate(slots) {
  const grouped = {};

  slots.forEach((slot) => {
    const date = new Date(slot.startDateTime);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;

    const localMidnight = new Date(y, date.getMonth(), date.getDate());

    if (!grouped[dateKey]) {
      grouped[dateKey] = {
        date: localMidnight,
        slots: [],
      };
    }

    grouped[dateKey].slots.push(slot);
  });

  // Sort slots by time within each day
  Object.keys(grouped).forEach((dateKey) => {
    grouped[dateKey].slots.sort(
      (a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
    );
  });

  return grouped;
}

/**
 * Format slot info for display
 * @param {Object} slot - Slot object
 * @returns {Object} Formatted slot info
 */
export function formatSlotInfo(slot) {
  const startTime = new Date(slot.startDateTime);
  const endTime = new Date(slot.endDateTime);

  return {
    id: slot.id,
    date: startTime.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    startTime: startTime.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    endTime: endTime.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    duration: '1h',
    course: slot.course,
    location: slot.location,
    description: slot.description,
    tutorId: slot.tutorId,
    tutorEmail: slot.tutorEmail,
    isAvailable: isSlotAvailable(slot),
    isBooked: slot.isBooked,
    bookedBy: slot.bookedBy,
  };
}

/**
 * Get consecutive available slots (for longer sessions)
 * @param {Array} slots - Array of slots
 * @param {number} count - Number of consecutive slots needed
 * @returns {Array<Array>} Array of consecutive slot groups
 */
export function getConsecutiveAvailableSlots(slots, count = 1) {
  const availableSlots = getAvailableSlots(slots);
  const consecutiveGroups = [];

  for (let i = 0; i <= availableSlots.length - count; i++) {
    const group = [];
    let isConsecutive = true;

    for (let j = 0; j < count; j++) {
      const currentSlot = availableSlots[i + j];

      if (!currentSlot) {
        isConsecutive = false;
        break;
      }

      if (j > 0) {
        const prevSlot = availableSlots[i + j - 1];
        const currentStart = new Date(currentSlot.startDateTime);
        const prevEnd = new Date(prevSlot.endDateTime);

        // Check that they are consecutive (max 1 minute difference for tolerance)
        if (Math.abs(currentStart.getTime() - prevEnd.getTime()) > 60000) {
          isConsecutive = false;
          break;
        }
      }

      group.push(currentSlot);
    }

    if (isConsecutive && group.length === count) {
      consecutiveGroups.push(group);
    }
  }

  return consecutiveGroups;
}

/**
 * Validate that a slot can be booked
 * @param {Object} slot - Slot object
 * @returns {Object} Validation result { isValid, errors }
 */
export function validateSlotForBooking(slot) {
  const errors = [];

  if (!slot) {
    errors.push('Slot no encontrado');
    return { isValid: false, errors };
  }

  if (slot.isBooked) {
    errors.push(`Este horario ya está reservado por ${slot.bookedBy || 'otro estudiante'}`);
  }

  const now = new Date();
  const slotStart = new Date(slot.startDateTime);

  if (slotStart <= now) {
    errors.push('No se puede reservar un horario que ya pasó');
  }

  // Verify it's not too soon (minimum 1 hour in advance)
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  if (slotStart < oneHourFromNow) {
    errors.push('Debe reservar con al menos 1 hora de anticipación');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Check slot availability in real time
 * @param {Object} slot - Slot object
 * @returns {Promise<Object>} Availability check result
 */
export async function checkSlotAvailabilityRealTime(slot) {
  try {
    // Get sessions for this tutor
    const sessions = await tutoringSessionService.getSessionsByTutor(slot.tutorId || '', 100);

    const slotStart = new Date(slot.startDateTime);
    const slotEnd = new Date(slot.endDateTime);

    // Find if any session overlaps with this slot
    const existingBooking = sessions.find((session) => {
      const sessionStart = new Date(session.scheduledStart);
      const sessionEnd = new Date(session.scheduledEnd);

      return (
        sessionStart <= slotEnd &&
        sessionEnd >= slotStart &&
        session.status !== 'cancelled' &&
        session.status !== 'declined'
      );
    });

    if (existingBooking) {
      console.log(`❌ Slot ${slot.id} already booked in real time by ${existingBooking.studentId}`);
      return {
        available: false,
        reason: 'Este horario ya fue reservado por otro estudiante',
        booking: existingBooking,
      };
    }

    console.log(`✅ Slot ${slot.id} available in real time`);
    return {
      available: true,
      reason: 'Slot disponible',
      booking: null,
    };
  } catch (error) {
    console.error('Error checking availability in real time:', error);
    return {
      available: false,
      reason: 'Error verificando disponibilidad',
      booking: null,
    };
  }
}

/**
 * Extract time from datetime string
 * @param {Date|string} dateTime - DateTime
 * @returns {string|null} Time string (HH:MM)
 */
export function extractTimeFromDateTime(dateTime) {
  if (!dateTime) return null;
  const date = dateTime instanceof Date ? dateTime : new Date(dateTime);
  if (isNaN(date.getTime())) return null;
  return date.toTimeString().substring(0, 5);
}

/**
 * Generate hourly slots from time range
 * @param {string} startTime - Start time (HH:MM)
 * @param {string} endTime - End time (HH:MM)
 * @returns {Array<string>} Array of time strings
 */
export function generateHourlySlotsFromTimeRange(startTime, endTime) {
  const slots = [];
  const start = parseTime(startTime);
  const end = parseTime(endTime);

  for (let hour = start; hour < end; hour++) {
    const timeString = `${hour.toString().padStart(2, '0')}:00`;
    slots.push(timeString);
  }

  return slots;
}

/**
 * Parse time string to hour number
 * @param {string} timeString - Time string (HH:MM)
 * @returns {number} Hour number
 */
export function parseTime(timeString) {
  const [hours] = timeString.split(':').map(Number);
  return hours;
}

export default {
  generateHourlySlots,
  generateHourlySlotsFromAvailabilities,
  applySavedBookingsToSlots,
  getAvailableSlots,
  isSlotAvailable,
  groupSlotsByDate,
  formatSlotInfo,
  getConsecutiveAvailableSlots,
  validateSlotForBooking,
  checkSlotAvailabilityRealTime,
  extractTimeFromDateTime,
  generateHourlySlotsFromTimeRange,
  parseTime,
};

