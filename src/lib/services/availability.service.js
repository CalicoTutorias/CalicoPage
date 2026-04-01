/**
 * Availability Service
 * Business logic for tutor weekly availability and schedule configuration.
 *
 * No Google Calendar dependency — availability is now modeled as
 * recurring weekly blocks (dayOfWeek + startTime/endTime).
 */

import * as availabilityRepo from '../repositories/availability.repository';

// ===== AVAILABILITY BLOCKS =====

export async function getAvailabilityByUserId(userId) {
  return availabilityRepo.findAvailabilityByUserId(userId);
}

export async function getAvailabilityByDay(userId, dayOfWeek) {
  return availabilityRepo.findAvailabilityByDay(userId, dayOfWeek);
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

  return availabilityRepo.createAvailability({ userId, dayOfWeek, startTime, endTime });
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

  return availabilityRepo.updateAvailability(id, { dayOfWeek, startTime, endTime });
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

  return availabilityRepo.replaceAvailabilityForDay(userId, dayOfWeek, blocks);
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
