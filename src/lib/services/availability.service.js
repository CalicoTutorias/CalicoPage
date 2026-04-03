/**
 * Availability Service
 * Business logic for tutor weekly availability and schedule configuration.
 */

import * as availabilityRepo from '../repositories/availability.repository';
import * as calendarService from './calendar.service';

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

function serializeAvailabilityRow(row) {
  if (!row) return row;
  return {
    ...row,
    startTime: formatTimeForApi(row.startTime),
    endTime: formatTimeForApi(row.endTime),
  };
}

function serializeAvailabilityRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(serializeAvailabilityRow);
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
 * @throws Error with code OVERLAP if conflict is found.
 */
export async function createAvailability({ userId, dayOfWeek, startTime, endTime }) {
  if (startTime >= endTime) {
    const err = new Error('startTime must be before endTime');
    err.code = 'INVALID_TIMES';
    throw err;
  }

  const overlap = await availabilityRepo.findOverlap(userId, dayOfWeek, startTime, endTime);
  if (overlap) {
    const err = new Error('El horario se cruza con un bloque existente');
    err.code = 'OVERLAP';
    err.conflictingBlock = overlap;
    throw err;
  }

  const created = await availabilityRepo.createAvailability({ userId, dayOfWeek, startTime, endTime });
  return serializeAvailabilityRow(created);
}

/**
 * Update an existing availability block with overlap validation.
 * @throws Error with code OVERLAP if conflict is found.
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

  const dayOfWeek = data.dayOfWeek ?? existing.dayOfWeek;
  const startTime = data.startTime ?? existing.startTime;
  const endTime = data.endTime ?? existing.endTime;

  if (startTime >= endTime) {
    const err = new Error('startTime must be before endTime');
    err.code = 'INVALID_TIMES';
    throw err;
  }

  const overlap = await availabilityRepo.findOverlap(userId, dayOfWeek, startTime, endTime, id);
  if (overlap) {
    const err = new Error('El horario se cruza con un bloque existente');
    err.code = 'OVERLAP';
    err.conflictingBlock = overlap;
    throw err;
  }

  const updated = await availabilityRepo.updateAvailability(id, { dayOfWeek, startTime, endTime });
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

  // 4. Convert events → unique weekly blocks
  //    Google returns dateTime strings like "2024-01-08T09:00:00-05:00".
  //    We extract the *local* date (for dayOfWeek) and local time (HH:MM) directly
  //    from the string, so no UTC conversion needed.
  const seen = new Set();
  const newBlocks = [];

  for (const event of events) {
    if (event.status === 'cancelled') continue;
    if (!event.start?.dateTime || !event.end?.dateTime) continue; // skip all-day events

    const startStr = event.start.dateTime; // e.g. "2024-01-08T09:00:00-05:00"
    const endStr = event.end.dateTime;

    const startTime = startStr.substring(11, 16); // "09:00"
    const endTime = endStr.substring(11, 16);     // "10:00"

    if (startTime >= endTime) continue;

    // Local date → day of week (0 Sun … 6 Sat)
    const [year, month, day] = startStr.substring(0, 10).split('-').map(Number);
    const dayOfWeek = new Date(year, month - 1, day).getDay();

    const key = `${dayOfWeek}-${startTime}-${endTime}`;
    if (seen.has(key)) continue;
    seen.add(key);

    newBlocks.push({
      dayOfWeek,
      startTime: new Date(`1970-01-01T${startTime}:00.000Z`),
      endTime:   new Date(`1970-01-01T${endTime}:00.000Z`),
    });
  }

  // 5. Diff against current DB state
  const currentBlocks = await availabilityRepo.findAvailabilityByUserId(userId, 500);

  function blockKey(dayOfWeek, startTime, endTime) {
    const s = startTime instanceof Date ? startTime.toISOString().substring(11, 16) : startTime;
    const e = endTime   instanceof Date ? endTime.toISOString().substring(11, 16)   : endTime;
    return `${dayOfWeek}-${s}-${e}`;
  }

  const currentKeys = new Set(currentBlocks.map((b) => blockKey(b.dayOfWeek, b.startTime, b.endTime)));
  const newKeys     = new Set(newBlocks.map((b) => blockKey(b.dayOfWeek, b.startTime, b.endTime)));

  const added   = newBlocks.filter((b) => !currentKeys.has(blockKey(b.dayOfWeek, b.startTime, b.endTime)));
  const removed = currentBlocks.filter((b) => !newKeys.has(blockKey(b.dayOfWeek, b.startTime, b.endTime)));
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
