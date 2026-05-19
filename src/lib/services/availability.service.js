/**
 * Availability Service
 * Business logic for tutor weekly availability and schedule configuration.
 */

import * as availabilityRepo from '../repositories/availability.repository';
import * as calendarService from './calendar.service';
import prisma from '../prisma';

// ===== SERIALIZE @db.Time() FOR JSON =====
// Prisma maps PostgreSQL TIME → JS Date on 1970-01-01 UTC. API clients expect wall-clock strings.

function formatTimeForApi(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      const h = m[1].padStart(2, '0');
      const min = m[2];
      const s = (m[3] ?? '00').padStart(2, '0');
      return `${h}:${min}:${s}`;
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(11, 19);
}

function serializeDateForApi(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Return YYYY-MM-DD using UTC parts (DB stores it as DATE at midnight UTC)
  return d.toISOString().substring(0, 10);
}

function serializeAvailabilityRow(row) {
  if (!row) return row;
  return {
    ...row,
    startTime:    formatTimeForApi(row.startTime),
    endTime:      formatTimeForApi(row.endTime),
    specificDate: serializeDateForApi(row.specificDate),
  };
}

function serializeAvailabilityRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(serializeAvailabilityRow);
}

// ===== SLOT BUSINESS RULES =====
// Slots are always exactly 1h long and must start at one of these minute marks.
// Both start and end of an Availability block must fall on these marks too,
// so the block cleanly subdivides into 1h slots.
const ALLOWED_SLOT_MINUTES = new Set([0, 10, 20, 30, 40, 45, 50]);
const SLOT_DURATION_MS = 60 * 60 * 1000;

function getMinuteFromTime(value) {
  if (value instanceof Date) return value.getUTCMinutes();
  const m = String(value).match(/^\d{1,2}:(\d{2})/);
  return m ? parseInt(m[1], 10) : NaN;
}

function getMsSinceMidnight(value) {
  if (value instanceof Date) {
    return (
      value.getUTCHours() * 3600_000 +
      value.getUTCMinutes() * 60_000 +
      value.getUTCSeconds() * 1000
    );
  }
  const m = String(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return NaN;
  return (
    (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 60_000 +
    parseInt(m[3] || '0', 10) * 1000
  );
}

function validateBlockTimes(startTime, endTime) {
  const startMinute = getMinuteFromTime(startTime);
  const endMinute = getMinuteFromTime(endTime);
  if (!ALLOWED_SLOT_MINUTES.has(startMinute) || !ALLOWED_SLOT_MINUTES.has(endMinute)) {
    const err = new Error(
      'Las horas deben empezar y terminar en :00, :10, :20, :30, :40, :45 o :50',
    );
    err.code = 'INVALID_TIMES';
    throw err;
  }
  const startMs = getMsSinceMidnight(startTime);
  const endMs = getMsSinceMidnight(endTime);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    const err = new Error('Hora inválida');
    err.code = 'INVALID_TIMES';
    throw err;
  }
  if (endMs - startMs < SLOT_DURATION_MS) {
    const err = new Error('El bloque debe durar al menos 1 hora');
    err.code = 'INVALID_TIMES';
    throw err;
  }
}

// ===== AVAILABILITY BLOCKS =====

export async function getAvailabilityByUserId(userId) {
  const rows = await availabilityRepo.findAvailabilityByUserId(userId);
  return serializeAvailabilityRows(rows);
}

export async function getAvailabilityByDay(userId, dayOfWeek) {
  const rows = await availabilityRepo.findAvailabilityByDay(userId, dayOfWeek);
  return serializeAvailabilityRows(rows);
}

/**
 * Create a single availability block with overlap validation.
 *
 * - If recurring=true (default): dayOfWeek is required, specificDate must be absent.
 * - If recurring=false: specificDate (YYYY-MM-DD) is required; dayOfWeek is derived from it.
 *
 * @throws Error with code OVERLAP | INVALID_TIMES
 */
export async function createAvailability({ userId, dayOfWeek, startTime, endTime, recurring = true, specificDate = null }) {
  let resolvedDayOfWeek = dayOfWeek;
  let resolvedSpecificDate = null;

  if (!recurring) {
    if (!specificDate) {
      const err = new Error('specificDate es requerido cuando el bloque no es recurrente');
      err.code = 'INVALID_TIMES';
      throw err;
    }
    resolvedSpecificDate = new Date(specificDate);
    if (Number.isNaN(resolvedSpecificDate.getTime())) {
      const err = new Error('specificDate inválido (usa YYYY-MM-DD)');
      err.code = 'INVALID_TIMES';
      throw err;
    }
    // Derive dayOfWeek from date (local date parts to avoid UTC shift)
    const [y, m, d] = specificDate.split('-').map(Number);
    resolvedDayOfWeek = new Date(y, m - 1, d).getDay();
  }

  if (startTime >= endTime) {
    const err = new Error('startTime must be before endTime');
    err.code = 'INVALID_TIMES';
    throw err;
  }

  validateBlockTimes(startTime, endTime);

  const overlap = await availabilityRepo.findOverlap(
    userId, resolvedDayOfWeek, startTime, endTime, null,
    { recurring, specificDate: resolvedSpecificDate },
  );
  if (overlap) {
    const err = new Error('El horario se cruza con un bloque existente');
    err.code = 'OVERLAP';
    err.conflictingBlock = overlap;
    throw err;
  }

  const created = await availabilityRepo.createAvailability({
    userId,
    dayOfWeek: resolvedDayOfWeek,
    startTime,
    endTime,
    recurring,
    specificDate: resolvedSpecificDate,
  });
  return serializeAvailabilityRow(created);
}

/**
 * Update an existing availability block with overlap validation.
 *
 * Supports changing recurring flag and/or specificDate.
 * When switching to non-recurring, specificDate is required.
 * When switching to recurring, specificDate is cleared.
 *
 * @throws Error with code OVERLAP | INVALID_TIMES | NOT_FOUND | FORBIDDEN
 */
export async function updateAvailability(id, userId, data) {
  const existing = await availabilityRepo.findAvailabilityById(id);
  if (!existing) {
    const err = new Error('Availability block not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (existing.userId !== userId) {
    const err = new Error('Not authorized to modify this block');
    err.code = 'FORBIDDEN';
    throw err;
  }

  // Resolve the final recurring flag and specificDate.
  // Existing rows pre-migration may have recurring=undefined → default to true.
  const recurring = data.recurring !== undefined ? data.recurring : (existing.recurring ?? true);

  let resolvedSpecificDate = existing.specificDate;
  let resolvedDayOfWeek = data.dayOfWeek ?? existing.dayOfWeek;

  if (data.specificDate !== undefined) {
    resolvedSpecificDate = data.specificDate ? new Date(data.specificDate) : null;
  }

  if (!recurring) {
    if (!resolvedSpecificDate) {
      const err = new Error('specificDate es requerido cuando el bloque no es recurrente');
      err.code = 'INVALID_TIMES';
      throw err;
    }
    // Always re-derive dayOfWeek from specificDate for one-time blocks
    const dateStr = resolvedSpecificDate instanceof Date
      ? resolvedSpecificDate.toISOString().substring(0, 10)
      : String(resolvedSpecificDate).substring(0, 10);
    const [y, m, d] = dateStr.split('-').map(Number);
    resolvedDayOfWeek = new Date(y, m - 1, d).getDay();
  } else {
    resolvedSpecificDate = null; // switching to recurring clears the date
  }

  const startTime = data.startTime ?? existing.startTime;
  const endTime = data.endTime ?? existing.endTime;

  if (startTime >= endTime) {
    const err = new Error('startTime must be before endTime');
    err.code = 'INVALID_TIMES';
    throw err;
  }

  validateBlockTimes(startTime, endTime);

  const overlap = await availabilityRepo.findOverlap(
    userId, resolvedDayOfWeek, startTime, endTime, id,
    { recurring, specificDate: resolvedSpecificDate },
  );
  if (overlap) {
    const err = new Error('El horario se cruza con un bloque existente');
    err.code = 'OVERLAP';
    err.conflictingBlock = overlap;
    throw err;
  }

  const patch = {
    dayOfWeek:    resolvedDayOfWeek,
    recurring,
    specificDate: resolvedSpecificDate,
  };
  if (data.startTime !== undefined) patch.startTime = data.startTime;
  if (data.endTime !== undefined) patch.endTime = data.endTime;
  if (data.label !== undefined) {
    patch.label =
      data.label === null || data.label === ''
        ? null
        : String(data.label).trim().slice(0, 160) || null;
  }

  const updated = await availabilityRepo.updateAvailability(id, patch);
  return serializeAvailabilityRow(updated);
}

/**
 * Delete an availability block (with ownership check).
 */
export async function deleteAvailability(id, userId) {
  const existing = await availabilityRepo.findAvailabilityById(id);
  if (!existing) {
    const err = new Error('Availability block not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (existing.userId !== userId) {
    const err = new Error('Not authorized to delete this block');
    err.code = 'FORBIDDEN';
    throw err;
  }

  await availabilityRepo.deleteAvailability(id);
}

/**
 * Replace all blocks for a given day — validates each block for overlap with siblings.
 */
export async function replaceAvailabilityForDay(userId, dayOfWeek, blocks) {
  // Validate all blocks
  for (const block of blocks) {
    if (block.startTime >= block.endTime) {
      const err = new Error('startTime must be before endTime in all blocks');
      err.code = 'INVALID_TIMES';
      throw err;
    }
    validateBlockTimes(block.startTime, block.endTime);
  }

  // Check for overlap between the new blocks themselves
  const sorted = [...blocks].sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startTime < sorted[i - 1].endTime) {
      const err = new Error('Los bloques proporcionados se solapan entre sí');
      err.code = 'OVERLAP';
      throw err;
    }
  }

  const created = await availabilityRepo.replaceAvailabilityForDay(userId, dayOfWeek, blocks);
  return serializeAvailabilityRows(created);
}

// ===== CALENDAR SYNC =====

/**
 * Sync availability from the tutor's "Disponibilidad" Google Calendar.
 *
 * Flow:
 *  1. Validate / refresh the Google access token.
 *  2. Find the calendar whose summary is "Disponibilidad" (case-insensitive).
 *  3. Fetch events for the next 60 days (enough to cover all 7 weekdays).
 *  4. Deduplicate events into unique weekly (dayOfWeek, startTime, endTime) blocks.
 *  5. Diff against the current DB state and replace everything atomically.
 *
 * @param {number} userId
 * @param {string|undefined} accessToken  - From httpOnly cookie
 * @param {string|undefined} refreshToken - From httpOnly cookie
 * @returns {Promise<{ synced: number, removed: number, skipped: number, total: number, calendarName: string }>}
 */
export async function syncAvailabilityFromCalendar(userId, accessToken, refreshToken) {
  // 1. Validate / refresh token
  const { accessToken: validToken } = await calendarService.getAccessTokenOrRefresh(
    accessToken,
    refreshToken,
  );

  // 2. Find "Disponibilidad" calendar
  const calendars = await calendarService.listCalendars(validToken);
  const dispCalendar = calendars.find(
    (c) => c.summary?.trim().toLowerCase() === 'disponibilidad',
  );

  if (!dispCalendar) {
    const err = new Error(
      'No se encontró un calendario llamado "Disponibilidad" en tu cuenta de Google.',
    );
    err.code = 'CALENDAR_NOT_FOUND';
    throw err;
  }

  // 3. Fetch events for the next 60 days
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

  const events = await calendarService.listEvents(validToken, dispCalendar.id, timeMin, timeMax);

  // 4. Convert events → availability blocks.
  //    Google returns dateTime strings like "2024-01-08T09:00:00-05:00".
  //    We extract the *local* date and local time (HH:MM) directly from the
  //    string so no UTC conversion is needed.
  //
  //    Recurring detection: when singleEvents=true, instances of a recurring
  //    series carry `recurringEventId`; standalone one-time events do not.
  //    - recurringEventId present → recurring=true, dedup by (dayOfWeek, startTime, endTime)
  //    - recurringEventId absent  → recurring=false, store each occurrence with specificDate
  const recurringSeenKeys = new Set();
  const newBlocks = [];

  for (const event of events) {
    if (event.status === 'cancelled') continue;
    if (!event.start?.dateTime || !event.end?.dateTime) continue; // skip all-day events

    const startStr = event.start.dateTime; // e.g. "2024-01-08T09:00:00-05:00"
    const endStr   = event.end.dateTime;

    const startTime = startStr.substring(11, 16); // "09:00"
    const endTime   = endStr.substring(11, 16);   // "10:00"

    if (startTime >= endTime) continue;

    const [year, month, day] = startStr.substring(0, 10).split('-').map(Number);
    const dayOfWeek = new Date(year, month - 1, day).getDay();

    const isRecurring = Boolean(event.recurringEventId);

    if (isRecurring) {
      // Recurring: deduplicate by (dayOfWeek, startTime, endTime) pattern
      const key = `${dayOfWeek}-${startTime}-${endTime}`;
      if (recurringSeenKeys.has(key)) continue;
      recurringSeenKeys.add(key);

      newBlocks.push({
        dayOfWeek,
        startTime:    new Date(`1970-01-01T${startTime}:00.000Z`),
        endTime:      new Date(`1970-01-01T${endTime}:00.000Z`),
        recurring:    true,
        specificDate: null,
      });
    } else {
      // One-time: each occurrence is a distinct slot on its specific date
      const specificDate = new Date(year, month - 1, day); // local midnight

      newBlocks.push({
        dayOfWeek,
        startTime:    new Date(`1970-01-01T${startTime}:00.000Z`),
        endTime:      new Date(`1970-01-01T${endTime}:00.000Z`),
        recurring:    false,
        specificDate,
      });
    }
  }

  // 5. Diff against current DB state
  const currentBlocks = await availabilityRepo.findAvailabilityByUserId(userId, 500);

  function blockKey(b) {
    const s = b.startTime instanceof Date ? b.startTime.toISOString().substring(11, 16) : b.startTime;
    const e = b.endTime   instanceof Date ? b.endTime.toISOString().substring(11, 16)   : b.endTime;
    if (b.recurring === false && b.specificDate) {
      const date = b.specificDate instanceof Date
        ? b.specificDate.toISOString().substring(0, 10)
        : String(b.specificDate).substring(0, 10);
      return `once:${date}-${s}-${e}`;
    }
    return `weekly:${b.dayOfWeek}-${s}-${e}`;
  }

  const currentKeys = new Set(currentBlocks.map(blockKey));
  const newKeys     = new Set(newBlocks.map(blockKey));

  const added   = newBlocks.filter((b) => !currentKeys.has(blockKey(b)));
  const removed = currentBlocks.filter((b) => !newKeys.has(blockKey(b)));
  const skipped = newBlocks.length - added.length;

  // Replace all atomically (delete everything, create new set)
  await availabilityRepo.replaceAllAvailability(userId, newBlocks);

  return {
    synced:       added.length,
    removed:      removed.length,
    skipped,
    total:        newBlocks.length,
    calendarName: dispCalendar.summary,
  };
}

// ===== SCHEDULE CONFIG =====

export async function getSchedule(userId) {
  return availabilityRepo.findScheduleByUserId(userId);
}

/**
 * Get free availability slots for a tutor, excluding booked sessions.
 * Returns availability blocks, sessions, and the tutor's buffer time so the
 * frontend can exclude slots that would be rejected due to buffer overlap.
 *
 * @param {string} userId - Tutor's user id (same as User.id)
 * @returns {Promise<{ availabilities: Array, bookedSessions: Array, bufferMinutes: number }>}
 */
export async function getFreeAvailabilityByUserId(userId) {
  const [blocks, sessions, schedule] = await Promise.all([
    availabilityRepo.findAvailabilityByUserId(userId),
    prisma.session.findMany({
      where: {
        tutorId: userId,
        status: { in: ['Pending', 'Accepted'] }, // Only active/upcoming sessions
        startTimestamp: { gte: new Date() }, // Future sessions only
      },
      select: {
        id: true,
        startTimestamp: true,
        endTimestamp: true,
        status: true,
      },
    }),
    availabilityRepo.findScheduleByUserId(userId),
  ]);

  return {
    availabilities: serializeAvailabilityRows(blocks),
    bookedSessions: sessions,
    bufferMinutes: schedule?.bufferTime ?? 15,
  };
}

export async function upsertSchedule(userId, data) {
  // Validate numeric fields
  if (data.minBookingNotice !== undefined && data.minBookingNotice < 0) {
    throw new Error('minBookingNotice must be >= 0');
  }
  if (data.bufferTime !== undefined && data.bufferTime < 0) {
    throw new Error('bufferTime must be >= 0');
  }
  if (data.maxSessionsPerDay !== undefined && data.maxSessionsPerDay < 1) {
    throw new Error('maxSessionsPerDay must be >= 1');
  }

  return availabilityRepo.upsertSchedule(userId, data);
}
